// Vercel serverless function to proxy API requests to SureLC
export default async function handler(req, res) {
  // Set CORS headers to allow requests from our Vercel deployment
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Extract the path from the request
    const path = req.query.path || '';
    
    // Build the target URL
    const baseUrl = 'https://surelc.surancebay.com/sbweb/ws';
    const targetUrl = `${baseUrl}${path}`;
    
    // Get authorization header from the request
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    // Forward the request to the target API
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });
    
    // Get the response data
    const data = await response.json();
    
    // Return the response
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: 'Proxy request failed', details: error.message });
  }
}
