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

  // Browser-like headers for axios fallback
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
        const browserlessToken = process.env.BROWSERLESS_TOKEN;
        if (!browserlessToken) {
          throw new Error('Browserless token not configured. Please set BROWSERLESS_TOKEN in Vercel environment variables.');
        }

        // Browserless custom function to capture HTML, network requests, and console logs
        const browserlessScript = `
          module.exports = async ({ page, context }) => {
            const networkRequests = [];
            const consoleLogs = [];

            // Intercept network requests
            await page.setRequestInterception(true);
            page.on('request', request => {
              networkRequests.push({
                url: request.url(),
                method: request.method(),
                resourceType: request.resourceType(),
                headers: request.headers()
              });
              request.continue();
            });

            // Capture console logs
            page.on('console', msg => {
              consoleLogs.push({
                type: msg.type(),
                text: msg.text(),
                location: msg.location()
              });
            });

            // Navigate to the page
            await page.goto(context.url, { waitUntil: 'networkidle2' });

            // Get page content
            const html = await page.content();

            return { html, networkRequests, consoleLogs };
          };
        `;

        response = await axios.post(
          `https://chrome.browserless.io/function?token=${browserlessToken}`,
          {
            code: browserlessScript,
            context: { url, stealth: true, blockAds: true }
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000 // Increased timeout for headless browser
          }
        );

        // Check content size (Vercel free tier limit: 4.5MB)
        const contentLength = JSON.stringify(response.data).length;
        if (contentLength > 4.5 * 1024 * 1024) {
          throw new Error('Response size exceeds Vercel limit (4.5MB). Try a smaller page or upgrade to Vercel Pro.');
        }

        res.status(200).json({
          content: response.data.html,
          networkRequests: response.data.networkRequests,
          consoleLogs: response.data.consoleLogs
        });
        return;
      } else {
        // Fallback to axios for simple HTML fetch
        response = await axios.get(url, {
          timeout: 10000,
          headers,
          maxRedirects: 5,
          validateStatus: (status) => status >= 200 && status < 400,
          responseType: 'text'
        });

        // Check content length
        const contentLength = response.headers['content-length'] || (response.data?.length || 0);
        if (contentLength > 4.5 * 1024 * 1024) {
          throw new Error('Response size exceeds Vercel limit (4.5MB). Try a smaller page or upgrade to Vercel Pro.');
        }

        // Return only HTML content (no network or console logs with axios)
        res.status(200).json({ content: response.data, networkRequests: [], consoleLogs: [] });
        return;
      }
    } catch (error) {
      attempt++;
      const errorMessage = error.response
        ? `Failed to fetch ${url}: ${error.response.status} ${error.response.statusText}`
        : `Failed to fetch ${url}: ${error.message}`;

      if (attempt === maxRetries) {
        if (!useBrowserless && (error.response?.status === 403 || error.response?.status === 429)) {
          useBrowserless = true;
          attempt = 0;
          logError(`Retrying with Browserless due to ${error.response?.status} error: ${errorMessage}`);
          continue;
        }
        res.status(500).json({ error: errorMessage });
        return;
      }

      logError(`Attempt ${attempt} failed: ${errorMessage}`);
      await setTimeout(1000 * attempt);
    }
  }
};

// Server-side error logging
function logError(message) {
  console.error(`[${new Date().toISOString()}] ${message}`);
}
