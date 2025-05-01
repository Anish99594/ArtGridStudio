import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwtVerify } from 'jose';

interface Bindings {
  PINATA_JWT: string;
  GATEWAY_URL: string;
  SERVER_API_KEY: string;
  PINATA_GATEWAY_TOKEN: string;
  SHARED_SECRET: string;
}

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'https://your-production-domain.com'],
  allowMethods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
  credentials: true,
}));

app.use('*', async (c, next) => {
  const path = c.req.path;
  if (path.startsWith('/ipfs/') || path.startsWith('/api/v0/add') || path.startsWith('/upload-json') || path.startsWith('/verify-pin')) {
    const authHeader = c.req.header('Authorization') || c.req.query('token');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!token) {
      console.error('Missing authorization token for path:', path);
      return c.json({ error: 'Missing authorization token' }, { status: 401 });
    }
    try {
      const secret = new TextEncoder().encode(c.env.SHARED_SECRET);
      const { payload } = await jwtVerify(token, secret);
      console.log('JWT verified for path:', path, 'sub:', payload.sub);
      if ((path.startsWith('/api/v0/add') || path.startsWith('/upload-json') || path.startsWith('/verify-pin')) && payload.sub !== 'nft-upload') {
        console.error('Invalid JWT sub for upload:', payload.sub);
        return c.json({ error: 'Invalid JWT subject' }, { status: 401 });
      }
    } catch (error) {
      console.error('JWT verification failed for path:', path, 'Error:', error.message);
      return c.json({ error: 'Invalid authorization token', details: error.message }, { status: 401 });
    }
  } else {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || authHeader !== `Bearer ${c.env.SERVER_API_KEY}`) {
      console.error('Unauthorized access to path:', path);
      return c.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  await next();
});

const imageCache = new Map();

app.get('/verify-pin', async (c) => {
  const cid = c.req.query('cid');
  if (!cid) {
    return c.json({ error: 'CID is required' }, { status: 400 });
  }
  try {
    const response = await fetch(`https://api.pinata.cloud/v3/files/private?cid=${cid}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${c.env.PINATA_JWT}`,
      },
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No response body');
      throw new Error(`Pin check failed: ${response.status} ${response.statusText}: ${errorText}`);
    }
    const result = await response.json();
    console.log(`Pin verification for CID ${cid}:`, result);
    const isPinned = result.data.files.some((file) => file.cid === cid);
    return c.json({ isPinned }, { status: 200 });
  } catch (error) {
    console.error('Pin verification error for CID:', cid, error);
    return c.json({ error: 'Pin verification failed', details: error.message }, { status: 500 });
  }
});

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

app.get('/api/v0/sign-upload', async (c) => {
  try {
    const response = await fetch('https://uploads.pinata.cloud/v3/files/sign', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.env.PINATA_JWT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        date: Math.floor(Date.now() / 1000),
        expires: 60,
        allow_mime_types: ['image/*'],
      }),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No response body');
      throw new Error(`Failed to generate signed URL: ${response.status} ${response.statusText}: ${errorText}`);
    }
    const { data: url } = await response.json();
    return c.json({ url }, { status: 200 });
  } catch (error) {
    console.error('Presigned URL error:', error);
    return c.json({ error: 'Failed to generate presigned URL', details: error.message }, { status: 500 });
  }
});

app.post('/api/v0/add', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided or invalid file' }, { status: 400 });
    }

    const uploadForm = new FormData();
    uploadForm.append('file', file);
    uploadForm.append('network', 'private');
    uploadForm.append('name', file.name);

    const response = await fetch('https://uploads.pinata.cloud/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.env.PINATA_JWT}`,
      },
      body: uploadForm,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No response body');
      throw new Error(`Failed to upload file to Pinata: ${response.status} ${response.statusText}: ${errorText}`);
    }

    const result = await response.json();
    const cid = result.data.cid;
    if (!cid) {
      return c.json({ error: 'Upload to Pinata failed: No CID returned' }, { status: 500 });
    }

    console.log('File uploaded to Pinata:', { cid, name: file.name });
    return c.json({ cid }, { status: 200 });
  } catch (error) {
    console.error('File upload error:', error);
    return c.json({ error: 'Failed to upload file to Pinata', details: error.message }, { status: 500 });
  }
});

