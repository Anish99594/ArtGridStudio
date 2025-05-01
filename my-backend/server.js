require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Readable } = require('stream');
const fetch = require('node-fetch'); // Added for proxy endpoint

const app = express();

app.use(cors({
  origin: 'http://localhost:5173', // Adjust to your frontend URL if different
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Load service account credentials
const SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT)
  : (() => { throw new Error('Service account credentials not provided in GOOGLE_SERVICE_ACCOUNT'); })();

// Initialize Google Drive API
const auth = new google.auth.GoogleAuth({
  credentials: SERVICE_ACCOUNT,
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});
const drive = google.drive({ version: 'v3', auth });

// Middleware to verify JWT
const verifyJwt = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  console.log('Received JWT:', token); // Debug: Log the token
  console.log('SHARED_SECRET:', process.env.SHARED_SECRET); // Debug: Log the secret
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.SHARED_SECRET);
    console.log('Decoded JWT:', decoded); // Debug: Log decoded payload
    next();
  } catch (error) {
    console.error('JWT verification error:', error.message); // Debug: Log error
    res.status(401).json({ error: 'Invalid token', details: error.message });
  }
};

// Endpoint to upload file to Google Drive
app.post('/upload-to-drive', verifyJwt, async (req, res) => {
  try {
    const { fileName, fileContent, mimeType, isJson } = req.body;
    if (!fileName || !fileContent || !mimeType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Decode base64 file content
    const buffer = Buffer.from(fileContent, 'base64');
    console.log(`Decoded file content for ${fileName}: Buffer of length ${buffer.length}`); // Debug: Log buffer info

    // Create a readable stream from the buffer
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null); // Signal end of stream

    // Upload file to Google Drive
    const fileMetadata = {
      name: fileName,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID || 'root'],
    };
    const media = {
      mimeType: mimeType,
      body: stream,
    };
    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
    });

    const fileId = response.data.id;
    console.log(`Uploaded file ${fileName} with ID: ${fileId}`); // Debug: Log file ID

    // Set file permissions to public ("Anyone with the link")
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    // Get shareable link
    const linkResponse = await drive.files.get({
      fileId: fileId,
      fields: 'webContentLink, webViewLink',
    });

    const shareableLink = linkResponse.data.webContentLink;
    res.json({ fileId, shareableLink });
  } catch (error) {
    console.error('Error uploading to Google Drive:', error);
    res.status(500).json({ error: 'Failed to upload file', details: error.message });
  }
});

// Endpoint to fetch metadata from Google Drive
app.get('/fetch-drive-metadata', verifyJwt, async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || !url.match(/^https:\/\/drive\.google\.com\/uc\?id=[a-zA-Z0-9_-]+&export=download$/)) {
      return res.status(400).json({ error: 'Invalid or missing Google Drive URL' });
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Failed to fetch metadata: ${response.statusText}` });
    }

    const metadata = await response.json();
    res.json(metadata);
  } catch (error) {
    console.error('Error fetching Google Drive metadata:', error);
    res.status(500).json({ error: 'Failed to fetch metadata', details: error.message });
  }
});

// Endpoint to proxy Google Drive images
app.get('/proxy-image', verifyJwt, async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || !url.match(/^https:\/\/drive\.google\.com\/uc\?id=[a-zA-Z0-9_-]+&export=download$/)) {
      return res.status(400).json({ error: 'Invalid or missing Google Drive image URL' });
    }

    console.log(`Proxying image from: ${url}`); // Debug: Log the image URL
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'image/*',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      return res.status(response.status).json({ error: `Failed to fetch image: ${response.statusText}` });
    }

    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('image')) {
      console.error(`Invalid content type: ${contentType}`);
      return res.status(400).json({ error: `Invalid content type: ${contentType}` });
    }

    // Set response headers
    res.set({
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': 'http://localhost:5173', // Match CORS origin
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Authorization',
    });

    // Stream the image content
    response.body.pipe(res);
  } catch (error) {
    console.error('Error proxying image:', error);
    res.status(500).json({ error: 'Failed to proxy image', details: error.message });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));