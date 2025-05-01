const { SignJWT } = require('jose');

async function generateJwt() {
  const secret = new TextEncoder().encode('58A14073BC6612B0A26C4101759DF0BE');
  const jwt = await new SignJWT({ sub: 'nft-fetch' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(secret);
  console.log('Generated JWT:', jwt);
  return jwt;
}

generateJwt().catch(console.error);