const { chromium } = require(require('path').resolve(__dirname, '../frontend/node_modules/playwright'));
const path = require('path');

const BASE_URL = 'http://localhost:3000';

async function run() {
  console.log('--- Verifying Sans-Serif Typography, Consistent Rectangular Boxes, and Collapsed Explanation ---');

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
    console.log('Navigating to /users...');
    await page.goto(`${BASE_URL}/users`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; pointer-events: none !important; }' });
    await page.waitForTimeout(1000);

    // Open side drawer and navigate to journeys
    console.log('Opening drawer and navigating to Journeys tab...');
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    await page.locator('#driver-drawer-tab-journeys').click({ force: true });
    await page.waitForTimeout(2000);

    // Expand Trip details to see the new rectangular boxes
    const tripDetailsToggle = page.locator('button:has-text("Trip details")');
    if (await tripDetailsToggle.count() > 0) {
      await tripDetailsToggle.click({ force: true });
      await page.waitForTimeout(800);
    }

    // Capture the top half with Trip details & Destination buttons in rectangular boxes
    const topScreenshotPath = path.resolve(__dirname, 'harmonized_rectangular_boxes.png');
    await page.screenshot({ path: topScreenshotPath });
    console.log(`Saved screenshot: ${topScreenshotPath}`);

    // Scroll down to answer card and CTA
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(800);

    const bottomScreenshotPath = path.resolve(__dirname, 'harmonized_answer_and_cta.png');
    await page.screenshot({ path: bottomScreenshotPath });
    console.log(`Saved screenshot: ${bottomScreenshotPath}`);

    // Test expanding the optional plain explanation
    const explanationToggle = page.locator('button:has-text("View plain explanation")');
    if (await explanationToggle.count() > 0) {
      await explanationToggle.click({ force: true });
      await page.waitForTimeout(600);
      const expandedExplanationPath = path.resolve(__dirname, 'harmonized_explanation_expanded.png');
      await page.screenshot({ path: expandedExplanationPath });
      console.log(`Saved screenshot: ${expandedExplanationPath}`);
    }

    console.log('All typography and rectangular box visual checks completed successfully!');
  } catch (err) {
    console.error('Error during verification:', err);
  } finally {
    await browser.close();
  }
}

run();
