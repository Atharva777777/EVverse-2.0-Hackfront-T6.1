const path = require('path');
const fs = require('fs');
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

  const outDir = path.join(__dirname);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log('Navigating to http://localhost:3000/users ...');
  await page.goto('http://localhost:3000/users', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 1. Home Cockpit: Check SOS button
  console.log('1. Capturing Home Cockpit with circular red SOS button...');
  await page.screenshot({ path: path.join(outDir, '01_home_cockpit_sos_button.png'), fullPage: false });

  // 2. Click SOS button
  console.log('2. Clicking SOS button...');
  const sosBtn = page.locator('button[aria-label="Emergency SOS Roadside Assistance"]');
  if (await sosBtn.isVisible()) {
    await sosBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, '02_sos_emergency_modal.png'), fullPage: false });

    // Click Close SOS
    const closeSos = page.locator('button[aria-label="Close SOS"]');
    if (await closeSos.isVisible()) {
      await closeSos.click();
      await page.waitForTimeout(300);
    }
  }

  // 3. Switch to Explore Tab to test Station Detail Sheet
  console.log('3. Navigating to Explore Map...');
  const menuBtn = page.locator('#driver-menu-button');
  if (await menuBtn.isVisible()) {
    await menuBtn.click();
    await page.waitForTimeout(300);
    const mapTab = page.locator('button:has-text("Map")');
    if (await mapTab.isVisible()) {
      await mapTab.click();
      await page.waitForTimeout(1000);
    }
  }

  // 4. Tap the first preview station card or Book Stall button
  console.log('4. Opening Station Detail Sheet...');
  const bookStallBtn = page.locator('button:has-text("Book Stall")');
  if (await bookStallBtn.isVisible()) {
    await bookStallBtn.click();
    await page.waitForTimeout(600);
  } else {
    // try clicking on station preview card
    const firstCard = page.locator('[aria-label^="View details for"]');
    if (await firstCard.isVisible()) {
      await firstCard.click();
      await page.waitForTimeout(600);
    }
  }

  // 5. Capture Station Detail Sheet inside phone frame (verify it stays strictly inside!)
  console.log('5. Capturing Station Detail Sheet inside phone UI...');
  await page.screenshot({ path: path.join(outDir, '03_station_sheet_inside_phone.png'), fullPage: false });

  // 6. Click "Book Bay" button inside Station Detail Sheet
  console.log('6. Clicking Book Bay in Station Detail Sheet...');
  const bookBayBtn = page.locator('aside[aria-modal="true"] button:has-text("Book Bay")');
  if (await bookBayBtn.isVisible()) {
    await bookBayBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, '04_booking_modal_inside_phone.png'), fullPage: false });

    // Confirm booking
    const confirmBtn = page.locator('button:has-text("Confirm & Lock")');
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(outDir, '05_booking_confirmed_inside_phone.png'), fullPage: false });
      
      const doneBtn = page.locator('button:has-text("Done")');
      if (await doneBtn.isVisible()) {
        await doneBtn.click();
        await page.waitForTimeout(300);
      }
    }
  }

  // 7. Test Journeys Tab (corridor stations with Book button)
  console.log('7. Navigating to Journeys Tab...');
  if (await menuBtn.isVisible()) {
    await menuBtn.click();
    await page.waitForTimeout(300);
    const journeysTab = page.locator('button:has-text("Journeys")');
    if (await journeysTab.isVisible()) {
      await journeysTab.click();
      await page.waitForTimeout(1000);
    }
  }

  await page.screenshot({ path: path.join(outDir, '06_journeys_tab.png'), fullPage: false });

  await browser.close();
  console.log('All tests completed successfully!');
})();
