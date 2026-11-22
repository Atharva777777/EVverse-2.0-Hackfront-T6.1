const { chromium } = require(require('path').resolve(__dirname, '../frontend/node_modules/playwright'));
const path = require('path');

const BASE_URL = 'http://localhost:3000';

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/users`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; pointer-events: none !important; }' });
    await page.waitForTimeout(1000);

    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    await page.locator('#driver-drawer-tab-journeys').click({ force: true });
    
    // Wait for the analysis card to appear
    console.log('Waiting for journey analysis result...');
    await page.waitForSelector('text=Will I Make It?', { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Scroll to the bottom CTA
    const ctaButton = page.locator('button:has-text("Start")').last();
    await ctaButton.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);

    const ctaScreenshotPath = path.resolve(__dirname, 'harmonized_cta_bottom.png');
    await page.screenshot({ path: ctaScreenshotPath });
    console.log(`Saved screenshot: ${ctaScreenshotPath}`);
  } catch (err) {
    console.error('Error during CTA bottom check:', err);
  } finally {
    await browser.close();
  }
}

run();
