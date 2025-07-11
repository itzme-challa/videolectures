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

  // Browser-like headers to bypass bot detection
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

  // Retry logic
  const maxRetries = 3;
  let attempt = 0;
  let useBrowserless = false;

  while (attempt < maxRetries) {
    try {
      let response;

      if (useBrowserless) {
        // Optional: Use Browserless.io for protected sites
        const browserlessToken = process.env.BROWSERLESS_TOKEN; // Set in Vercel environment variables
        if (!browserlessToken) {
          throw new Error('Browserless token not configured');
        }

        response = await axios.post(
          `https://chrome.browserless.io/content?token=${browserlessToken}`,
          { url },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000 // 30-second timeout for Browserless
          }
        );
        response.data = response.data.html; // Browserless returns HTML in response.data.html
      } else {
        // Standard HTTP fetch with axios
        response = await axios.get(url, {
          timeout: 10000, // 10-second timeout
          headers,
          maxRedirects: 5,
          validateStatus: (status) => status >= 200 && status < 400,
          responseType: 'text'
        });
      }

      // Check content length (Vercel free tier limit: 4.5MB)
      const contentLength = response.headers['content-length'] || (response.data?.length || 0);
      if (contentLength > 4.5 * 1024 * 1024) {
        throw new Error('Response size exceeds Vercel limit (4.5MB)');
      }

      res.status(200).json({ content: response.data });
      return;
    } catch (error) {
      attempt++;
      const errorMessage = error.response
        ? `Failed to fetch ${url}: ${error.response.status} ${error.response.statusText}`
        : `Failed to fetch ${url}: ${error.message}`;

      if (attempt === maxRetries) {
        // Fallback to Browserless on last attempt if not already tried
        if (!useBrowserless && error.response?.status === 403) {
          useBrowserless = true;
          attempt = 0; // Reset attempts for Browserless
          logError(`Retrying with Browserless due to 403 error: ${errorMessage}`);
          continue;
        }
        res.status(500).json({ error: errorMessage });
        return;
      }

      // Log error for debugging
      logError(`Attempt ${attempt} failed: ${errorMessage}`);
      await setTimeout(1000 * attempt); // Exponential backoff
    }
  }
};

// Basic error logging (replace with a proper logging service in production)
function logError(message) {
  console.error(`[${new Date().toISOString()}] ${message}`);
}
