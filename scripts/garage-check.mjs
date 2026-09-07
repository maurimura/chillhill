import assert from 'node:assert/strict';
import { selectGarageTool } from './garage-tools.mjs';

export async function checkGarage(browser, origin, errors) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`${origin}/#garage`);
  await page.waitForFunction(() => window.__chillhill?.garage);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => window.__chillhill.driveReady), false);
  assert.equal(
    await page.locator('#scene canvas').count(),
    0,
    'garage deep link must not create a road scene',
  );
  await page.screenshot({ path: 'artifacts/garage-desktop.png' });
  await page.keyboard.press('Enter');
  await page.keyboard.down('w');
  await page.keyboard.press('r');
  await page.waitForTimeout(200);
  await page.keyboard.up('w');
  assert.equal(await page.evaluate(() => window.__chillhill.started), false);
  assert.equal(await page.evaluate(() => window.__chillhill.state.distance), 20);
  await page.locator('[data-paint="#426453"]').click();
  assert.equal(await page.evaluate(() => window.__chillhill.garage.paint), '#426453');
  await page.locator('[data-garage-car="peugeot-206"]').click();
  await page.locator('#garage-hex').fill('#9C5667');
  assert.equal(await page.evaluate(() => window.__chillhill.garage.paint), '#9c5667');
  await page.locator('[data-garage-car="astra"]').click();
  assert.equal(await page.evaluate(() => window.__chillhill.garage.paint), '#426453');
  await page.locator('#garage-hex').fill('#oops');
  assert.equal(await page.locator('#garage-hex').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.evaluate(() => window.__chillhill.garage.paint), '#426453');
  await page.locator('#garage-title').click();
  await page.locator('#garage-paint-reset').click();
  assert.equal(await page.evaluate(() => window.__chillhill.settings.paint.astra), null);
  assert.equal(
    await page.evaluate(() => window.__chillhill.settings.paint['peugeot-206']),
    '#9c5667',
  );
  await page.locator('[data-paint="#426453"]').click();
  const startCamera = await page.evaluate(() => window.__chillhill.garage.camera);
  const canvas = await page.locator('#garage-canvas canvas').boundingBox();
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2 + 130, canvas.y + canvas.height / 2 + 40, {
    steps: 10,
  });
  await page.mouse.up();
  await page.waitForTimeout(250);
  assert.notDeepEqual(await page.evaluate(() => window.__chillhill.garage.camera), startCamera);
  for (const view of ['front', 'side', 'rear', 'hero']) {
    await page.locator(`[data-garage-angle="${view}"]`).click();
    await page.waitForTimeout(100);
  }
  const zoomDistance = await page.evaluate(() => window.__chillhill.garage.distance);
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(150);
  assert.ok(
    await page.evaluate((before) => window.__chillhill.garage.distance > before, zoomDistance),
  );
  await page.locator('#garage-reset-view').click();
  await page.locator('#garage-spin').click();
  const spinCamera = await page.evaluate(() => window.__chillhill.garage.camera);
  await page.waitForTimeout(300);
  assert.notDeepEqual(await page.evaluate(() => window.__chillhill.garage.camera), spinCamera);
  await page.locator('#garage-reset-view').click();
  assert.equal(await page.evaluate(() => window.__chillhill.garage.spin), false);
  await page.locator('#garage-softness').fill('0');
  await page.waitForTimeout(200);
  await page.locator('#garage-wireframe').click();
  assert.equal(await page.evaluate(() => window.__chillhill.garage.wireframe), true);
  await page.screenshot({ path: 'artifacts/garage-wireframe.png' });
  await page.locator('#garage-wireframe').click();
  await page.locator('#garage-softness').fill('0.85');
  await page.waitForTimeout(200);
  const counts = new Map();
  for (let cycle = 0; cycle < 3; cycle++)
    for (const car of ['peugeot-206', 'wagon', 'astra']) {
      await page.locator(`[data-garage-car="${car}"]`).click();
      await page.waitForTimeout(120);
      const { geometries, textures } = await page.evaluate(() => window.__chillhill.garage);
      if (!counts.has(car)) counts.set(car, { geometries, textures });
      assert.deepEqual(
        { geometries, textures },
        counts.get(car),
        'garage car changes must release old GPU resources',
      );
    }
  await page.reload();
  await page.waitForFunction(() => window.__chillhill?.garage);
  assert.equal(await page.evaluate(() => window.__chillhill.driveReady), false);
  assert.equal(await page.evaluate(() => window.__chillhill.garage.paint), '#426453');
  assert.equal(await page.evaluate(() => window.__chillhill.settings.roundness), 0.85);
  await page.locator('#back-drive').click();
  await page.waitForFunction(
    () => window.__chillhill.view === 'drive' && window.__chillhill.driveReady,
  );
  assert.equal(await page.evaluate(() => window.__chillhill.paintColor), '#426453');
  assert.equal(await page.locator('#garage-canvas canvas').count(), 0);
  await page.locator('#start').click();
  await page.waitForFunction(() => window.__chillhill.state.speed > 3);
  await page.locator('#open-car-menu').click();
  await page.locator('#open-garage').click();
  await page.waitForFunction(() => window.__chillhill.view === 'garage');
  const parked = await page.evaluate(() => ({ ...window.__chillhill.state }));
  await page.keyboard.down('w');
  await page.keyboard.press('r');
  await page.keyboard.press('v');
  await page.waitForTimeout(250);
  await page.keyboard.up('w');
  assert.deepEqual(await page.evaluate(() => window.__chillhill.state), parked);
  await page.locator('[data-paint="#b96f53"]').click();
  await page.screenshot({ path: 'artifacts/garage-custom-paint.png' });
  await page.locator('#back-drive').click();
  await page.waitForFunction(
    () => window.__chillhill.view === 'drive' && window.__chillhill.state.distance > 20,
  );
  assert.ok(
    await page.evaluate((start) => window.__chillhill.state.distance >= start, parked.distance),
  );
  assert.equal(await page.evaluate(() => window.__chillhill.paintColor), '#b96f53');
  await page.goBack();
  await page.waitForFunction(() => window.__chillhill.view === 'garage');
  await page.goForward();
  await page.waitForFunction(() => window.__chillhill.view === 'drive');

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  mobile.on('pageerror', (error) => errors.push(error.message));
  await mobile.goto(`${origin}/#garage`);
  await mobile.waitForFunction(() => window.__chillhill?.garage);
  await mobile.evaluate(() => document.fonts.ready);
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mobile.screenshot({ path: 'artifacts/garage-mobile.png', fullPage: true });
  const mobileCamera = await mobile.evaluate(() => window.__chillhill.garage.camera);
  const mobileCanvas = await mobile.locator('#garage-canvas canvas').boundingBox();
  const cdp = await mobile.context().newCDPSession(mobile);
  const x = mobileCanvas.x + mobileCanvas.width / 2,
    y = mobileCanvas.y + mobileCanvas.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + 70, y: y + 20 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.waitForTimeout(250);
  assert.notDeepEqual(await mobile.evaluate(() => window.__chillhill.garage.camera), mobileCamera);
  const pinchDistance = await mobile.evaluate(() => window.__chillhill.garage.distance);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: x - 50, y },
      { x: x + 50, y },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: x - 25, y },
      { x: x + 25, y },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.waitForTimeout(150);
  assert.ok(
    await mobile.evaluate((before) => window.__chillhill.garage.distance > before, pinchDistance),
  );
  await mobile.locator('[data-garage-car="wagon"]').tap();
  await selectGarageTool(mobile, 'paint');
  await mobile.locator('[data-paint="#ceaa60"]').tap();
  assert.equal(await mobile.evaluate(() => window.__chillhill.garage.paint), '#ceaa60');
  const stickyStage = await mobile.locator('.garage-stage').boundingBox();
  assert.ok(
    stickyStage.y >= 0 && stickyStage.y + stickyStage.height < 844,
    'car preview stays on screen while painting',
  );
  await mobile.screenshot({ path: 'artifacts/garage-mobile-painting.png' });
  await mobile.locator('#back-drive').tap();
  await mobile.waitForFunction(
    () => window.__chillhill.view === 'drive' && window.__chillhill.driveReady,
  );
  assert.equal(await mobile.evaluate(() => window.__chillhill.paintColor), '#ceaa60');
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mobile.close();
  await page.close();
  console.log(
    'PASS: standalone garage, orbit/touch, view presets, spin, wireframe, softness, per-car paint/reset/validation/persistence, model resource disposal, shared road paint and preserved journeys.',
  );
}
