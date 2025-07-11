const puppeteer = require('puppeteer');

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

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // Navigate to the URL
    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    if (!response.ok()) {
      let errorMessage = `Failed to fetch ${url}: ${response.status()} ${response.statusText()}`;
      if (response.status() === 403) {
        errorMessage += ' (Possible bot detection or access restriction)';
      } else if (response.status() === 429) {
        errorMessage += ' (Rate limited by the server)';
      }
      throw new Error(errorMessage);
    }

    // Get page content
    const content = await page.content();
    await browser.close();

    res.status(200).json({ content });
  } catch (error) {
    if (browser) await browser.close();
    res.status(500).json({
      error: error.message || 'An unexpected error occurred while fetching the website'
    });
  }
};
