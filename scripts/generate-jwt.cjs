// Polyfill crypto if not available
if (!global.crypto) {
    global.crypto = require('crypto').webcrypto;
  }
  
  async function generateJwt() {
    try {
      // Dynamically import the jose library
      const { SignJWT } = await import('jose');
  
      const sharedSecret = '58A14073BC6612B0A26C4101759DF0BE';
      const secret = new TextEncoder().encode(sharedSecret);
      const jwt = await new SignJWT({ sub: 'nft-fetch' })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('1h')
        .sign(secret);
      console.log('Generated JWT:', jwt);
      return jwt;
    } catch (error) {
      console.error('Error generating JWT:', error);
      throw error;
    }
  }
  
  generateJwt().catch(console.error);