import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const places = {
  'city-afterglow': 'city',
  'desert-quiet': 'desert',
  'alpine-lakes': 'lakes',
  tallwood: 'forest',
};

export async function checkLandscapes(browser, origin, errors) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(origin);
  await page.waitForFunction(() => window.__chillhill?.driveReady);
  await page.locator('#start').click();
  for (const [recipe, landscape] of Object.entries(places)) {
    await page.locator('#open-world-menu').click();
    const before = await page.evaluate(() => ({
      state: window.__chillhill.state,
      car: window.__chillhill.settings.car,
      paint: window.__chillhill.settings.paint,
    }));
    await page.locator(`[data-scene="${recipe}"]`).click();
    await page.waitForFunction(
      (value) => window.__chillhill.environment.landscape === value,
      landscape,
    );
    assert.deepEqual(
      await page.evaluate(() => ({
        state: window.__chillhill.state,
        car: window.__chillhill.settings.car,
        paint: window.__chillhill.settings.paint,
      })),
      before,
    );
    await page.locator('#close-world-menu').click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `artifacts/${recipe}.png` });
    await page.keyboard.down('v');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `artifacts/${recipe}-front.png` });
    await page.keyboard.up('v');
  }
  await page.locator('#open-world-menu').click();
  await page.locator('[data-scene="city-afterglow"]').click();
  await page.locator('#world-timeOfDay').selectOption('night');
  await page.locator('#world-weather').selectOption('rain');
  await page.locator('#close-world-menu').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'artifacts/city-afterglow-night.png' });
  await page.locator('#open-world-menu').click();

  const result = await page.evaluate(async () => {
    const { GameScene } = await import('/src/game/scene.ts');
    const { defaults } = await import('/src/config.ts');
    const { initialState } = await import('/src/game/driving.ts');
    const recipes = (await import('/src/config/scenes.json')).default;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;width:360px;height:260px;left:-1000px;top:0';
    document.body.append(host);
    const scene = new GameScene(host, defaults);
    const results = {};
    const render = (settings, distance, front = false) => {
      scene.applySettings(settings);
      scene.render({ ...initialState(), distance, speed: 20 }, 0, true, false, false, front);
      scene.scene.traverse((item) => (item.frustumCulled = false));
      scene.render({ ...initialState(), distance, speed: 20 }, 0, true, false, false, front);
      const world = scene.scene.getObjectByName('streamed-world');
      if (world.children.length !== 7) throw new Error('Landscape exceeds seven resident chunks');
      let waterPieces = 0,
        buildings = 0,
        trunks = 0,
        mesas = 0;
      world.traverse((item) => {
        if (item.name === 'city-buildings') buildings += item.count;
        if (item.name === 'sandstone-mesa') mesas++;
        if (item.name === 'tallwood-trunks') trunks += item.count;
        if (item.name === 'alpine-lake') {
          waterPieces++;
          const vertices = item.geometry.attributes.position;
          for (let i = 0; i < vertices.count; i++) {
            if (Math.abs(vertices.getY(i) - vertices.getY(0)) > 1e-6)
              throw new Error('Lake is not level');
            if (![vertices.getX(i), vertices.getY(i), vertices.getZ(i)].every(Number.isFinite))
              throw new Error('Invalid lake vertex');
          }
        }
      });
      return {
        geometries: scene.renderer.info.memory.geometries,
        buildings,
        trunks,
        mesas,
        waterPieces,
      };
    };
    for (const [id, type] of Object.entries({
      'city-afterglow': 'city',
      'desert-quiet': 'desert',
      'alpine-lakes': 'lakes',
      tallwood: 'forest',
    })) {
      const settings = { ...defaults, ...recipes[id].settings };
      const samples = [];
      for (const distance of [20, 200, 740, 10000000, 10000180]) {
        samples.push(render(settings, distance));
        samples.push(render(settings, distance, true));
      }
      const ids = () =>
        scene.scene
          .getObjectByName('streamed-world')
          .children.map((chunk) => chunk.uuid)
          .join(',');
      const before = ids();
      const lamps = [];
      for (const timeOfDay of ['day', 'night']) {
        render({ ...settings, timeOfDay, weather: 'rain' }, 10000180, true);
        const lens = scene.scene.getObjectByName('city-lamp-lenses');
        if (lens) lamps.push(lens.material.emissiveIntensity);
      }
      if (ids() !== before) throw new Error('Weather rebuilt landscape chunks');
      results[type] = { samples, lamps };
    }
    // Revisit each shape/landscape repeatedly: old geometry and instance buffers must go away.
    const cycles = [];
    for (let cycle = 0; cycle < 3; cycle++) {
      const counts = [];
      for (const id of ['city-afterglow', 'alpine-lakes', 'tallwood', 'desert-quiet'])
        for (const roundness of [0, 1])
          counts.push(render({ ...defaults, ...recipes[id].settings, roundness }, 200).geometries);
      cycles.push(counts);
    }
    scene.dispose();
    host.remove();
    return { results, cycles };
  });
  for (const [place, { samples }] of Object.entries(result.results)) {
    assert.ok(
      samples.every((sample) => sample.geometries < 220),
      `${place}: bounded geometry`,
    );
    const property = { city: 'buildings', desert: 'mesas', lakes: 'waterPieces', forest: 'trunks' }[
      place
    ];
    assert.ok(
      samples.every((sample) => sample[property] > 0),
      `${place}: distinctive actual scenery in both cameras`,
    );
  }
  assert.ok(
    result.results.city.lamps[1] > result.results.city.lamps[0],
    'street lamps respond without rebuilding',
  );
  assert.deepEqual(
    result.cycles[1],
    result.cycles[2],
    'repeated landscape/softness switches release old resources',
  );
  await page.close();
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  mobile.on('pageerror', (error) => errors.push(error.message));
  await mobile.goto(origin);
  await mobile.waitForFunction(() => window.__chillhill?.driveReady);
  await mobile.locator('#start').tap();
  for (const [recipe, landscape] of Object.entries(places)) {
    await mobile.locator('#open-world-menu').tap();
    await mobile.locator(`[data-scene="${recipe}"]`).tap();
    await mobile.waitForFunction(
      (value) => window.__chillhill.environment.landscape === value,
      landscape,
    );
    await mobile.screenshot({ path: `artifacts/${recipe}-menu-mobile.png` });
    await mobile.locator('#close-world-menu').tap();
    await mobile.waitForTimeout(500);
    await mobile.screenshot({ path: `artifacts/${recipe}-mobile.png` });
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await mobile.reload();
  await mobile.waitForFunction(() => window.__chillhill?.driveReady);
  assert.equal(await mobile.evaluate(() => window.__chillhill.settings.landscape), 'forest');
  await mobile.close();
  console.log(
    'PASS: four distinct landscapes, level lake geometry, responsive presets, independent weather, preserved journey, both cameras, 10,000km rebasing and bounded resource recycling.',
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
    await checkLandscapes(browser, process.env.TEST_URL || 'http://127.0.0.1:5173', errors);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
