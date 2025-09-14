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
    
    // Build headers, preserving client Accept and Content-Type where present
    const incomingAccept = req.headers.accept;
    const incomingContentType = req.headers['content-type'];

    const headers = {
      'Authorization': authHeader,
      // Pass through Accept header if provided (needed for CSV/text endpoints)
      ...(incomingAccept ? { 'Accept': incomingAccept } : {}),
      // Only set Content-Type if the incoming request had one and has a body
      ...(incomingContentType && req.method !== 'GET' && req.method !== 'HEAD'
        ? { 'Content-Type': incomingContentType }
        : {}),
    };

    // Forward the request to the target API
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      // Avoid sending a body for GET/HEAD; otherwise forward as-is
      body: req.method !== 'GET' && req.method !== 'HEAD' ? (
        typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
      ) : undefined,
    });

    // Detect response content type and forward appropriately
    const contentType = response.headers.get('content-type') || '';

    // Propagate headers that are useful to the client
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    if (contentType.includes('application/json')) {
      const data = await response.json().catch(async () => ({ raw: await response.text() }));
      return res.status(response.status).json(data);
    }

    // Default: treat as text/binary (CSV, plain text, etc.)
    const text = await response.text();
    return res.status(response.status).send(text);
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: 'Proxy request failed', details: error.message });
  }
}
