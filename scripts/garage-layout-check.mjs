import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { selectGarageTool } from './garage-tools.mjs';

async function fits(page) {
  const sizes = await page.evaluate(() => {
    const sections = document.querySelector('.garage-sections');
    return {
      pageFits:
        document.documentElement.scrollHeight <= innerHeight &&
        document.documentElement.scrollWidth <= innerWidth &&
        scrollY === 0,
      toolsFit:
        sections.scrollHeight <= sections.clientHeight &&
        sections.scrollWidth <= sections.clientWidth,
    };
  });
  assert.equal(
    sizes.pageFits,
    true,
    `${JSON.stringify(page.viewportSize())}: garage has no page scrolling`,
  );
  assert.equal(
    sizes.toolsFit,
    true,
    'the current tools fit, not merely clipped or scrolled inside the panel',
  );
  const nav = await page.locator('.site-header').boundingBox();
  for (const selector of ['.garage-stage', '.garage-panel', '.garage-angles', '#garage-spin']) {
    const box = await page.locator(selector).boundingBox();
    const viewport = page.viewportSize();
    assert.ok(
      box.width > 0 &&
        box.height > 0 &&
        box.x >= 0 &&
        box.y >= nav.y + nav.height &&
        box.x + box.width <= viewport.width &&
        box.y + box.height <= viewport.height,
      `${selector} stays completely on screen`,
    );
  }
  // Every visible control must be reachable without scrollIntoView masking overflow.
  const outside = await page
    .locator('#garage-view button, #garage-view input')
    .evaluateAll((controls) =>
      controls
        .filter((control) => {
          if (!control.getClientRects().length) return false;
          const r = control.getBoundingClientRect();
          return r.x < 0 || r.y < 0 || r.right > innerWidth || r.bottom > innerHeight;
        })
        .map((control) => control.id || control.textContent),
    );
  assert.deepEqual(outside, []);
}

export async function checkGarageLayout(browser, origin, errors) {
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [960, 900],
    [650, 844],
    [390, 844],
    [320, 640],
    [844, 390],
    [667, 375],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      isMobile: width < 650 || height < 600,
      hasTouch: width < 650 || height < 600,
    });
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(`${origin}/#garage`);
      await page.waitForFunction(() => window.__chillhill?.garage);
      await page.evaluate(() => document.fonts.ready);
      await fits(page);
      const cars = page.locator('[data-garage-car]');
      assert.equal(await cars.count(), 8);
      const rows = await cars.evaluateAll((buttons) =>
        buttons.map((b) => b.getBoundingClientRect().y),
      );
      assert.equal(new Set(rows).size, 4, 'eight cars occupy four two-column rows');
      await cars.last().click();
      await page.waitForFunction(() => window.__chillhill.garage.car === 'peugeot-206');
      await fits(page);
      await page.screenshot({ path: `artifacts/garage-viewport-${width}x${height}-cars.png` });
      await selectGarageTool(page, 'paint');
      await page.locator('[data-paint="#426453"]').click();
      await page.waitForFunction(() => window.__chillhill.garage.paint === '#426453');
      await fits(page);
      await page.screenshot({ path: `artifacts/garage-viewport-${width}x${height}-paint.png` });
      await selectGarageTool(page, 'details');
      await page.locator('#garage-softness').fill('0.8');
      await page.locator('#garage-wireframe').click();
      await page.locator('#garage-wireframe').click();
      await fits(page);
      if (await page.locator('.garage-tabs').isVisible()) {
        await page.locator('#garage-tab-details').focus();
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('#garage-tab-cars').getAttribute('aria-selected'), 'true');
        await page.keyboard.press('End');
        assert.equal(
          await page.locator('#garage-tab-details').getAttribute('aria-selected'),
          'true',
        );
        await page.keyboard.press('Home');
        await page.keyboard.press('ArrowLeft');
        assert.equal(
          await page.locator('#garage-tab-details').getAttribute('aria-selected'),
          'true',
        );
        assert.equal(await page.locator('[role="tabpanel"]:visible').count(), 1);
      }
      await page.mouse.wheel(0, 800);
      await fits(page);
    } finally {
      await page.close();
    }
  }
  // Crossing the responsive boundary retains paint and does not strand keyboard focus.
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  try {
    await page.goto(`${origin}/#garage`);
    await page.waitForFunction(() => window.__chillhill?.garage);
    await page.locator('#garage-hex').fill('#943b42');
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForFunction(
      () => document.querySelector('#garage-tab-paint').getAttribute('aria-selected') === 'true',
    );
    assert.equal(
      await page.locator('#garage-hex').evaluate((el) => document.activeElement === el),
      true,
    );
    await page.locator('#garage-tab-details').click();
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.waitForFunction(() => document.activeElement?.id === 'garage-softness');
    assert.equal(await page.evaluate(() => window.__chillhill.garage.paint), '#943b42');
    await fits(page);
  } finally {
    await page.close();
  }
  console.log(
    'PASS: garage fits nine desktop/mobile/landscape sizes without page or tool scrolling; all eight cars, paint, details, responsive resize and keyboard tabs work.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const browser = await chromium.launch({
    channel: process.env.CHROME_CHANNEL || 'chrome',
    headless: true,
  });
  const errors = [];
  try {
    await mkdir('artifacts', { recursive: true });
    await checkGarageLayout(browser, process.env.TEST_URL || 'http://127.0.0.1:5173', errors);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