app.post('/upload-json', async (c) => {
  try {
    const jsonData = await c.req.json();
    const blob = new Blob([JSON.stringify(jsonData)], { type: 'application/json' });
    const file = new File([blob], 'metadata.json', { type: 'application/json' });

    const uploadForm = new FormData();
    uploadForm.append('file', file);
    uploadForm.append('network', 'private');
    uploadForm.append('name', 'metadata.json');

    const response = await fetch('https://uploads.pinata.cloud/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.env.PINATA_JWT}`,
      },
      body: uploadForm,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No response body');
      throw new Error(`Failed to upload JSON to Pinata: ${response.status} ${response.statusText}: ${errorText}`);
    }

    const result = await response.json();
    const cid = result.data.cid;
    if (!cid) {
      return c.json({ error: 'Upload to Pinata failed: No CID returned' }, { status: 500 });
    }

    console.log('JSON uploaded to Pinata:', { cid });
    return c.json({ cid }, { status: 200 });
  } catch (error) {
    console.error('JSON upload error:', error);
    return c.json({ error: 'Failed to upload JSON to Pinata', details: error.message }, { status: 500 });
  }
});

app.get('/ipfs/:cid', async (c) => {
  const cid = c.req.param('cid');
  const retryCount = 3;
  const baseDelay = 1000;
  const fallbackGateway = 'ipfs.io';

  try {
    if (!cid.match(/^(baf[0-9a-z]+|Qm[0-9a-zA-Z]+)/)) {
      console.error(`Invalid CID format: ${cid}`);
      return c.json({ error: 'Invalid CID format' }, { status: 400 });
    }

    console.log(`Fetching metadata for CID ${cid}`);
    let responseData;
    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const url = `https://${c.env.GATEWAY_URL}/ipfs/${cid}?pinataGatewayToken=${c.env.PINATA_GATEWAY_TOKEN}`;
        console.log(`Attempt ${attempt}: Fetching Pinata URL: ${url}`);
        const fetchResponse = await fetch(url, {
          headers: { Accept: 'application/json' },
          redirect: 'follow',
        });

        if (!fetchResponse.ok) {
          const errorText = await fetchResponse.text().catch(() => 'No response body');
          console.error(`Pinata fetch failed: ${fetchResponse.status} ${fetchResponse.statusText}, Body: ${errorText}`);
          throw new Error(`Pinata fetch failed: ${fetchResponse.status} ${fetchResponse.statusText}`);
        }

        const contentType = fetchResponse.headers.get('content-type') || 'application/json';
        if (!contentType.includes('json')) {
          console.error(`Expected JSON content-type, got: ${contentType}`);
          throw new Error(`Expected JSON content-type, got: ${contentType}`);
        }

        responseData = await fetchResponse.json();
        console.log(`Successfully fetched metadata from Pinata for CID ${cid}`);
        break;
      } catch (error) {
        console.error(`Pinata fetch attempt ${attempt} failed for CID ${cid}:`, error);
        if (attempt === retryCount) {
          console.log(`Trying fallback gateway for CID ${cid}: ${fallbackGateway}`);
          try {
            const fallbackUrl = `https://${fallbackGateway}/ipfs/${cid}`;
            console.log(`Attempting fallback fetch: ${fallbackUrl}`);
            const fallbackResponse = await fetch(fallbackUrl, {
              headers: { Accept: 'application/json' },
              redirect: 'follow',
            });

            if (!fallbackResponse.ok) {
              const errorText = await fallbackResponse.text().catch(() => 'No response body');
              console.error(`Fallback fetch failed: ${fallbackResponse.status} ${fallbackResponse.statusText}, Body: ${errorText}`);
              throw new Error(`Fallback fetch failed: ${fallbackResponse.status} ${fallbackResponse.statusText}`);
            }

            const contentType = fallbackResponse.headers.get('content-type') || 'application/json';
            if (!contentType.includes('json')) {
              console.error(`Expected JSON content-type in fallback, got: ${contentType}`);
              throw new Error(`Expected JSON content-type, got: ${contentType}`);
            }

            responseData = await fallbackResponse.json();
            console.log(`Successfully fetched metadata from fallback gateway for CID ${cid}`);
            break;
          } catch (fallbackError) {
            console.error(`Fallback fetch failed for CID ${cid}:`, fallbackError);
            throw new Error(`All fetch attempts failed: Pinata and fallback gateway`);
          }
        }
        await new Promise((resolve) => setTimeout(resolve, baseDelay * Math.pow(2, attempt)));
      }
    }

    return c.json(responseData, { status: 200 });
  } catch (error) {
    console.error('Error fetching IPFS metadata for CID:', cid, error);
    if (error.message.includes('timeout')) {
      return c.json({ error: 'Request timed out' }, { status: 504 });
    }
    return c.json(
      { error: 'Failed to fetch metadata from Pinata and fallback gateway', details: error.message },
      { status: 500 }
    );
  }
});

