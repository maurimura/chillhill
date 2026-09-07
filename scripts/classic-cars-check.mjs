import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function checkClassicCars(
  browser,
  origin,
  errors,
  ids = ['renault-12', 'porsche-911', 'testarossa', 'peugeot-206', 'camaro-ss', 'mustang-fastback'],
) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${origin}/#garage`);
    await page.waitForFunction(() => window.__chillhill?.garage);
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const mirrorChecks = await page.evaluate(async (ids) => {
      const { buildVehicle } = await import('/src/game/vehicles.ts');
      const results = [];
      for (const id of ids.filter((id) => ['porsche-911', 'testarossa'].includes(id))) {
        for (const softness of [0, 0.65, 1]) {
          const visual = buildVehicle(id, softness, '#a7b4b9');
          visual.root.updateMatrixWorld(true);
          const left = [],
            right = [],
            point = visual.root.position.clone();
          visual.root.traverse((mesh) => {
            const positions = mesh.geometry?.getAttribute('position');
            if (!positions) return;
            for (let i = 0; i < positions.count; i++) {
              point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
              const outside = Math.abs(point.x) > (id === 'porsche-911' ? 0.8 : 0.9);
              const atMirror =
                point.y > (id === 'porsche-911' ? 0.91 : 0.89) &&
                point.z > -0.62 &&
                point.z < -0.29;
              if (outside && atMirror)
                (point.x < 0 ? left : right).push([Math.abs(point.x), point.y, point.z]);
            }
          });
          const bounds = (points) =>
            [0, 1, 2].map((axis) => [
              Math.min(...points.map((p) => p[axis])),
              Math.max(...points.map((p) => p[axis])),
            ]);
          results.push({
            id,
            softness,
            left: left.length,
            right: right.length,
            leftBounds: bounds(left),
            rightBounds: bounds(right),
          });
          visual.dispose();
        }
      }
      return results;
    }, ids);
    for (const result of mirrorChecks) {
      assert.ok(
        result.left > 50 && result.right > 50,
        `${result.id}/${result.softness}: actual baked geometry includes both mirrors`,
      );
      for (let axis = 0; axis < 3; axis++)
        for (let end = 0; end < 2; end++)
          assert.ok(
            Math.abs(result.leftBounds[axis][end] - result.rightBounds[axis][end]) < 0.003,
            `${result.id}: matching driver/passenger mirror dimensions`,
          );
    }
    for (const id of ids) {
      await page.locator(`[data-garage-car="${id}"]`).click();
      await page.waitForFunction((id) => window.__chillhill.garage.car === id, id);
      await page.locator('#garage-softness').fill('0.65');
      await page.waitForTimeout(250);
      for (const angle of ['hero', 'front', 'side', 'rear']) {
        await page.locator(`[data-garage-angle="${angle}"]`).click();
        await page.waitForTimeout(120);
        await page
          .locator('#garage-canvas')
          .screenshot({ path: `artifacts/${id}-garage-${angle}.png` });
      }
      for (const softness of [0, 1]) {
        await page.locator('#garage-softness').fill(String(softness));
        await page.waitForTimeout(250);
        await page.locator('[data-garage-angle="hero"]').click();
        await page
          .locator('#garage-canvas')
          .screenshot({ path: `artifacts/${id}-garage-softness-${softness}.png` });
      }
      await page.locator('#garage-softness').fill('0.65');
      await page.locator('#garage-hex').fill('#426453');
      await page.waitForFunction(() => window.__chillhill.garage.paint === '#426453');
      assert.equal(
        await page.evaluate((id) => window.__chillhill.settings.paint[id], id),
        '#426453',
      );
      await page.locator('#garage-paint-reset').click();
      assert.equal(await page.evaluate((id) => window.__chillhill.settings.paint[id], id), null);
    }
    await page.locator('#back-drive').click();
    await page.waitForFunction(() => window.__chillhill.driveReady);
    await page.locator('#start').click();
    for (const id of ids) {
      await page.locator('#open-car-menu').click();
      const before = await page.evaluate(() => window.__chillhill.state);
      await page.locator(`[data-car="${id}"]`).click();
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => window.__chillhill.settings.car), id);
      assert.deepEqual(await page.evaluate(() => window.__chillhill.state), before);
      await page.locator('#close-car-menu').click();
      await page.keyboard.down('v');
      await page.waitForFunction(() => window.__chillhill.cameraMode === 'front');
      await page.waitForTimeout(200);
      await page.screenshot({ path: `artifacts/${id}-driving-front.png` });
      await page.keyboard.up('v');
    }
    await page.reload();
    await page.waitForFunction(() => window.__chillhill?.driveReady);
    assert.equal(await page.evaluate(() => window.__chillhill.settings.car), ids.at(-1));
  } finally {
    await page.close();
  }
  console.log(
    'PASS: classic-car garage views/softness, independent paint, drive selection, held-V camera and persistence.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mkdir('artifacts', { recursive: true });
  const browser = await chromium.launch({
    channel: process.env.CHROME_CHANNEL || 'chrome',
    headless: true,
  });
  try {
    const errors = [];
    await checkClassicCars(
      browser,
      process.env.TEST_URL || 'http://127.0.0.1:5173',
      errors,
      process.env.TEST_CARS?.split(','),
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
