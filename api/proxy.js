const fetch = require('node-fetch');

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

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 10000 // 10-second timeout
    });

    if (!response.ok) {
      let errorMessage = `Failed to fetch ${url}: ${response.status} ${response.statusText}`;
      if (response.status === 403) {
        errorMessage += ' (Possible bot detection or access restriction)';
      } else if (response.status === 429) {
        errorMessage += ' (Rate limited by the server)';
      }
      throw new Error(errorMessage);
    }

    const content = await response.text();
    res.status(200).json({ content });
  } catch (error) {
    res.status(500).json({
      error: error.message || 'An unexpected error occurred while fetching the website'
    });
  }
};
