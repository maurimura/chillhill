import assert from 'node:assert/strict';
import { selectGarageTool } from './garage-tools.mjs';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function checkCarMenu(browser, origin, errors) {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({
      viewport: { width, height: width > 650 ? 1000 : 844 },
      isMobile: width < 650,
      hasTouch: width < 650,
    });
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(origin);
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      assert.equal(
        await page.evaluate(() => window.__chillhill.carPreviews.ready),
        false,
        'previews do not allocate WebGL on page load',
      );
      await page.locator('#start').click();
      await page.waitForFunction(() => window.__chillhill.state.speed > 2);
      await page.locator('#open-car-menu').click();
      const journey = await page.evaluate(() => window.__chillhill.state);
      await page.waitForFunction(() =>
        [...document.querySelectorAll('[data-car-thumbnail]')].every(
          (img) => !img.hidden && img.complete && img.naturalWidth === 360,
        ),
      );
      const snapshots = await page
        .locator('[data-car-thumbnail]')
        .evaluateAll((images) =>
          Object.fromEntries(images.map((img) => [img.dataset.carThumbnail, img.src])),
        );
      const expectedOrder = [
        'astra',
        'renault-12',
        'testarossa',
        'porsche-911',
        'camaro-ss',
        'mustang-fastback',
        'wagon',
        'peugeot-206',
      ];
      assert.deepEqual(
        await page
          .locator('[data-car]')
          .evaluateAll((buttons) => buttons.map((button) => button.dataset.car)),
        expectedOrder,
      );
      assert.deepEqual(
        await page
          .locator('[data-garage-car]')
          .evaluateAll((buttons) => buttons.map((button) => button.dataset.garageCar)),
        expectedOrder,
      );
      assert.equal(
        new Set(Object.values(snapshots)).size,
        await page.locator('[data-car]').count(),
        'each thumbnail is its own rendered 3D model',
      );
      assert.equal(await page.locator('#car-menu .car-profile').count(), 0);
      const positions = await page.locator('[data-car]').evaluateAll((buttons) =>
        buttons.map((button) => {
          const r = button.getBoundingClientRect();
          return { x: r.x, y: r.y, right: r.right };
        }),
      );
      assert.equal(positions[0].y, positions[1].y, 'two cards per row');
      assert.ok(positions[2].y > positions[0].y && positions[0].right < positions[1].x);
      const panel = await page.locator('#car-menu').boundingBox();
      assert.ok(
        panel.x >= 0 &&
          panel.x + panel.width <= width &&
          panel.y + panel.height <= (width > 650 ? 1000 : 844),
      );
      const renders = await page.evaluate(() => window.__chillhill.carPreviews.renders);
      await page.waitForTimeout(200);
      assert.equal(
        await page.evaluate(() => window.__chillhill.carPreviews.renders),
        renders,
        'cached previews do not animate or re-render while idle',
      );
      await page.locator('[data-car="peugeot-206"]').click();
      await page.locator('[data-quick-paint="#426453"]').click();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-car-thumbnail="peugeot-206"]').dataset.previewColor ===
          '#426453',
      );
      assert.equal(
        await page.evaluate(() => window.__chillhill.settings.paint['peugeot-206']),
        '#426453',
      );
      await page.waitForFunction(() => window.__chillhill.paintColor === '#426453');
      const changed = await page
        .locator('[data-car-thumbnail]')
        .evaluateAll((images) =>
          Object.fromEntries(images.map((img) => [img.dataset.carThumbnail, img.src])),
        );
      assert.notEqual(changed['peugeot-206'], snapshots['peugeot-206']);
      for (const id of Object.keys(snapshots).filter((id) => id !== 'peugeot-206'))
        assert.equal(changed[id], snapshots[id]);
      await page.locator('#quick-car-hex').fill('#bad');
      assert.equal(await page.locator('#quick-car-hex').getAttribute('aria-invalid'), 'true');
      assert.equal(
        await page.evaluate(() => window.__chillhill.settings.paint['peugeot-206']),
        '#426453',
      );
      await page.locator('#quick-car-hex').fill('#B96F53');
      await page.waitForFunction(() => window.__chillhill.paintColor === '#b96f53');
      await page.locator('#quick-car-color').fill('#537c96');
      await page.waitForFunction(() => window.__chillhill.paintColor === '#537c96');
      await page.locator('[data-car="astra"]').click();
      assert.equal(await page.evaluate(() => window.__chillhill.settings.paint.astra), null);
      await page.locator('[data-car="peugeot-206"]').click();
      assert.equal(await page.locator('#quick-car-color').inputValue(), '#537c96');
      await page.locator('#quick-car-hex').focus();
      await page.keyboard.press('w');
      assert.deepEqual(await page.evaluate(() => window.__chillhill.state), journey);
      await page.locator('#quick-car-hex').fill('#537C96');
      await page.locator('#car-options').evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.screenshot({ path: `artifacts/car-grid-${width}.png` });
      assert.ok(
        await page.evaluate(
          () =>
            window.__chillhill.carPreviews.cached <= document.querySelectorAll('[data-car]').length,
        ),
      );
      assert.equal(
        await page.evaluate(() => window.__chillhill.carPreviews.geometries),
        0,
        'snapshot model GPU geometry is disposed',
      );
      assert.ok(
        await page.evaluate(() => window.__chillhill.carPreviews.textures <= 1),
        'badge textures are disposed; only Three.js shared empty sampler texture may remain',
      );
      await page.locator('#open-garage').click();
      await page.waitForFunction(() => window.__chillhill.garage?.paint === '#537c96');
      await selectGarageTool(page, 'paint');
      await page.locator('[data-paint="#943b42"]').click();
      await page.locator('#back-drive').click();
      await page.locator('#open-car-menu').click();
      assert.equal(await page.locator('#quick-car-color').inputValue(), '#943b42');
      await page.waitForFunction(
        () =>
          document.querySelector('[data-car-thumbnail="peugeot-206"]').dataset.previewColor ===
          '#943b42',
      );
      await page.reload();
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      await page.locator('#open-car-menu').click();
      assert.equal(await page.locator('#quick-car-color').inputValue(), '#943b42');
      await page.locator('#quick-paint-reset').click();
      assert.equal(
        await page.evaluate(() => window.__chillhill.settings.paint['peugeot-206']),
        null,
      );
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'open-car-menu');
    } finally {
      await page.close();
    }
  }
  console.log(
    'PASS: responsive car grid, genuine cached model thumbnails, lazy/disposed GPU resources, swatch/hex/custom paint, validation, per-car persistence, garage sync, keyboard and preserved journeys.',
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
    await checkCarMenu(browser, process.env.TEST_URL || 'http://127.0.0.1:5173', errors);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
