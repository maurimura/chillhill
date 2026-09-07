import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function checkWorld(browser, origin, errors) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(origin);
  await page.waitForFunction(() => window.__chillhill?.driveReady);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#start').click();
  await page.waitForFunction(() => window.__chillhill.state.speed > 2);
  await page.locator('#open-world-menu').click();
  const original = await page.evaluate(() => ({ ...window.__chillhill.state }));
  await page.locator('[data-scene="summer-coast"]').click();
  await page.waitForFunction(() => window.__chillhill.environment.landscape === 'coast');
  assert.deepEqual(await page.evaluate(() => window.__chillhill.state), original);
  assert.equal(await page.evaluate(() => window.__chillhill.settings.car), 'astra');
  await page.screenshot({ path: 'artifacts/world-composer.png' });
  await page.locator('#close-world-menu').click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'artifacts/summer-coast.png' });
  await page.keyboard.down('v');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'artifacts/coast-front-camera.png' });
  await page.keyboard.up('v');
  await page.locator('#open-world-menu').click();
  await page.locator('#world-weather').selectOption('rain');
  await page.locator('#world-timeOfDay').selectOption('sunset');
  await page.locator('#open-settings').click();
  await page.locator('#world-weatherIntensity').fill('0.7');
  await page.waitForFunction(() => window.__chillhill.environment.particles === 420);
  const frozen = await page.evaluate(() => window.__chillhill.environment.weatherTime);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__chillhill.environment.weatherTime), frozen);
  assert.equal(await page.evaluate(() => window.__chillhill.settings.landscape), 'coast');
  await page.locator('#close-settings').click();
  await page.waitForTimeout(1200);
  assert.ok(
    await page.evaluate((before) => window.__chillhill.environment.weatherTime > before, frozen),
  );
  await page.screenshot({ path: 'artifacts/coastal-rain.png' });
  await page.locator('#open-world-menu').click();
  await page.locator('#world-timeOfDay').selectOption('night');
  await page.locator('#world-weather').selectOption('clear');
  await page.locator('#close-world-menu').click();
  await page.waitForFunction(() => window.__chillhill.environment.headlight > 125);
  await page.screenshot({ path: 'artifacts/coast-moonlight.png' });
  await page.locator('#open-world-menu').click();
  await page.locator('#world-season').selectOption('winter');
  await page.locator('#world-weather').selectOption('snow');
  await page.locator('#world-timeOfDay').selectOption('day');
  await page.locator('#open-settings').click();
  await page
    .locator('#world-roadSurface')
    .evaluate((input) => (input.closest('details').open = true));
  await page.locator('#world-roadSurface').selectOption('gravel');
  await page.locator('#world-roadMarkings').selectOption('none');
  await page.locator('#world-roadside').selectOption('posts');
  await page.locator('#close-settings').click();
  await page.waitForTimeout(1300);
  await page.screenshot({ path: 'artifacts/coast-winter-mix.png' });
  await page.locator('#open-settings').click();
  await page.locator('#scene-name').evaluate((input) => (input.closest('details').open = true));
  await page.locator('#scene-name').fill('<b>My winter coast</b>');
  await page.locator('#save-scene').click();
  assert.equal(await page.locator('#saved-scenes option').count(), 2);
  assert.equal(await page.locator('#saved-scenes b').count(), 0, 'scene names remain plain text');
  const downloading = page.waitForEvent('download');
  await page.locator('#export-scene').click();
  const download = await downloading,
    stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8'),
    file = JSON.parse(text);
  assert.equal(file.settings.landscape, 'coast');
  assert.equal(file.settings.roadSurface, 'gravel');
  assert.equal(Object.hasOwn(file.settings, 'car'), false);
  const selected = file.settings;
  await page.locator('#close-settings').click();
  await page.locator('#open-world-menu').click();
  await page.locator('[data-scene="greenridge"]').click();
  await page.locator('#open-settings').click();
  await page
    .locator('#scene-file')
    .setInputFiles({ name: 'coast.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await page.waitForFunction(() =>
    document.querySelector('#scene-status').textContent.startsWith('Loaded'),
  );
  for (const [key, value] of Object.entries(selected))
    assert.equal(await page.evaluate((key) => window.__chillhill.settings[key], key), value);
  const beforeBadFile = await page.evaluate(() => window.__chillhill.settings);
  await page.locator('#scene-file').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...file, settings: { weather: 'unknown' } })),
  });
  await page.waitForFunction(() =>
    document.querySelector('#scene-status').textContent.includes('Unknown weather'),
  );
  assert.deepEqual(await page.evaluate(() => window.__chillhill.settings), beforeBadFile);
  assert.match(await page.locator('#scene-status').textContent(), /has not changed/);
  await page.reload();
  await page.waitForFunction(() => window.__chillhill?.driveReady);
  for (const [key, value] of Object.entries(selected)) {
    const actual = await page.evaluate((key) => window.__chillhill.settings[key], key);
    if (key === 'seed') assert.notEqual(actual, value, 'reload starts a fresh route');
    else assert.equal(actual, value, 'other saved scenery preferences survive reload');
  }
  await page.locator('#open-settings').click();
  await page.locator('#scene-name').evaluate((input) => (input.closest('details').open = true));
  assert.equal(await page.locator('#saved-scenes option').count(), 2);
  await page.locator('#close-settings').click();
  await page.locator('#open-world-menu').click();
  await page.locator('[data-scene="summer-coast"]').click();
  await page.locator('#open-settings').click();
  await page.locator('#saved-scenes').selectOption('0');
  await page.locator('#load-scene').click();
  assert.equal(await page.evaluate(() => window.__chillhill.settings.season), 'winter');
  await page.locator('#delete-scene').click();
  assert.equal(await page.locator('#saved-scenes option').count(), 1);
  assert.equal(await page.evaluate(() => window.__chillhill.settings.season), 'winter');

  const resourceCheck = await page.evaluate(async () => {
    const { GameScene } = await import('/src/game/scene.ts');
    const { defaults } = await import('/src/config.ts');
    const { initialState } = await import('/src/game/driving.ts');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;width:400px;height:300px;left:-1000px;top:0';
    document.body.append(host);
    const settings = { ...defaults, landscape: 'coast', style: 'coastal', roadside: 'barriers' };
    const scene = new GameScene(host, settings),
      counts = [],
      water = [];
    for (const distance of [20, 200, 380, 560, 740, 10000000, 10000180]) {
      const state = { ...initialState(), distance, speed: 20 };
      scene.render(state, 0, true, false);
      scene.scene.traverse((item) => (item.frustumCulled = false));
      scene.render(state, 0, true, false);
      counts.push(scene.renderer.info.memory.geometries);
      water.push(
        scene.scene
          .getObjectByName('streamed-world')
          .children.filter((chunk) => chunk.getObjectByName('coastal-water')).length,
      );
      if (scene.scene.getObjectByName('streamed-world').children.length !== 7)
        throw new Error('unbounded coast');
    }
    const state = { ...initialState(), distance: 10000180, speed: 20 };
    const ids = () =>
      scene.scene
        .getObjectByName('streamed-world')
        .children.map((chunk) => chunk.uuid)
        .join(',');
    const before = ids();
    scene.applySettings({ ...settings, weather: 'rain', timeOfDay: 'night' });
    scene.render(state, 1, true, false);
    const after = ids();
    const toggles = [];
    for (let i = 0; i < 3; i++) {
      scene.applySettings({
        ...settings,
        landscape: 'highlands',
        season: 'winter',
        roadSurface: 'gravel',
        roadMarkings: 'none',
      });
      scene.render(state, 0, true, false);
      scene.applySettings(settings);
      scene.render(state, 0, true, false);
      scene.scene.traverse((item) => (item.frustumCulled = false));
      scene.render(state, 0, true, false);
      toggles.push(scene.renderer.info.memory.geometries);
    }
    const result = { counts, water, before, after, toggles };
    scene.dispose();
    host.remove();
    return result;
  });
  assert.ok(resourceCheck.water.every((count) => count === 7));
  assert.equal(new Set(resourceCheck.counts).size, 1, 'coast geometry is bounded after 10,000 km');
  assert.equal(
    new Set(resourceCheck.toggles).size,
    1,
    'switching landscapes releases old resources',
  );
  assert.equal(
    resourceCheck.before,
    resourceCheck.after,
    'lighting and weather do not rebuild the road',
  );
  await page.close();

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  mobile.on('pageerror', (error) => errors.push(error.message));
  mobile.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await mobile.goto(origin);
  await mobile.waitForFunction(() => window.__chillhill?.driveReady);
  await mobile.locator('#open-world-menu').tap();
  await mobile.locator('[data-scene="summer-coast"]').tap();
  await mobile.screenshot({ path: 'artifacts/world-composer-mobile.png' });
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mobile.locator('#close-world-menu').tap();
  await mobile.locator('#start').tap();
  await mobile.waitForTimeout(900);
  await mobile.screenshot({ path: 'artifacts/summer-coast-mobile.png' });
  const nav = await mobile.locator('.site-header').boundingBox();
  const label = await mobile.locator('.world-label').boundingBox();
  const weather = await mobile.locator('#open-world-menu').boundingBox();
  assert.ok(label.y >= nav.y && label.y + label.height <= nav.y + nav.height);
  assert.ok(label.x + label.width <= (await mobile.locator('.header-actions').boundingBox()).x);
  assert.ok(weather.y >= nav.y && weather.y + weather.height <= nav.y + nav.height);
  await mobile.close();
  console.log(
    'PASS: independent world ingredients, coast/front/night/rain/snow/gravel, scene save/copy/import/export/validation/persistence, unchanged handling/journey, frozen precipitation while paused, mobile UI, and bounded coastal streaming at 10,000 km.',
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
    await checkWorld(browser, process.env.TEST_URL || 'http://127.0.0.1:5173', errors);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
