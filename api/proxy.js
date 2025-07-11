const axios = require('axios');
const { setTimeout } = require('timers/promises');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { url } = req.body;

  if (!url) {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  // Retry logic
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await axios.get(url, {
        timeout: 10000, // 10-second timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400 // Accept 2xx and 3xx status codes
      });

      // Check content length to avoid Vercel response size limits (5MB for free tier)
      const contentLength = response.headers['content-length'] || response.data.length;
      if (contentLength > 5 * 1024 * 1024) {
        throw new Error('Response size exceeds Vercel limit (5MB)');
      }

      res.status(200).json({ content: response.data });
      return;
    } catch (error) {
      attempt++;
      if (attempt === maxRetries) {
        const errorMessage = error.response
          ? `Failed to fetch ${url}: ${error.response.status} ${error.response.statusText}`
          : `Failed to fetch ${url}: ${error.message}`;
        res.status(500).json({ error: errorMessage });
        return;
      }
      // Wait before retrying
      await setTimeout(1000 * attempt);
    }
  }
};
