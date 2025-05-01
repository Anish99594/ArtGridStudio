import { SignJWT } from 'jose';
import fetch from 'node-fetch'; // Use node-fetch for Node.js compatibility
import { webcrypto } from 'node:crypto';

// Polyfill global crypto for jose
global.crypto = webcrypto;

// Environment variables (matching .env.local and .dev.vars)
const SERVER_URL = 'http://localhost:8787';
const GATEWAY_URL = 'https://chocolate-important-eagle-144.mypinata.cloud';
const SHARED_SECRET = '58A14073BC6612B0A26C4101759DF0BE';
const PINATA_GATEWAY_TOKEN = 'Q-FNhHAKXfaalglh2PFeo2rwWGOVtdqtQx2DfdlfcqUwpQIdSpbZO8XNw58CR6_G';

// Generate JWT for server authentication
async function generateJwt(sub) {
  try {
    const secret = new TextEncoder().encode(SHARED_SECRET);
    const jwt = await new SignJWT({ sub })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(secret);
    console.log(`Generated JWT for sub=${sub}:`, jwt);
    return jwt;
  } catch (error) {
    console.error('Error generating JWT:', error.message);
    throw error;
  }
}

// Fetch content from server or gateway
async function testFetch(endpoint, cid, sub, useGateway = false) {
  try {
    const baseUrl = useGateway ? GATEWAY_URL : SERVER_URL;
    const url = `${baseUrl}${endpoint}/${cid}`;
    const headers = useGateway
      ? { 'pinata_gateway_token': PINATA_GATEWAY_TOKEN }
      : { Authorization: `Bearer ${await generateJwt(sub)}` };

    console.log(`Fetching ${url}...`);
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    console.log(`Response for ${endpoint}/${cid}: ${response.status} ${response.statusText}`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'No JSON response' }));
      console.error('Error data:', errorData);
      return;
    }

    const contentType = response.headers.get('content-type');
    console.log('Content-Type:', contentType);

    if (endpoint.includes('/image/')) {
      if (!contentType.startsWith('image/')) {
        console.error('Expected image content-type, got:', contentType);
        return;
      }
      console.log('Image fetched successfully (binary data)');
      // Optionally save image to file for verification
      const buffer = await response.buffer();
      require('fs').writeFileSync(`test-image-${cid.slice(0, 8)}.jpg`, buffer);
      console.log(`Image saved as test-image-${cid.slice(0, 8)}.jpg`);
    } else {
      const data = await response.json();
      console.log('Metadata:', data);
    }
  } catch (error) {
    console.error(`Error fetching ${endpoint}/${cid}:`, error.message);
  }
}

// Run tests for metadata and image endpoints
async function runTests() {
  // Known CIDs from CreateNFT.jsx
  const metadataCid = 'bafkreih6fy6ghvnyk63szuy2huricogobwtyel5n3lwlbmsgd43avzovce'; // Bronze tier
  const imageCid = 'bafkreih6fy6ghvnyk63szuy2huricogobwtyel5n3lwlbmsgd43avzovce'; // Replace with actual image CID from metadata

  console.log('Testing /ipfs/:cid (metadata) on local server...');
  await testFetch('/ipfs', metadataCid, 'nft-fetch');

  console.log('\nTesting /ipfs/image/:cid (image) on local server...');
  await testFetch('/ipfs/image', imageCid, 'nft-image-fetch');

  console.log('\nTesting /ipfs/:cid (metadata) on Pinata gateway...');
  await testFetch('/ipfs', metadataCid, 'nft-fetch', true);

  console.log('\nTesting /ipfs/image/:cid (image) on Pinata gateway...');
  await testFetch('/ipfs/image', imageCid, 'nft-image-fetch', true);
}

runTests().catch((error) => {
  console.error('Test run failed:', error.message);
  process.exit(1);
});