import assert from 'node:assert/strict';
import { selectGarageTool } from './garage-tools.mjs';

const currentKey = 'chillhill.settings.v1';
const legacyKey = 'chill-the-hill.settings.v1';
const peugeotId = 'peugeot-206';
const fixture = {
  car: 'astra-sedan',
  paint: { 'astra-sedan': '#123456', astra: '#abcdef', wagon: '#654321' },
  landscape: 'city',
  weather: 'rain',
  cruiseSpeed: 29,
};

async function expectPreservedSettings(page) {
  const settings = await page.evaluate(() => window.__chillhill.settings);
  assert.equal(
    settings.paint.astra,
    '#abcdef',
    'retiring the sedan must not overwrite hatch paint',
  );
  assert.equal(settings.paint.wagon, '#654321', 'unrelated car paint must survive catalog changes');
  assert.equal(settings.landscape, 'city');
  assert.equal(settings.weather, 'rain');
  assert.equal(settings.cruiseSpeed, 29, 'car fallback must not reset handling preferences');
}

/** Catalog retirement is a save-compatibility change, not just a hidden button. */
export async function checkRetiredCar(browser, origin, errors) {
  for (const storageKey of [currentKey, legacyKey]) {
    const legacy = storageKey === legacyKey;
    const context = await browser.newContext({
      viewport: legacy ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: legacy,
      hasTouch: legacy,
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await context.addInitScript(
      ({ storageKey, fixture }) => {
        // A reload must exercise the real persisted save, not reinstall the fixture.
        if (sessionStorage.getItem('retired-car-fixture')) return;
        localStorage.setItem(storageKey, JSON.stringify(fixture));
        sessionStorage.setItem('retired-car-fixture', 'ready');
      },
      { storageKey, fixture },
    );
    try {
      await page.goto(origin);
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      assert.equal(await page.evaluate(() => window.__chillhill.settings.car), 'astra');
      assert.equal(await page.evaluate(() => window.__chillhill.paintColor), '#abcdef');
      await expectPreservedSettings(page);
      assert.equal(
        await page.locator('[data-car="astra-sedan"], [data-garage-car="astra-sedan"]').count(),
        0,
        'the retired sedan must be absent from both car pickers',
      );
      if (legacy) {
        assert.deepEqual(
          await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), currentKey),
          fixture,
          'legacy migration must copy the original save before later edits',
        );
      }

      await page.locator('#open-car-menu').click();
      const quickPeugeot = page.locator(`[data-car="${peugeotId}"]`);
      assert.equal(await quickPeugeot.count(), 1);
      assert.equal(await quickPeugeot.isVisible(), true);
      assert.match(await quickPeugeot.innerText(), /Peugeot 206/i);
      await quickPeugeot.click();
      await page.waitForFunction((id) => window.__chillhill.settings.car === id, peugeotId);
      assert.equal(await quickPeugeot.getAttribute('aria-pressed'), 'true');
      await expectPreservedSettings(page);

      await page.locator('#open-garage').click();
      await page.waitForFunction((id) => window.__chillhill?.garage?.car === id, peugeotId);
      const garagePeugeot = page.locator(`[data-garage-car="${peugeotId}"]`);
      assert.equal(await garagePeugeot.count(), 1);
      assert.equal(await garagePeugeot.isVisible(), true);
      assert.match(await garagePeugeot.innerText(), /Peugeot 206/i);
      assert.equal(await page.locator('[data-garage-car="astra-sedan"]').count(), 0);
      await selectGarageTool(page, 'paint');
      await page.locator('#garage-hex').fill('#A15F82');
      await page.waitForFunction(() => window.__chillhill.garage.paint === '#a15f82');
      await expectPreservedSettings(page);

      await page.reload();
      await page.waitForFunction((id) => window.__chillhill?.garage?.car === id, peugeotId);
      assert.equal(await page.evaluate(() => window.__chillhill.garage.paint), '#a15f82');
      assert.equal(
        await page.evaluate((id) => window.__chillhill.settings.paint[id], peugeotId),
        '#a15f82',
      );
      await expectPreservedSettings(page);
      // Check actual model paint, not only the saved JSON values.
      for (const [id, color] of [
        ['astra', '#abcdef'],
        ['wagon', '#654321'],
        [peugeotId, '#a15f82'],
      ]) {
        await page.locator(`[data-garage-car="${id}"]`).click();
        await page.waitForFunction(
          ({ id, color }) =>
            window.__chillhill.garage.car === id && window.__chillhill.garage.paint === color,
          { id, color },
        );
      }
      await page.locator('#back-drive').click();
      await page.waitForFunction(
        () => window.__chillhill?.driveReady && window.__chillhill.view === 'drive',
      );
      assert.equal(await page.evaluate(() => window.__chillhill.paintColor), '#a15f82');
      await expectPreservedSettings(page);
      const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), currentKey);
      assert.equal(saved.car, peugeotId);
      assert.equal(saved.paint[peugeotId], '#a15f82');
      assert.equal(saved.paint.astra, '#abcdef');
      assert.equal(saved.paint.wagon, '#654321');
      if (legacy) {
        assert.deepEqual(
          await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), legacyKey),
          fixture,
          'legacy backup must remain untouched after paint and car changes',
        );
      }
    } finally {
      await context.close();
    }
  }
  console.log(
    'PASS: retired sedan falls back safely, Peugeot appears in both pickers, existing paints/world/handling survive, and new paint persists across current and legacy saves.',
  );
}
