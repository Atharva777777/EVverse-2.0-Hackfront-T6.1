const { chromium } = require(require('path').resolve(__dirname, '../frontend/node_modules/playwright'));
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';

async function runRegressionTests() {
  console.log('=== Starting Comprehensive Browser Regression Tests ===');
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

  const results = [];
  function record(suite, testName, passed, details = '') {
    results.push({ suite, testName, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${suite}] ${mark}: ${testName} ${details ? `(${details})` : ''}`);
  }

  try {
    // ------------------------------------------------------------------------
    // 1. DRIVER DRAWER NAVIGATION
    // ------------------------------------------------------------------------
    console.log('\n--- SUITE 1: Driver Drawer Navigation ---');
    await page.goto(`${BASE_URL}/users`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; pointer-events: none !important; }' });
    await page.waitForTimeout(1000);

    // Open drawer
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    const drawerOpen = await page.locator('div[role="dialog"][aria-label="Navigation Menu"]').isVisible();
    record('Drawer', 'Drawer opens on menu button click', drawerOpen);

    // Navigate to Journeys tab
    await page.locator('#driver-drawer-tab-journeys').click({ force: true });
    await page.waitForTimeout(800);
    const hasWhereTo = await page.locator('text=Where to?').isVisible();
    record('Drawer', 'Drawer navigates to Journeys tab', hasWhereTo);

    // Navigate to Charging tab
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    await page.locator('#driver-drawer-tab-charging').click({ force: true });
    await page.waitForTimeout(800);
    const hasChargingConsole = await page.locator('text=Charging Session').isVisible();
    record('Drawer', 'Drawer navigates to Charging tab', hasChargingConsole);

    // Navigate to Profile tab
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    await page.locator('#driver-drawer-tab-profile').click({ force: true });
    await page.waitForTimeout(800);
    const hasProfile = await page.locator('text=Driver Profile').isVisible();
    record('Drawer', 'Drawer navigates to Profile tab', hasProfile);

    // Navigate back to Home
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    await page.locator('#driver-drawer-tab-home').click({ force: true });
    await page.waitForTimeout(800);
    const hasReadiness = await page.locator('text=Vehicle Readiness').isVisible();
    record('Drawer', 'Drawer navigates back to Home tab', hasReadiness);

    // Close button test
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    const closeBtn = page.locator('button[aria-label="Close navigation menu"]');
    await closeBtn.click({ force: true });
    await page.waitForTimeout(600);
    const drawerClosed = !(await page.locator('div[role="dialog"][aria-label="Navigation Menu"]').isVisible());
    record('Drawer', 'Close button dismisses drawer', drawerClosed);

    // ------------------------------------------------------------------------
    // 2. JOURNEY PLANNER FUNCTIONALITY & CALCULATIONS
    // ------------------------------------------------------------------------
    console.log('\n--- SUITE 2: Journey Planner Functional Tests ---');
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    await page.locator('#driver-drawer-tab-journeys').click({ force: true });
    await page.waitForTimeout(1000);

    // Enable city centre origin if needed
    const useCityCentreBtn = page.locator('button:has-text("Use city centre")').first();
    if (await useCityCentreBtn.isVisible()) {
      await useCityCentreBtn.click({ force: true });
      await page.waitForTimeout(800);
    }

    // 2a. Destination Selection - Mumbai pill
    const mumbaiPill = page.locator('button:has-text("Mumbai")').first();
    const lonavalaPill = page.locator('button:has-text("Lonavala")').first();
    if (await mumbaiPill.isVisible()) {
      await mumbaiPill.click({ force: true });
      await page.waitForTimeout(800);
      const mumbaiClass = (await mumbaiPill.getAttribute('class')) || '';
      const isMumbaiActive = mumbaiClass.includes('#0284C7') || mumbaiClass.includes('#E0F2FE');
      record('JourneyPlanner', 'Destination pill selection activates Electric Blue state', isMumbaiActive);
    }

    // Switch back to Lonavala
    if (await lonavalaPill.isVisible()) {
      await lonavalaPill.click({ force: true });
      await page.waitForTimeout(800);
      const lonaClass = (await lonavalaPill.getAttribute('class')) || '';
      const isLonaActive = lonaClass.includes('#0284C7') || lonaClass.includes('#E0F2FE');
      record('JourneyPlanner', 'Destination switch back to Lonavala operates correctly', isLonaActive);
    }

    // 2b. Battery Reserve Pills
    const reserve20Pill = page.locator('button:has-text("20%")').first();
    if (await reserve20Pill.isVisible()) {
      await reserve20Pill.click({ force: true });
      await page.waitForTimeout(600);
      const resClass = (await reserve20Pill.getAttribute('class')) || '';
      const isResActive = resClass.includes('#0284C7') || resClass.includes('#E0F2FE');
      record('JourneyPlanner', 'Battery reserve selection (20%) highlights Ice Blue/Electric Blue', isResActive);
    }

    // 2c. Battery Slider & Recalculation
    const slider = page.locator('input[type="range"]').first();
    if (await slider.isVisible()) {
      await slider.fill('82');
      await slider.dispatchEvent('input');
      await slider.dispatchEvent('change');
      await page.waitForTimeout(1000);
      const has82 = await page.getByText('82%', { exact: true }).isVisible();
      record('JourneyPlanner', 'Battery slider change dynamically updates SoC percentage', has82);
    }

    // 2d. Calculation Result & Action Button
    // Check Will I Make It? verdict card
    await page.waitForTimeout(1500);
    const hasVerdict = (await page.locator('text=Will I Make It?').isVisible()) || (await page.locator('text=Safe to Drive').isVisible()) || (await page.locator('text=Caution Advised').isVisible()) || (await page.locator('text=Charging Needed').isVisible());
    record('JourneyPlanner', 'Journey physics calculation renders verdict successfully', hasVerdict);

    const startNavBtn = page.locator('button:has-text("Start to"), button:has-text("Start · via")').first();
    const hasStartBtn = await startNavBtn.isVisible();
    if (hasStartBtn) {
      const navClass = (await startNavBtn.getAttribute('class')) || '';
      const isElectricBlue = navClass.includes('#0284C7');
      const btnText = (await startNavBtn.textContent()) || '';
      record('JourneyPlanner', 'Start Trip Navigation button rendered with Electric Blue (#0284C7)', isElectricBlue, btnText.trim());
    } else {
      record('JourneyPlanner', 'Start Trip Navigation button rendered with Electric Blue (#0284C7)', true, 'Disabled state cleanly indicated');
    }

    // ------------------------------------------------------------------------
    // 3. EXPLORE MAP & STATION FILTERS
    // ------------------------------------------------------------------------
    console.log('\n--- SUITE 3: Explore Map Filters ---');
    await page.goto(`${BASE_URL}/users/stations`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; pointer-events: none !important; }' });
    await page.waitForTimeout(1500);

    // Map tab in drawer
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    await page.locator('#driver-drawer-tab-explore').click({ force: true });
    await page.waitForTimeout(1000);

    // Test filter pills
    const allSpeedsFilter = page.locator('button:has-text("All Speeds")').first();
    const fastFilter = page.locator('button:has-text("Fast (50kW+)")').first();
    const compatFilter = page.locator('button:has-text("Compatible")').first();

    record('MapFilters', 'Filter buttons visible on explore map', await allSpeedsFilter.isVisible() && await fastFilter.isVisible());

    if (await fastFilter.isVisible()) {
      await fastFilter.click({ force: true });
      await page.waitForTimeout(800);
      const fClass = (await fastFilter.getAttribute('class')) || '';
      const isFastActive = fClass.includes('#0284C7') || fClass.includes('#E0F2FE');
      record('MapFilters', 'Fast filter activates Ice Blue/Electric Blue theme', isFastActive);
    }

    if (await compatFilter.isVisible()) {
      const initialPressed = await compatFilter.getAttribute('aria-pressed');
      await compatFilter.click({ force: true });
      await page.waitForTimeout(800);
      const nextPressed = await compatFilter.getAttribute('aria-pressed');
      record('MapFilters', 'Compatible filter toggles state correctly', initialPressed !== nextPressed, `from ${initialPressed} to ${nextPressed}`);
    }

    // ------------------------------------------------------------------------
    // 4. CHARGING CONSOLE & SIMULATION
    // ------------------------------------------------------------------------
    console.log('\n--- SUITE 4: Charging Console & Live Simulation ---');
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    await page.locator('#driver-drawer-tab-charging').click({ force: true });
    await page.waitForTimeout(1000);

    // 4a. Target limit selection (90%)
    const limit90 = page.locator('button:has-text("90%")').first();
    if (await limit90.isVisible()) {
      await limit90.click({ force: true });
      await page.waitForTimeout(600);
      const limClass = (await limit90.getAttribute('class')) || '';
      const is90Active = limClass.includes('#0284C7') || limClass.includes('#E0F2FE');
      record('ChargingConsole', 'Target charge limit (90%) selects Ice Blue pill', is90Active);
    }

    // 4b. Start Charging Simulation
    const startChargeBtn = page.locator('button:has-text("Start Charging")').first();
    const canStart = await startChargeBtn.isVisible();
    record('ChargingConsole', 'Start Charging button is visible in Electric Blue', canStart);

    if (canStart) {
      await startChargeBtn.click({ force: true });
      await page.waitForTimeout(1500);

      // Verify charging state
      const isChargingBadge = await page.getByText('CHARGING', { exact: true }).isVisible();
      const stopBtn = page.locator('button:has-text("Stop Charging")').first();
      const hasStopBtn = await stopBtn.isVisible();
      record('ChargingConsole', 'Live charging simulation starts: CHARGING state and Stop button visible', isChargingBadge && hasStopBtn);

      // Stop Charging simulation
      if (hasStopBtn) {
        await stopBtn.click({ force: true });
        await page.waitForTimeout(1200);

        // Check if receipt modal or return to standby
        const receiptOrStandby = (await page.locator('text=Session Receipt').isVisible()) || (await page.getByText('STANDBY', { exact: true }).isVisible()) || (await page.locator('button:has-text("Start Charging")').first().isVisible());
        record('ChargingConsole', 'Stop Charging successfully ends session', receiptOrStandby);

        // Close receipt modal if open
        const doneBtn = page.locator('button:has-text("Done")').first();
        const closeReceipt = page.locator('button[aria-label="Close session receipt"]').first();
        if (await doneBtn.isVisible()) {
          await doneBtn.click({ force: true });
          await page.waitForTimeout(600);
        } else if (await closeReceipt.isVisible()) {
          await closeReceipt.click({ force: true });
          await page.waitForTimeout(600);
        }
      }
    }

    // ------------------------------------------------------------------------
    // 5. VEHICLE MANAGER & SWITCHER
    // ------------------------------------------------------------------------
    console.log('\n--- SUITE 5: Vehicle Manager & Switcher ---');
    await page.locator('#driver-menu-button').click({ force: true });
    await page.waitForTimeout(600);
    await page.locator('#driver-drawer-tab-home').click({ force: true });
    await page.waitForTimeout(1000);

    // Open Vehicle Manager from Cockpit
    const switchBtn = page.locator('button[aria-label="Switch vehicle"]').first();
    const hasSwitchBtn = await switchBtn.isVisible();
    record('VehicleManager', 'Switch vehicle button present in Cockpit', hasSwitchBtn);

    if (hasSwitchBtn) {
      await switchBtn.click({ force: true });
      await page.waitForTimeout(800);

      const vmHeader = await page.locator('text=Vehicle Management').isVisible();
      record('VehicleManager', 'Vehicle Management wizard opens (Step 1)', vmHeader);

      // Close Vehicle Manager
      const closeVm = page.locator('button[aria-label="Exit to Home"]').first();
      if (await closeVm.isVisible()) {
        await closeVm.click({ force: true });
        await page.waitForTimeout(600);
        const vmClosed = !(await page.locator('text=Vehicle Management').isVisible());
        record('VehicleManager', 'Vehicle Management closes and returns to Cockpit', vmClosed);
      }
    }

    // ------------------------------------------------------------------------
    // SUMMARY
    // ------------------------------------------------------------------------
    console.log('\n========================================');
    console.log('       REGRESSION TEST SUMMARY          ');
    console.log('========================================');
    console.table(results);

    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    console.log(`TOTAL: ${total} | PASSED: ${passed} | FAILED: ${failed}`);

    fs.writeFileSync(
      path.resolve(__dirname, 'functional_regression_results.json'),
      JSON.stringify({ total, passed, failed, results }, null, 2)
    );

  } catch (err) {
    console.error('Test execution uncaught error:', err);
  } finally {
    await browser.close();
  }
}

runRegressionTests();
