import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { checkContrast } from './readability-check.mjs';

export async function checkHitboxes(browser, origin, errors) {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(origin);
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      assert.equal((await page.evaluate(() => window.__chillhill.collisionDebug)).enabled, false);
      await page.locator('#start-challenge').click();
      await page.keyboard.press('h');
      await page.waitForFunction(() => window.__chillhill.collisionDebug.enabled);
      let debug = await page.evaluate(() => window.__chillhill.collisionDebug);
      assert.equal(debug.vehicles, 8, 'player and all seven traffic bodies have debug outlines');
      assert.ok(debug.vertices > 1000 && debug.vertices < 8192);
      assert.equal(await page.locator('#debug-hitboxes').isChecked(), true);
      await page.waitForFunction(() => !document.querySelector('#collision-legend').hidden);
      await checkContrast(page, [
        '.collision-legend',
        '.collision-legend span',
        '.collision-legend small',
      ]);
      await page.screenshot({ path: `artifacts/hitboxes-driving-${viewport.width}.png` });
      await page.locator('#pause').click();
      const frozen = await page.evaluate(() => window.__chillhill.state);
      await page.keyboard.press('h');
      await page.waitForFunction(() => !window.__chillhill.collisionDebug.enabled);
      assert.deepEqual(
        await page.evaluate(() => window.__chillhill.state),
        frozen,
        'debug toggle never changes driving',
      );
      assert.equal((await page.evaluate(() => window.__chillhill.collisionDebug)).vertices, 0);
      await page.locator('#open-settings').click();
      await page.locator('#debug-hitboxes').check();
      await page.keyboard.press('h');
      assert.equal(
        await page.locator('#debug-hitboxes').isChecked(),
        true,
        'H cannot toggle through a settings dialog',
      );
      await page.locator('#close-settings').click();
      await page.waitForFunction(() => window.__chillhill.collisionDebug.enabled);
      await page.locator('#pause-card [data-mode="cozy"]').click();
      await page.waitForFunction(() => window.__chillhill.collisionDebug.vehicles === 1);
      await page.locator('#pause').click();
      await page.locator('#open-car-menu').click();
      await page.locator('#car-menu [data-car="peugeot-206"]').click();
      await page.locator('#close-car-menu').click();
      assert.equal(await page.evaluate(() => window.__chillhill.settings.car), 'peugeot-206');
      await page.reload();
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      assert.equal(
        (await page.evaluate(() => window.__chillhill.collisionDebug)).enabled,
        false,
        'debug defaults off on refresh',
      );

      if (viewport.width === 1440) {
        const report = await page.evaluate(async () => {
          const { GameScene } = await import('/src/game/scene.ts');
          const { baseline } = await import('/src/config.ts');
          const { cars } = await import('/src/config/cars.ts');
          const { roadAt } = await import('/src/game/route.ts');
          const { initialState } = await import('/src/game/driving.ts');
          const { initialChallenge } = await import('/src/game/challenge.ts');
          const { collisionFootprint, trafficCollisionPose } =
            await import('/src/game/collision.ts');
          const { roadShoulderWidth } = await import('/src/config/road.ts');
          const settings = {
            ...baseline,
            treeDensity: 0,
            roadWidth: 14,
            landscape: 'desert',
            timeOfDay: 'day',
            weather: 'clear',
            curves: 0.2,
            pixelRatio: 1,
          };
          const element = document.createElement('div');
          element.style.cssText = 'position:fixed;inset:0;z-index:1000;background:#233';
          document.body.append(element);
          const scene = new GameScene(element, settings);
          const state = { ...initialState(), distance: 185, offset: 1.8, slide: -0.45 };
          const challenge = initialChallenge(settings, state);
          challenge.traffic = [
            { ...challenge.traffic[0], car: 'astra', distance: 188, offset: -1.8 },
          ];
          const results = [];
          const trafficResults = [];
          const origin = Math.floor(state.distance / 180) * 180;
          for (const car of Object.keys(cars)) {
            scene.applySettings({ ...settings, car });
            scene.render(state, 0, true, false, false, true, challenge, true);
            const line = scene.scene.getObjectByName('collision-debug');
            const position = line.geometry.getAttribute('position');
            const expected = collisionFootprint(state, car, settings);
            let maxError = 0;
            // Each polygon edge contributes low/high edges and an upright.
            expected.forEach((point, index) => {
              maxError = Math.max(
                maxError,
                Math.abs(position.getX(index * 6) - point.x),
                Math.abs(position.getZ(index * 6) - (point.z + origin)),
              );
            });
            results.push({ car, maxError });
            for (const lane of [-1, 1]) {
              const vehicle = challenge.traffic[0];
              vehicle.lane = lane;
              vehicle.car = car;
              vehicle.offset = (lane * settings.roadWidth) / 4;
              scene.render(state, 0, true, false, false, true, challenge, true);
              const actual = scene.traffic.group.children[0];
              const road = roadAt(vehicle.distance, settings);
              const outline = collisionFootprint(trafficCollisionPose(vehicle), car, settings);
              let error = Math.max(
                Math.abs(actual.rotation.x - lane * Math.atan(road.dy)),
                Math.abs(actual.rotation.y - (-road.heading + (lane === -1 ? Math.PI : 0))),
              );
              outline.forEach((point, index) => {
                error = Math.max(
                  error,
                  Math.abs(position.getX(48 + index * 6) - point.x),
                  Math.abs(position.getZ(48 + index * 6) - (point.z + origin)),
                );
              });
              trafficResults.push({ car, lane, error });
            }
          }
          const shoulder = scene.scene.getObjectByName('road-shoulder');
          const distance = shoulder.parent.userData.distance;
          const positions = shoulder.geometry.getAttribute('position');
          const fullWidth = positions.getX(1) - positions.getX(0);
          const support = positions.getX(1) - roadAt(distance, settings).x - settings.roadWidth / 2;
          scene.applySettings({ ...settings, car: 'astra' });
          scene.render(state, 0, true, false, false, true, challenge, true);
          // Present the same running scene from above for a clear geometry comparison.
          const road = roadAt(state.distance, settings);
          scene.camera.position.set(road.x + 12, 22, origin - state.distance + 9);
          scene.camera.lookAt(road.x, -1, origin - state.distance - 2);
          scene.camera.updateMatrixWorld(true);
          scene.renderer.render(scene.scene, scene.camera);
          window.__hitboxPreview = { scene, element };
          return {
            results,
            trafficResults,
            fullWidth,
            support,
            expectedWidth: settings.roadWidth + roadShoulderWidth * 2,
            expectedSupport: roadShoulderWidth,
          };
        });
        for (const result of report.results)
          assert.ok(
            result.maxError < 0.0001,
            `${result.car}: debug uses the exact collision polygon`,
          );
        for (const result of report.trafficResults)
          assert.ok(
            result.error < 0.0001,
            `${result.car}, lane ${result.lane}: actual orientation and debug footprint agree`,
          );
        assert.ok(Math.abs(report.fullWidth - report.expectedWidth) < 0.0001);
        assert.ok(Math.abs(report.support - report.expectedSupport) < 0.0001);
        await page.screenshot({ path: 'artifacts/hitboxes-closeup.png' });
        await page.evaluate(() => {
          window.__hitboxPreview.scene.dispose();
          window.__hitboxPreview.element.remove();
          delete window.__hitboxPreview;
        });
      }
    } finally {
      await page.close();
    }
  }
  console.log(
    'PASS: H/settings debug toggles, unchanged physics, all traffic/body outlines, all eight models match collision geometry, wider rendered shoulders, mobile/desktop, default-off refresh.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mkdir('artifacts', { recursive: true });
  const browser = await chromium.launch({
    channel: process.env.CHROME_CHANNEL || 'chrome',
    headless: true,
  });
  const errors = [];
  try {
    await checkHitboxes(browser, process.env.TEST_URL || 'http://127.0.0.1:5173', errors);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
