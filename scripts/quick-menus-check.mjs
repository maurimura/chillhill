import assert from 'node:assert/strict';

export async function checkQuickMenus(browser, origin, errors) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(origin);
    await page.waitForFunction(() => window.__chillhill?.driveReady);
    assert.equal(
      await page.locator('#open-settings').innerText(),
      '',
      'advanced tuning is icon-only',
    );
    assert.equal(
      await page.locator('#settings-dialog [data-car], #settings-dialog [data-scene]').count(),
      0,
    );
    assert.equal(await page.locator('#open-garage').isVisible(), false);
    await page.locator('#start').click();
    await page.waitForFunction(() => window.__chillhill.state.speed > 3);
    await page.keyboard.down('v');
    await page.waitForFunction(() => window.__chillhill.cameraMode === 'front');

    await page.locator('#open-car-menu').click();
    const parked = await page.evaluate(() => window.__chillhill.state);
    assert.equal(await page.locator('#open-car-menu').getAttribute('aria-expanded'), 'true');
    await page.waitForFunction(() => window.__chillhill.cameraMode === 'chase');
    await page.keyboard.up('v');
    await page.keyboard.down('w');
    await page.keyboard.press('r');
    await page.keyboard.press('p');
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => window.__chillhill.state), parked);
    assert.equal(await page.evaluate(() => window.__chillhill.paused), false);
    assert.equal(await page.locator('#pause-card').isVisible(), false);
    assert.equal(await page.locator('#car-menu #open-garage').isVisible(), true);

    await page.locator('#open-world-menu').click();
    assert.equal(await page.locator('#car-menu').isVisible(), false);
    assert.equal(await page.locator('#open-car-menu').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#world-menu').isVisible(), true);
    await page.locator('#world-weather').selectOption('rain');
    assert.match(await page.locator('#open-world-menu').getAttribute('aria-label'), /Rain/);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__chillhill.quickMenu), null);
    assert.equal(
      await page.locator('#open-world-menu').evaluate((el) => document.activeElement === el),
      true,
    );
    assert.equal(
      await page.evaluate(() => window.__chillhill.paused),
      false,
      'Escape dismisses the menu, not the drive',
    );
    await page.keyboard.up('w');
    await page.waitForFunction(
      (distance) => window.__chillhill.state.distance > distance,
      parked.distance,
    );
    assert.equal(
      await page.evaluate(() => window.__chillhill.cameraMode),
      'chase',
      'front view cannot latch across a menu',
    );

    await page.locator('#pause').click();
    await page.locator('#open-car-menu').click();
    await page.locator('[data-car="wagon"]').click();
    await page.locator('#close-car-menu').click();
    assert.equal(
      await page.evaluate(() => window.__chillhill.paused),
      true,
      'closing a menu preserves a manual pause',
    );
    assert.equal(await page.locator('#pause-card').isVisible(), true);
    await page.locator('#resume').click();

    await page.locator('#open-car-menu').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#car-menu').isVisible(), true, 'keyboard activation works');
    await page.locator('#open-car-menu').click();
    assert.equal(await page.locator('#car-menu').isVisible(), false, 'trigger toggles its menu');
    await page.locator('#open-world-menu').click();
    await page.mouse.click(500, 350);
    assert.equal(
      await page.locator('#world-menu').isVisible(),
      false,
      'clicking the road dismisses the menu',
    );

    await page.locator('#open-world-menu').click();
    await page.locator('#open-settings').click();
    assert.equal(await page.locator('#world-menu').isVisible(), false);
    assert.equal(await page.locator('#settings-dialog').isVisible(), true);
    const tuning = await page.evaluate(() => window.__chillhill.state);
    await page.locator('#world-wind').fill('0.8');
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => window.__chillhill.state), tuning);
    await page.locator('#close-settings').click();

    await page.locator('#open-car-menu').click();
    await page.locator('#open-garage').click();
    await page.waitForFunction(() => window.__chillhill.view === 'garage');
    assert.equal(await page.locator('.quick-panel:visible').count(), 0);
    assert.equal(await page.locator('#open-car-menu').isVisible(), false);
    await page.locator('#back-drive').click();
    await page.waitForFunction(() => window.__chillhill.view === 'drive');
    assert.equal(await page.evaluate(() => window.__chillhill.settings.car), 'wagon');
    assert.equal(await page.locator('.quick-panel:visible').count(), 0);
    await page.locator('#open-car-menu').click();
    await page.locator('#open-garage').focus();
    await page.keyboard.press('Tab');
    assert.equal(
      await page.locator('#car-menu').isVisible(),
      false,
      'tabbing out dismisses a non-modal panel',
    );
  } finally {
    await page.close();
  }
  console.log(
    'PASS: immersive car/scenery menus, keyboard/focus/outside dismissal, exclusive panels, input clearing, manual pause preservation, advanced tuning, and garage return.',
  );
}
