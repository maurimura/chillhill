import assert from 'node:assert/strict';

/** Mode choices are actions: no separate start/confirmation button. */
export async function checkModeEntry(browser, origin, errors) {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 640 },
  ]) {
    const mobile = viewport.width < 650;
    const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile });
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(origin);
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('#intro button').count(), 2);
      assert.deepEqual(await page.locator('#intro button strong').allTextContents(), [
        'Easy drive',
        'Drift king',
      ]);
      assert.equal(
        await page.locator('#intro [aria-pressed]').count(),
        0,
        'entry buttons are actions, not a selection that needs confirmation',
      );
      for (const mode of ['cozy', 'challenge']) {
        const rect = await page.locator(`#intro [data-mode="${mode}"]`).boundingBox();
        assert.ok(
          rect &&
            rect.x >= 0 &&
            rect.y >= 0 &&
            rect.x + rect.width <= viewport.width &&
            rect.y + rect.height <= viewport.height,
        );
      }
      await page.screenshot({
        path: `artifacts/mode-entry-${viewport.width}.png`,
        animations: 'disabled',
      });
      await page.locator('#intro [data-mode="challenge"]').click();
      await page.waitForFunction(() => window.__chillhill.started && !window.__chillhill.paused);
      assert.equal(await page.evaluate(() => window.__chillhill.mode), 'challenge');
      assert.equal(await page.locator('#intro').isVisible(), false);
      assert.equal(await page.locator('#challenge-hud .eyebrow').innerText(), 'DRIFT KING');

      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#pause-card [data-mode]').count(), 2);
      assert.match(await page.locator('#resume').innerText(), /Drift king/);
      await page.locator('#pause-card [data-mode="cozy"]').click();
      assert.equal(await page.evaluate(() => window.__chillhill.mode), 'cozy');
      assert.equal(await page.evaluate(() => window.__chillhill.paused), false);
      await page.waitForFunction(() => window.__chillhill.state.speed > 0.5);
      await page.keyboard.press('Escape');
      const distance = await page.evaluate(() => window.__chillhill.state.distance);
      await page.locator('#resume').click();
      assert.equal(await page.evaluate(() => window.__chillhill.paused), false);
      assert.ok(
        await page.evaluate((before) => window.__chillhill.state.distance >= before, distance),
        'clicking the current mode resumes rather than restarting',
      );

      await page.keyboard.press('Escape');
      await page.locator('#pause-card [data-mode="challenge"]').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.__chillhill.mode), 'challenge');
      assert.equal(await page.evaluate(() => window.__chillhill.paused), false);
      await page.keyboard.press('Escape');
      await page.locator('#resume').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.__chillhill.paused), false);

      await page.reload();
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.__chillhill.mode), 'cozy');
      assert.equal(await page.evaluate(() => window.__chillhill.started), true);
    } finally {
      await page.close();
    }
  }
  console.log(
    'PASS: only Easy drive/Drift king buttons; one-click entry/switch/resume, keyboard launch and default Enter, desktop and two mobile sizes.',
  );
}
