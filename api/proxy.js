const axios = require('axios');
const { setTimeout } = require('timers/promises');

// Domains that typically require Browserless
const BROWSERLESS_DOMAINS = ['quizardv2.dev-boi.xyz'];

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

  // Check if this is a domain that typically requires Browserless
  let useBrowserless = BROWSERLESS_DOMAINS.some(domain => url.includes(domain));
  
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

  while (attempt < maxRetries) {
    try {
      let response;

      if (useBrowserless) {
        const browserlessToken = process.env.BROWSERLESS_TOKEN;
        if (!browserlessToken) {
          throw new Error('Browserless token not configured. Please set BROWSERLESS_TOKEN in Vercel environment variables.');
        }

        logError(`Attempting to fetch via Browserless (attempt ${attempt + 1})`);
        
        response = await axios.post(
          `https://chrome.browserless.io/content?token=${browserlessToken}`,
          { 
            url, 
            options: {
              stealth: true,
              blockAds: true,
              userAgent: headers['User-Agent'],
              waitFor: 2000 // wait for 2 seconds to ensure page loads
            }
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 20000 // 20 seconds
          }
        );
        response.data = response.data.html;
      } else {
        logError(`Attempting direct fetch (attempt ${attempt + 1})`);
        response = await axios.get(url, {
          timeout: 10000,
          headers,
          maxRedirects: 5,
          validateStatus: (status) => status >= 200 && status < 400,
          responseType: 'text'
        });
      }

      // Check content length
      const contentLength = response.headers['content-length'] || (response.data?.length || 0);
      if (contentLength > 4.5 * 1024 * 1024) {
        throw new Error('Response size exceeds Vercel limit (4.5MB). Try a smaller page or upgrade to Vercel Pro.');
      }

      res.status(200).json({ content: response.data });
      return;
    } catch (error) {
      attempt++;
      const errorMessage = error.response
        ? `Failed to fetch ${url}: ${error.response.status} ${error.response.statusText}`
        : `Failed to fetch ${url}: ${error.message}`;

      logError(`Attempt ${attempt} failed: ${errorMessage}`);

      if (attempt === maxRetries) {
        if (!useBrowserless && (error.response?.status === 403 || error.response?.status === 429)) {
          useBrowserless = true;
          attempt = 0; // Reset attempts for Browserless
          logError(`Switching to Browserless due to ${error.response?.status} error`);
          continue;
        }
        res.status(500).json({ 
          error: errorMessage,
          details: error.response?.data,
          finalAttempt: true
        });
        return;
      }

      await setTimeout(1000 * attempt);
    }
  }
};

function logError(message) {
  console.error(`[${new Date().toISOString()}] ${message}`);
}
