// worker.js
async function handleRequest(request) {
    try {
      const url = new URL(request.url);
      const cid = url.pathname.split('/ipfs/')[1];
      if (!cid) {
        return new Response(JSON.stringify({ error: 'Missing CID' }), {
          status: 400,
          headers: corsHeaders(),
        });
      }
  
      const ipfsResponse = await fetch(`https://ipfs.io/ipfs/${cid}`);
      if (!ipfsResponse.ok) {
        throw new Error(`IPFS fetch failed: ${ipfsResponse.status}`);
      }
  
      const data = await ipfsResponse.json();
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(),
        },
      });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: corsHeaders(),
      });
    }
  }
  
  function corsHeaders() {
    return {
      'Access-Control-Allow-Origin': '*', // Or specify 'http://localhost:5173' for development
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    };
  }
  
  // Handle CORS preflight requests
  addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method === 'OPTIONS') {
      event.respondWith(
        new Response(null, {
          status: 204,
          headers: corsHeaders(),
        })
      );
    } else {
      event.respondWith(handleRequest(request));
    }
  });