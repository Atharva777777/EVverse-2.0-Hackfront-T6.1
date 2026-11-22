const path = require('path');
const { chromium } = require(path.resolve(__dirname, '../frontend/node_modules/playwright'));

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:3000/users ...');
  await page.goto('http://localhost:3000/users', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Open drawer menu
  const menuBtn = page.locator('#driver-menu-button');
  await menuBtn.click();
  await page.waitForTimeout(400);

  // Click Journeys
  const journeysTab = page.locator('button:has-text("Journeys")');
  await journeysTab.click();
  await page.waitForTimeout(1000);

  // Set battery to 35%
  const batterySlider = page.locator('#battery');
  if (await batterySlider.isVisible()) {
    await batterySlider.fill('35');
    await page.evaluate(() => {
      const slider = document.querySelector('#battery');
      if (slider) {
        slider.value = 35;
        slider.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(2500);
  }

  // Scroll the main content area inside phone to see charging stops
  await page.evaluate(() => {
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.scrollTop = 700;
  });
  await page.waitForTimeout(500);

  console.log('Capturing corridor stops with Book button...');
  await page.screenshot({ path: path.join(__dirname, '07_corridor_stops_book_button.png'), fullPage: false });

  // If a Book button is visible in corridor stop, click it
  const bookBtn = page.locator('button:has-text("Book")').first();
  if (await bookBtn.isVisible()) {
    console.log('Found Book button on corridor stop! Clicking it...');
    await bookBtn.click();
    await page.waitForTimeout(800);
    console.log('Capturing station detail sheet opened from corridor stop...');
    await page.screenshot({ path: path.join(__dirname, '08_station_opened_from_corridor.png'), fullPage: false });
  }

  await browser.close();
  console.log('Done corridor testing!');
})();
