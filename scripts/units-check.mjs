import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { selectGarageTool } from './garage-tools.mjs';
import { checkContrast } from './readability-check.mjs';

export async function checkUnits(browser, origin, errors) {
  for (const [locale, saved, expected] of [
    ['es-AR', undefined, 'metric'],
    ['en-US', undefined, 'imperial'],
    ['en-GB', undefined, 'imperial'],
    ['en-CA', undefined, 'metric'],
    ['en-US', 'metric', 'metric'],
    ['es-AR', 'imperial', 'imperial'],
    ['en-US', 'invalid', 'imperial'],
  ]) {
    const page = await browser.newPage({ locale });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((units) => {
      if (!localStorage.getItem('chillhill.settings.v1'))
        localStorage.setItem(
          'chillhill.settings.v1',
          JSON.stringify({ units, treeDensity: 0, autoTime: false }),
        );
    }, saved);
    try {
      await page.goto(origin);
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      assert.equal(
        await page.evaluate(() => window.__chillhill.unitSystem),
        expected,
        `${locale}/${saved}`,
      );
      assert.equal(
        await page.locator('#speed-unit').innerText(),
        expected === 'metric' ? 'KM/H' : 'MPH',
      );
      await page.locator('#open-settings').click();
      assert.equal(
        await page.locator('#units').inputValue(),
        ['metric', 'imperial'].includes(saved) ? saved : 'auto',
      );
      await page.locator('#units').selectOption(expected === 'metric' ? 'imperial' : 'metric');
      await page.reload();
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      assert.equal(
        await page.evaluate(() => window.__chillhill.unitSystem),
        expected === 'metric' ? 'imperial' : 'metric',
        'manual choice survives reload',
      );
    } finally {
      await page.close();
    }
  }

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport, locale: 'es-AR' });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const request = requestAnimationFrame.bind(window);
      const callbacks = new Map();
      let serial = -1,
        time;
      window.requestAnimationFrame = (callback) => {
        if (callback.name !== 'frame') return request(callback);
        const id = serial--;
        callbacks.set(id, callback);
        return id;
      };
      window.__unitsAdvance = (seconds) => {
        for (let i = 0; i < seconds * 30; i++) {
          time = (time ?? performance.now()) + 1000 / 30;
          const pending = [...callbacks.values()];
          callbacks.clear();
          pending.forEach((callback) => callback(time));
        }
      };
    });
    try {
      await page.goto(origin);
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      await page.locator('#start').click();
      await page.evaluate(() => window.__unitsAdvance(15));
      await page.locator('#open-settings').click();
      const before = await page.evaluate(() => window.__chillhill);
      await page.locator('#units').selectOption('imperial');
      const after = await page.evaluate(() => window.__chillhill);
      assert.deepEqual(after.state, before.state, 'unit switching cannot change physics/progress');
      assert.deepEqual(after.worldClock, before.worldClock);
      assert.deepEqual({ ...after.settings, units: before.settings.units }, before.settings);
      assert.equal(
        await page.locator('#speed').innerText(),
        String(Math.round((before.state.speed * 3.6) / 1.609344)).padStart(2, '0'),
      );
      assert.equal(
        await page.locator('#distance').innerText(),
        (before.state.travelled / 1609.344).toFixed(2),
      );
      assert.equal(await page.locator('#distance-unit').innerText(), 'mi wandered');
      assert.equal(await page.locator('#roadWidth-value').innerText(), '32.8 ft');
      assert.equal(await page.locator('#maxSpeed-value').innerText(), '68.4 mph');
      assert.equal(await page.locator('#maxSpeed').getAttribute('aria-valuetext'), '68.4 mph');
      await page.locator('#maxSpeed').fill('100');
      assert.equal(await page.locator('#maxSpeed-value').innerText(), '62.1 mph');
      assert.equal(await page.evaluate(() => window.__chillhill.settings.maxSpeed), 100);
      await checkContrast(page, ['.units-picker > label', '#units', '#units-note']);
      await page.locator('#units').scrollIntoViewIfNeeded();
      const unitBox = await page.locator('#units').boundingBox();
      const noteBox = await page.locator('#units-note').boundingBox();
      assert.ok(noteBox.y >= unitBox.y + unitBox.height + 8, 'the units note clears the selector');
      await page.screenshot({ path: `artifacts/units-settings-${viewport.width}.png` });
      const downloading = page.waitForEvent('download');
      await page.locator('#export-settings').click();
      const file = await downloading;
      const exported = JSON.parse(await readFile(await file.path(), 'utf8'));
      assert.equal(exported.units, 'imperial');
      assert.equal(exported.maxSpeed, 100, 'exports keep canonical km/h');
      assert.equal(exported.roadWidth, 10, 'exports keep canonical metres');
      assert.equal(
        await page.evaluate(async () => {
          const { sceneSnapshot } = await import('/src/config/scenes.ts');
          return Object.hasOwn(sceneSnapshot(window.__chillhill.settings), 'units');
        }),
        false,
        'scenery recipes do not override units',
      );
      await page.locator('#close-settings').click();
      await page.screenshot({ path: `artifacts/units-driving-${viewport.width}.png` });
      await page.locator('#open-car-menu').click();
      assert.match(await page.locator('#car-spec').innerText(), /13.78 ft long/);
      await page.locator('#open-garage').click();
      await page.waitForFunction(() => window.__chillhill.view === 'garage');
      await selectGarageTool(page, 'details');
      assert.match(await page.locator('#garage-specs').innerText(), /13.78 ft/);
      await page.locator('#back-drive').click();
      await page.waitForFunction(() => window.__chillhill.view === 'drive');
      await page.locator('#open-settings').click();
      await page.locator('#units').selectOption('metric');
      await page.locator('#close-settings').click();
      await page.locator('#open-car-menu').click();
      await page.locator('#open-garage').click();
      await page.waitForFunction(() => window.__chillhill.view === 'garage');
      await selectGarageTool(page, 'details');
      assert.match(await page.locator('#garage-specs').innerText(), /4.199 m/);
      await page.locator('#back-drive').click();
      await page.waitForFunction(() => window.__chillhill.view === 'drive');
      await page.locator('#open-settings').click();
      await page.locator('#units').selectOption('auto');
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'languages', { configurable: true, value: ['en-US'] });
        dispatchEvent(new Event('languagechange'));
      });
      assert.equal(await page.locator('#speed-unit').innerText(), 'MPH');
      await page.locator('#units').selectOption('metric');
      await page.evaluate(() => dispatchEvent(new Event('languagechange')));
      assert.equal(
        await page.locator('#speed-unit').innerText(),
        'KM/H',
        'locale changes never override a manual selection',
      );
    } finally {
      await page.close();
    }
  }
  console.log(
    'PASS: locale defaults, manual override/persistence, HUD and accessible slider conversion, car/garage specs, canonical exports, locale changes, unchanged journey, desktop/mobile.',
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
    await checkUnits(browser, process.env.TEST_URL || 'http://127.0.0.1:5173', errors);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