app.get('/ipfs/image/:cid', async (c) => {
  const cid = c.req.param('cid');
  const retryCount = 3;
  const baseDelay = 1000;
  const fallbackGateway = 'ipfs.io';

  try {
    if (imageCache.has(cid)) {
      console.log(`Serving cached image for CID ${cid}`);
      const { arrayBuffer, contentType } = imageCache.get(cid);
      return new Response(arrayBuffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=31536000',
        },
      });
    }

    if (!cid.match(/^(baf[0-9a-z]+|Qm[0-9a-zA-Z]+)/)) {
      console.error(`Invalid CID format: ${cid}`);
      return c.json({ error: 'Invalid CID format' }, { status: 400 });
    }

    console.log(`Fetching image for CID ${cid}`);
    let arrayBuffer;
    let contentType = 'image/jpeg';

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const url = `https://${c.env.GATEWAY_URL}/ipfs/${cid}?pinataGatewayToken=${c.env.PINATA_GATEWAY_TOKEN}`;
        console.log(`Attempt ${attempt}: Fetching Pinata URL: ${url}`);
        const fetchResponse = await fetch(url, {
          headers: { Accept: 'image/*' },
          redirect: 'follow',
        });

        if (!fetchResponse.ok) {
          const errorText = await fetchResponse.text().catch(() => 'No response body');
          console.error(`Pinata fetch failed: ${fetchResponse.status} ${fetchResponse.statusText}, Body: ${errorText}`);
          throw new Error(`Pinata fetch failed: ${fetchResponse.status} ${fetchResponse.statusText}`);
        }

        contentType = fetchResponse.headers.get('content-type') || 'image/jpeg';
        if (!contentType.startsWith('image/')) {
          throw new Error(`Expected image content-type, got: ${contentType}`);
        }

        arrayBuffer = await fetchResponse.arrayBuffer();
        console.log(`Successfully fetched image from Pinata for CID ${cid}`);
        break;
      } catch (error) {
        console.error(`Pinata fetch attempt ${attempt} failed for CID ${cid}:`, error);
        if (attempt === retryCount) {
          console.log(`Trying fallback gateway for CID ${cid}: ${fallbackGateway}`);
          try {
            const fallbackUrl = `https://${fallbackGateway}/ipfs/${cid}`;
            console.log(`Attempting fallback fetch: ${fallbackUrl}`);
            const fallbackResponse = await fetch(fallbackUrl, {
              headers: { Accept: 'image/*' },
              redirect: 'follow',
            });

            if (!fallbackResponse.ok) {
              const errorText = await fallbackResponse.text().catch(() => 'No response body');
              console.error(`Fallback fetch failed: ${fallbackResponse.status} ${fallbackResponse.statusText}, Body: ${errorText}`);
              throw new Error(`Fallback fetch failed: ${fallbackResponse.status} ${fallbackResponse.statusText}`);
            }

            contentType = fallbackResponse.headers.get('content-type') || 'image/jpeg';
            if (!contentType.startsWith('image/')) {
              throw new Error(`Expected image content-type, got: ${contentType}`);
            }

            arrayBuffer = await fallbackResponse.arrayBuffer();
            console.log(`Successfully fetched image from fallback gateway for CID ${cid}`);
            break;
          } catch (fallbackError) {
            console.error(`Fallback fetch failed for CID ${cid}:`, fallbackError);
            throw new Error(`All fetch attempts failed: Pinata and fallback gateway`);
          }
        }
        await new Promise((resolve) => setTimeout(resolve, baseDelay * Math.pow(2, attempt)));
      }
    }

    imageCache.set(cid, { arrayBuffer, contentType });

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    console.error('Error fetching IPFS image for CID:', cid, error);
    if (error.message.includes('timeout')) {
      return c.json({ error: 'Request timed out' }, { status: 504 });
    }
    return c.json(
      { error: 'Failed to fetch image from Pinata and fallback gateway', details: error.message },
      { status: 500 }
    );
  }
});

app.all('*', (c) => {
  return c.json({ error: 'Not Found' }, { status: 404 });
});

export default app;