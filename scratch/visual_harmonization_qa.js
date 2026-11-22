const { chromium } = require(require('path').resolve(__dirname, '../frontend/node_modules/playwright'));
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const OUT_DIR = path.resolve(__dirname, '../qa-screenshots/harmonized-theme');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function run() {
  ensureDir(OUT_DIR);
  console.log('--- Visual Harmonization QA: Blue, White & Fresh Green ---');

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  // Mobile Context (390 x 844 - iPhone 13/14)
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await mobileContext.newPage();

  try {
    // 1. Journey Planner (Mobile 390x844) - Priority Component
    console.log('1. Capturing Journey Planner on Mobile (390x844)...');
    await page.goto(`${BASE_URL}/users`, { waitUntil: 'networkidle', timeout: 25000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; pointer-events: none !important; }' });
    await page.waitForTimeout(1000);

    // Open side drawer and click Journeys
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    await page.locator('#driver-drawer-tab-journeys').click({ force: true });
    await page.waitForTimeout(1500);

    // Capture initial Journey Planner
    await page.screenshot({ path: path.join(OUT_DIR, '01_journey_planner_mobile_initial.png') });
    console.log('Captured: 01_journey_planner_mobile_initial.png');

    // Select second destination (Mumbai) to verify active state transition
    const mumbaiDest = page.locator('button:has-text("Mumbai")').first();
    if (await mumbaiDest.count() > 0) {
      await mumbaiDest.click({ force: true });
      await page.waitForTimeout(1000);
    }

    // Capture simulated Journey Planner
    await page.screenshot({ path: path.join(OUT_DIR, '02_journey_planner_mobile_simulated.png') });
    console.log('Captured: 02_journey_planner_mobile_simulated.png');

    // 2. Journey Planner on iPhone SE (375x667)
    console.log('2. Capturing Journey Planner on compact 375x667...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT_DIR, '03_journey_planner_375x667.png') });
    console.log('Captured: 03_journey_planner_375x667.png');

    // 3. Cockpit Home View (390x844)
    console.log('3. Capturing Cockpit Home...');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    await page.locator('#driver-drawer-tab-home').click({ force: true });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, '04_cockpit_home_harmonized.png') });
    console.log('Captured: 04_cockpit_home_harmonized.png');

    // 4. Explore Map View
    console.log('4. Capturing Explore Map View...');
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    await page.locator('#driver-drawer-tab-explore').click({ force: true });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT_DIR, '05_explore_map_harmonized.png') });
    console.log('Captured: 05_explore_map_harmonized.png');

    // 5. Driver Side Drawer
    console.log('5. Capturing Driver Side Drawer...');
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT_DIR, '06_driver_drawer_harmonized.png') });
    console.log('Captured: 06_driver_drawer_harmonized.png');

    // 6. Charging Console
    console.log('6. Capturing Charging Console...');
    await page.locator('#driver-drawer-tab-charging').click({ force: true });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, '07_charging_console_harmonized.png') });
    console.log('Captured: 07_charging_console_harmonized.png');

    // 7. Driver Profile
    console.log('7. Capturing Driver Profile...');
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    await page.locator('#driver-drawer-tab-profile').click({ force: true });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, '08_driver_profile_harmonized.png') });
    console.log('Captured: 08_driver_profile_harmonized.png');

    // 8. Station Owners Interface
    console.log('8. Capturing Station Owners Page...');
    await page.goto(`${BASE_URL}/station-owners`, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, '09_station_owners_harmonized.png') });
    console.log('Captured: 09_station_owners_harmonized.png');

    // 9. Landing Page (Mobile & Desktop)
    console.log('9. Capturing Landing Page...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, '10_landing_page_mobile.png') });
    console.log('Captured: 10_landing_page_mobile.png');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, '11_landing_page_desktop.png') });
    console.log('Captured: 11_landing_page_desktop.png');

    // 10. Journey Planner on Desktop (1440x900)
    console.log('10. Capturing Journey Planner on Desktop (1440x900)...');
    await page.goto(`${BASE_URL}/users`, { waitUntil: 'networkidle', timeout: 25000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; pointer-events: none !important; }' });
    await page.waitForTimeout(1000);
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    await page.locator('#driver-drawer-tab-journeys').click({ force: true });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT_DIR, '12_journey_planner_desktop.png') });
    console.log('Captured: 12_journey_planner_desktop.png');

    console.log('\n--- All 12 Harmonization QA Screenshots Captured Successfully! ---');
  } catch (err) {
    console.error('QA Execution Error:', err);
  } finally {
    await browser.close();
  }
}

run();
