import assert from 'node:assert/strict';

export async function checkRouteRefresh(browser, origin, errors) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.addInitScript(() => {
      if (localStorage.getItem('refresh-fixture')) return;
      localStorage.setItem(
        'chillhill.settings.v1',
        JSON.stringify({
          car: 'peugeot-206',
          paint: { 'peugeot-206': '#943b42' },
          landscape: 'forest',
          weather: 'snow',
          season: 'winter',
          timeOfDay: 'night',
          seed: 19,
        }),
      );
      localStorage.setItem('refresh-fixture', 'ready');
    });
    await page.goto(`${origin}/#garage`);
    const seeds = new Set(),
      roads = new Set();
    for (let i = 0; i < 4; i++) {
      if (i) await page.reload();
      await page.waitForFunction(() => window.__chillhill?.garage);
      const settings = await page.evaluate(() => window.__chillhill.settings);
      assert.equal(settings.car, 'peugeot-206');
      assert.equal(settings.paint['peugeot-206'], '#943b42');
      assert.equal(settings.landscape, 'forest');
      assert.equal(settings.weather, 'snow');
      assert.equal(settings.season, 'winter');
      assert.equal(settings.timeOfDay, 'night');
      assert.notEqual(settings.seed, 19);
      seeds.add(settings.seed);
      roads.add(
        await page.evaluate(async () => {
          const { roadAt } = await import('/src/game/route.ts');
          return JSON.stringify(
            [20, 180, 620, 1240].map((s) => roadAt(s, window.__chillhill.settings)),
          );
        }),
      );
    }
    assert.equal(seeds.size, 4, 'refresh produces four different seeds');
    assert.equal(roads.size, 4, 'actual road geometry changes, not only tree placement');
    const seed = await page.evaluate(() => window.__chillhill.settings.seed);
    await page.locator('#back-drive').click();
    await page.waitForFunction(() => window.__chillhill.driveReady);
    await page.locator('#open-world-menu').click();
    await page.locator('[data-scene="tallwood"]').click();
    assert.equal(
      await page.evaluate(() => window.__chillhill.settings.seed),
      seed,
      'a scenery preset does not put the route back on its fixed demo seed',
    );
    assert.equal(
      await page.locator('[data-scene="tallwood"]').getAttribute('aria-pressed'),
      'true',
    );
    await page.locator('#close-world-menu').click();
    await page.locator('#open-settings').click();
    await page.locator('#seed').fill('12345');
    await page.locator('#close-settings').click();
    await page.locator('#start').click();
    await page.locator('#restart').click();
    assert.equal(
      await page.evaluate(() => window.__chillhill.settings.seed),
      12345,
      'restart keeps the current road',
    );
    await page.locator('#open-car-menu').click();
    await page.locator('#open-garage').click();
    await page.waitForFunction(() => window.__chillhill.garage);
    assert.equal(await page.evaluate(() => window.__chillhill.settings.seed), 12345);
    await page.reload();
    await page.waitForFunction(() => window.__chillhill.garage);
    assert.notEqual(await page.evaluate(() => window.__chillhill.settings.seed), 12345);
  } finally {
    await page.close();
  }
  const privatePage = await browser.newPage();
  try {
    await privatePage.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('Unavailable', 'SecurityError');
        },
      });
    });
    await privatePage.goto(`${origin}/#garage`);
    await privatePage.waitForFunction(() => window.__chillhill?.garage);
    assert.ok(await privatePage.evaluate(() => Number.isInteger(window.__chillhill.settings.seed)));
  } finally {
    await privatePage.close();
  }
  console.log(
    'PASS: refresh generates new roads while preserving preferences; presets/garage/restart retain the current route; explicit seeds and blocked storage still work.',
  );
}
