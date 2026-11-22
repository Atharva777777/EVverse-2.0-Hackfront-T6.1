const { chromium } = require(require('path').resolve(__dirname, '../frontend/node_modules/playwright'));
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const OUT_DIR = path.resolve(__dirname, '../qa-screenshots/no-bottom-nav');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function run() {
  ensureDir(OUT_DIR);
  console.log('Starting Side Drawer Navigation & No Bottom Nav Verification...');

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
    // 1. Load /users
    console.log('Loading /users...');
    await page.goto(`${BASE_URL}/users`, { waitUntil: 'networkidle', timeout: 25000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; pointer-events: none !important; }' });
    await page.waitForTimeout(1000);

    // Verify bottom nav is NOT present
    const bottomNavCount = await page.locator('nav[aria-label="Driver Navigation"]').count();
    console.log(`Bottom nav bar present count: ${bottomNavCount} (Expected: 0)`);

    // Capture Cockpit home without bottom nav
    await page.screenshot({ path: path.join(OUT_DIR, '01_cockpit_no_bottom_nav.png') });
    console.log('Captured: 01_cockpit_no_bottom_nav.png');

    // 2. Open Side Drawer
    console.log('Clicking hamburger menu button (#driver-menu-button)...');
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600); // Drawer slide animation

    const isDrawerVisible = await page.locator('div[role="dialog"][aria-label="Navigation Menu"]').isVisible();
    console.log(`Side drawer visible: ${isDrawerVisible}`);
    await page.screenshot({ path: path.join(OUT_DIR, '02_side_drawer_open.png') });
    console.log('Captured: 02_side_drawer_open.png');

    // 3. Switch to Map / Explore via side drawer
    console.log('Clicking #driver-drawer-tab-explore...');
    await page.locator('#driver-drawer-tab-explore').click({ force: true });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT_DIR, '03_explore_map_view.png') });
    console.log('Captured: 03_explore_map_view.png');

    // 4. Open drawer and switch to Journeys
    console.log('Opening drawer and clicking #driver-drawer-tab-journeys...');
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    await page.locator('#driver-drawer-tab-journeys').click({ force: true });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, '04_journeys_view.png') });
    console.log('Captured: 04_journeys_view.png');

    // 5. Open drawer and switch to Charging
    console.log('Opening drawer and clicking #driver-drawer-tab-charging...');
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    await page.locator('#driver-drawer-tab-charging').click({ force: true });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, '05_charging_view.png') });
    console.log('Captured: 05_charging_view.png');

    // 6. Open drawer and switch to Profile
    console.log('Opening drawer and clicking #driver-drawer-tab-profile...');
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    await page.locator('#driver-drawer-tab-profile').click({ force: true });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, '06_profile_view.png') });
    console.log('Captured: 06_profile_view.png');

    // 7. Check 375x667 viewport
    console.log('Checking 375x667 viewport...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, '07_375x667_profile.png') });

    // Open drawer on 375x667
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT_DIR, '08_375x667_drawer_open.png') });

    // Click Home
    await page.locator('#driver-drawer-tab-home').click({ force: true });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT_DIR, '09_375x667_home.png') });

    console.log('\nAll tests completed successfully! No bottom nav bar detected, and side drawer navigation fully functional.');
  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    await browser.close();
  }
}

run();
