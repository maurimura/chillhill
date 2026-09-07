import assert from 'node:assert/strict';

export async function checkPauseEnter(browser, origin, errors) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(origin);
    await page.waitForFunction(() => window.__chillhill?.driveReady);
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => window.__chillhill.started && window.__chillhill.state.speed > 3,
    );
    for (const key of ['Enter', 'NumpadEnter']) {
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#pause-card').isVisible(), true);
      const distance = await page.evaluate(() => window.__chillhill.state.distance);
      await page.keyboard.down(key);
      await page.waitForFunction(() => !window.__chillhill.paused);
      await page.keyboard.down(key); // repeated keydown must not re-pause or restart
      await page.waitForTimeout(100);
      await page.keyboard.up(key);
      assert.equal(await page.evaluate(() => window.__chillhill.paused), false);
      assert.ok(await page.evaluate((d) => window.__chillhill.state.distance > d, distance));
    }
    await page.keyboard.press('Escape');
    await page.locator('#open-settings').click();
    await page.locator('#seed').focus();
    await page.keyboard.press('Enter');
    assert.equal(
      await page.evaluate(() => window.__chillhill.paused),
      true,
      'typing in settings does not resume',
    );
    await page.locator('#close-settings').click();
    await page.waitForFunction(() => !document.querySelector('#pause-card').hidden);
    await page.locator('#open-car-menu').focus();
    assert.equal(
      await page.locator('#resume').evaluate((node) => node === document.activeElement),
      true,
      'pause focus cannot leak to the background toolbar',
    );
    await page.locator('#open-car-menu').click();
    assert.equal(
      await page.locator('#car-menu').isVisible(),
      true,
      'a deliberate toolbar click can still customize a paused drive',
    );
    assert.equal(await page.evaluate(() => window.__chillhill.paused), true);
    await page.locator('#close-car-menu').click();
    await page.locator('#resume').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !window.__chillhill.paused);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await page.evaluate(() => window.__chillhill.paused), true);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !window.__chillhill.paused);
    await page.locator('#open-car-menu').click();
    await page.locator('#open-garage').click();
    await page.waitForFunction(() => window.__chillhill.garage);
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.__chillhill.view), 'garage');
  } finally {
    await page.close();
  }
  console.log(
    'PASS: Enter/numpad Enter resume a paused drive without restarting; key repeats, focused buttons, menus, settings, focus loss and garage are safe.',
  );
}
