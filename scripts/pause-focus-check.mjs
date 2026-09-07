import assert from 'node:assert/strict';
import { checkContrast } from './readability-check.mjs';

export async function checkPauseFocus(browser, origin, errors) {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(origin);
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      await page.locator('#start-challenge').click();
      await page.keyboard.press('Escape');
      const card = page.locator('#pause-card');
      assert.equal(await card.getAttribute('role'), 'dialog');
      assert.equal(
        await page.locator('#resume').evaluate((node) => node === document.activeElement),
        true,
      );
      for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
        await page.keyboard.press(key);
        assert.equal(
          await card.evaluate((node) => node.contains(document.activeElement)),
          true,
          `${key} stays in the pause card`,
        );
      }
      await page.locator('#open-car-menu').focus();
      assert.equal(
        await card.evaluate((node) => node.contains(document.activeElement)),
        true,
        'programmatic background focus is redirected',
      );
      assert.equal(
        await card.evaluate((node) => getComputedStyle(node).backgroundColor),
        await page
          .locator('#challenge-hud')
          .evaluate((node) => getComputedStyle(node).backgroundColor),
        'pause matches the HUD surface',
      );
      await checkContrast(page, [
        '.pause-card h2',
        '.pause-card p',
        '.pause-card .eyebrow',
        '.pause-card .mode-option',
        '.pause-card .mode-option small',
      ]);
      const box = await card.boundingBox();
      assert.ok(
        box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= viewport.width &&
          box.y + box.height <= viewport.height,
      );
      await page.screenshot({ path: `artifacts/pause-focus-${viewport.width}.png` });
      await page.locator('#open-world-menu').click();
      assert.equal(
        await page.locator('#world-menu').isVisible(),
        true,
        'pointer customization remains available while paused',
      );
      assert.equal(
        await page.locator('#world-menu').evaluate((node) => node.contains(document.activeElement)),
        true,
      );
      await page.locator('#close-world-menu').click();
      assert.equal(
        await page.locator('#resume').evaluate((node) => node === document.activeElement),
        true,
        'returning from a submenu restores pause focus',
      );
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.__chillhill.paused), false);
      assert.equal(await card.isVisible(), false);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => window.__chillhill.paused), false);
      await page.locator('#open-car-menu').click();
      assert.equal(
        await page.locator('#car-menu').evaluate((node) => node.contains(document.activeElement)),
        true,
        'the closed pause card no longer captures focus',
      );
    } finally {
      await page.close();
    }
  }
  console.log(
    'PASS: HUD-styled pause card, current-mode autofocus, Tab/Shift+Tab containment, submenu focus return, Enter/Escape resume, contrast, mobile/desktop/landscape.',
  );
}
