// test-jwt.js
import { SignJWT } from 'jose';

async function generateJwt() {
  const sharedSecret = '58A14073BC6612B0A26C4101759DF0BE';
  const secret = new TextEncoder().encode(sharedSecret);
  const jwt = await new SignJWT({ sub: 'nft-image-fetch' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(secret);
  console.log('Generated JWT:', jwt);
  return jwt;
}

generateJwt();