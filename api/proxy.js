const axios = require('axios');
const { setTimeout } = require('timers/promises');

module.exports = async (req, res) => {
  // Set CORS headers
  const allowedOrigins = ['https://yourdomain.com', 'http://localhost:3000']; // Add your allowed origins
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*'); // fallback
  }

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

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  };

  const maxRetries = 3;
  let attempt = 0;
  let useBrowserless = false;

  while (attempt < maxRetries) {
    try {
      let response;

      if (useBrowserless) {
        const browserlessToken = process.env.BROWSERLESS_TOKEN;
        if (!browserlessToken) {
          throw new Error('Browserless token not configured. Please set BROWSERLESS_TOKEN in Vercel environment variables.');
        }

        response = await axios.post(
          `https://chrome.browserless.io/content?token=${browserlessToken}`,
          { url, stealth: true, blockAds: true },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
          }
        );

        response.data = response.data.html;

      } else {
        response = await axios.get(url, {
          timeout: 10000,
          headers,
          maxRedirects: 5,
          validateStatus: (status) => status >= 200 && status < 400,
          responseType: 'text'
        });
      }

      // Validate response size
      const contentLength = response.headers['content-length'] || (response.data?.length || 0);
      if (contentLength > 4.5 * 1024 * 1024) {
        throw new Error('Response size exceeds Vercel limit (4.5MB). Try a smaller page or upgrade to Vercel Pro.');
      }

      res.status(200).json({ content: response.data });
      return;

    } catch (error) {
      const status = error.response?.status;
      const errorMessage = error.response
        ? `Failed to fetch ${url}: ${status} ${error.response.statusText}`
        : `Failed to fetch ${url}: ${error.message}`;

      // Switch to Browserless immediately on 403 or 429
      if (!useBrowserless && (status === 403 || status === 429)) {
        useBrowserless = true;
        logError(`Switching to Browserless due to ${status} error: ${errorMessage}`);
        continue; // try again immediately using Browserless
      }

      attempt++;
      logError(`Attempt ${attempt} failed: ${errorMessage}`);

      if (attempt >= maxRetries) {
        res.status(500).json({ error: errorMessage });
        return;
      }

      await setTimeout(1000 * attempt); // exponential backoff
    }
  }
};

// Simple logger
function logError(message) {
  console.error(`[${new Date().toISOString()}] ${message}`);
}
