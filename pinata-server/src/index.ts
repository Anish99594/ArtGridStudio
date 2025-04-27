import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { PinataSDK } from 'pinata';

interface Bindings {
  PINATA_JWT: string;
  GATEWAY_URL: string;
  SERVER_API_KEY: string;
  PINATA_GATEWAY_TOKEN?: string;
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
  if (path.startsWith('/ipfs/')) {
    await next();
    return;
  }
  const authHeader = c.req.header('Authorization');
  if (!authHeader || authHeader !== `Bearer ${c.env.SERVER_API_KEY}`) {
    return c.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await next();
});

const imageCache = new Map();

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

app.get('/presigned_url', async (c) => {
  const pinata = new PinataSDK({
    pinataJwt: c.env.PINATA_JWT,
    pinataGateway: c.env.GATEWAY_URL,
  });

  try {
    const url = await pinata.upload.createSignedURL({
      expires: 60,
    });
    return c.json({ url }, { status: 200 });
  } catch (error) {
    console.error('Presigned URL error:', error);
    return c.json({ error: 'Failed to generate presigned URL', details: error.message }, { status: 500 });
  }
});

app.post('/upload-file', async (c) => {
  const pinata = new PinataSDK({
    pinataJwt: c.env.PINATA_JWT,
    pinataGateway: c.env.GATEWAY_URL,
  });

  try {
    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided or invalid file' }, { status: 400 });
    }

    const uploadResult = await pinata.upload.file(file);
    const cid = uploadResult.IpfsHash || uploadResult.cid;

    if (!cid) {
      return c.json({ error: 'Upload to Pinata failed' }, { status: 500 });
    }

    console.log('File uploaded to Pinata:', { cid, isPinned: uploadResult.isPinned });
    return c.json({ cid }, { status: 200 });
  } catch (error) {
    console.error('File upload error:', error);
    return c.json({ error: 'Failed to upload file to Pinata', details: error.message }, { status: 500 });
  }
});

app.post('/upload-json', async (c) => {
  const pinata = new PinataSDK({
    pinataJwt: c.env.PINATA_JWT,
    pinataGateway: c.env.GATEWAY_URL,
  });

  try {
    const jsonData = await c.req.json();
    const uploadResult = await pinata.upload.json(jsonData);
    const cid = uploadResult.IpfsHash || uploadResult.cid;

    if (!cid) {
      return c.json({ error: 'Upload to Pinata failed' }, { status: 500 });
    }

    console.log('JSON uploaded to Pinata:', { cid, isPinned: uploadResult.isPinned });
    return c.json({ cid }, { status: 200 });
  } catch (error) {
    console.error('JSON upload error:', error);
    return c.json({ error: 'Failed to upload JSON to Pinata', details: error.message }, { status: 500 });
  }
});

app.get('/ipfs/:cid', async (c) => {
  const pinata = new PinataSDK({
    pinataJwt: c.env.PINATA_JWT,
    pinataGateway: c.env.GATEWAY_URL,
  });

  const cid = c.req.param('cid');

  try {
    if (!cid.match(/^(baf[0-9a-z]+|Qm[0-9a-zA-Z]+)/)) {
      return c.json({ error: 'Invalid CID format' }, { status: 400 });
    }

    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), 10000));
    const response = await Promise.race([pinata.gateways.get(cid), timeoutPromise]);
    return c.json(response.data, { status: 200 });
  } catch (error) {
    console.error('Error fetching IPFS metadata for CID:', cid, error);
    if (error.message === 'Request timed out') {
      return c.json({ error: 'Request timed out' }, { status: 504 });
    }
    return c.json({ error: 'Failed to fetch metadata from Pinata', details: error.message }, { status: 500 });
  }
});

app.get('/ipfs/image/:cid', async (c) => {
  const cid = c.req.param('cid');
  const retryCount = 3;
  const baseDelay = 1000;

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

    console.log(`Fetching image for CID ${cid} using direct fetch`);

    let arrayBuffer;
    let contentType = 'image/jpeg'; // Default fallback

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const url = `https://${c.env.GATEWAY_URL}/ipfs/${cid}?pinataGatewayToken=${c.env.PINATA_GATEWAY_TOKEN}`;
        const fetchResponse = await fetch(url, {
          headers: { Accept: 'image/*' },
          redirect: 'follow',
        });

        console.log(`Fetch response for CID ${cid}:`, {
          status: fetchResponse.status,
          statusText: fetchResponse.statusText,
          headers: Object.fromEntries(fetchResponse.headers.entries()),
        });

        if (!fetchResponse.ok) {
          throw new Error(`Fetch failed: ${fetchResponse.status} ${fetchResponse.statusText}`);
        }

        arrayBuffer = await fetchResponse.arrayBuffer();
        contentType = fetchResponse.headers.get('content-type') || 'image/jpeg';

        if (!contentType.startsWith('image/')) {
          throw new Error(`Fetched content is not an image: ${contentType}`);
        }

        break;
      } catch (error) {
        console.error(`Fetch attempt ${attempt} failed for CID ${cid}:`, error);
        if (attempt === retryCount) {
          throw error;
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
      { error: 'Failed to fetch image from Pinata', details: error.message },
      { status: 500 }
    );
  }
});

app.all('*', (c) => {
  return c.json({ error: 'Not Found' }, { status: 404 });
});

export default app;