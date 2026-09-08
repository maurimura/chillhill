import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  channel: process.env.CHROME_CHANNEL || 'chrome',
  headless: true,
});
try {
  await mkdir('artifacts', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173');
  await page.waitForFunction(() => window.__chillhill?.driveReady);
  const seed = await page.evaluate(() => window.__chillhill.settings.seed);
  await page.reload();
  await page.waitForFunction(() => window.__chillhill?.driveReady);
  assert.notEqual(await page.evaluate(() => window.__chillhill.settings.seed), seed);
  await page.locator('#open-settings').click();
  const curveLength = page.locator('input[data-setting="curveLength"]');
  const curveMix = page.locator('input[data-setting="curveMix"]');
  assert.equal(await curveLength.inputValue(), '1');
  assert.equal(await curveMix.inputValue(), '0.5');
  assert.equal(await curveMix.getAttribute('aria-valuetext'), 'Balanced');
  const original = await page.evaluate(() => window.__chillhill.settings);
  await curveLength.fill('1.4');
  await curveMix.fill('0.8');
  const changed = await page.evaluate(() => window.__chillhill.settings);
  assert.equal(changed.curveLength, 1.4);
  assert.equal(changed.curveMix, 0.8);
  assert.equal(await curveMix.getAttribute('aria-valuetext'), 'More sweeping');
  assert.equal(changed.curves, original.curves);
  assert.equal(changed.seed, original.seed);
  const serialization = await page.evaluate(async () => {
    const { defaults, normalizeSettings } = await import('/src/config.ts');
    const { serializeScene, readScene } = await import('/src/config/scenes.ts');
    const settings = window.__chillhill.settings;
    const saved = readScene(serializeScene('Long sweeps', settings));
    const legacy = JSON.parse(serializeScene('Legacy', settings));
    delete legacy.settings.curveLength;
    delete legacy.settings.curveMix;
    return {
      roundtrip: normalizeSettings(saved.settings, defaults).curveLength,
      legacy: normalizeSettings(readScene(JSON.stringify(legacy)).settings, defaults).curveLength,
      low: normalizeSettings({ curveLength: -9 }, defaults).curveLength,
      high: normalizeSettings({ curveLength: 9 }, defaults).curveLength,
      invalid: normalizeSettings({ curveLength: NaN }, defaults).curveLength,
      mix: normalizeSettings(saved.settings, defaults).curveMix,
      oldMix: normalizeSettings(readScene(JSON.stringify(legacy)).settings, defaults).curveMix,
      lowMix: normalizeSettings({ curveMix: -9 }, defaults).curveMix,
      highMix: normalizeSettings({ curveMix: 9 }, defaults).curveMix,
      invalidMix: normalizeSettings({ curveMix: NaN }, defaults).curveMix,
    };
  });
  assert.deepEqual(serialization, {
    roundtrip: 1.4,
    legacy: 1,
    low: 0.6,
    high: 1.6,
    invalid: 1,
    mix: 0.8,
    oldMix: 0.5,
    lowMix: 0,
    highMix: 1,
    invalidMix: 0.5,
  });
  await page.reload();
  await page.waitForFunction(() => window.__chillhill?.driveReady);
  assert.equal(await page.evaluate(() => window.__chillhill.settings.curveLength), 1.4);
  assert.equal(await page.evaluate(() => window.__chillhill.settings.curveMix), 0.8);
  await page.locator('#open-settings').click();
  await page.locator('#reset-settings').click();
  assert.equal(await curveLength.inputValue(), '1');
  assert.equal(await curveMix.inputValue(), '0.5');
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await curveLength.scrollIntoViewIfNeeded();
    assert.ok(await curveLength.isVisible());
    await curveMix.scrollIntoViewIfNeeded();
    assert.ok(await curveMix.isVisible());
    await page
      .locator('#settings-dialog')
      .screenshot({ path: `artifacts/curve-mix-settings-${viewport.width}.png` });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#close-settings').click();
  await page.locator('#start-challenge').click();
  await page.keyboard.down('w');
  await page.waitForFunction(() => window.__chillhill.state.speed > 5);
  await page.locator('#open-settings').click();
  await page.keyboard.up('w');
  const before = await page.evaluate(() => window.__chillhill);
  await curveMix.fill('0.8');
  const after = await page.evaluate(() => window.__chillhill);
  assert.equal(after.state.distance, before.state.distance);
  assert.equal(after.state.travelled, before.state.travelled);
  assert.equal(after.challenge.lives, before.challenge.lives);
  assert.equal(after.challenge.score.points, before.challenge.score.points);
  assert.equal(after.state.speed, 0);
  assert.equal(after.state.offset, after.settings.roadWidth / 4);
  assert.equal(after.scoreRun.category, 'custom');
  await page.locator('#reset-settings').click();
  assert.equal(await page.evaluate(() => window.__chillhill.scoreRun.category), 'custom');
  const report = await page.evaluate(async () => {
    const { GameScene } = await import('/src/game/scene.ts');
    const { defaults } = await import('/src/config.ts');
    const { initialState } = await import('/src/game/driving.ts');
    const { routeChunkLength } = await import('/src/game/route.ts');
    const { roadStretchAt } = await import('/src/game/road-stretches.ts');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;width:1000px;height:760px;z-index:9999';
    document.body.append(host);
    const settings = { ...defaults, seed: 42, treeDensity: 0, autoTime: false, autoWeather: false };
    const scene = new GameScene(host, settings);
    const draw = scene.renderer.render.bind(scene.renderer);
    scene.renderer.render = () => {};
    const fingerprint = (geometry) => {
      const values = geometry.getAttribute('position').array;
      const bits = new Uint32Array(values.buffer, values.byteOffset, values.length);
      let hash = 2166136261;
      for (const value of bits) hash = Math.imul(hash ^ value, 16777619);
      return hash >>> 0;
    };
    const fingerprints = new Map();
    let maxResident = 0,
      regenerated = 0;
    try {
      // Cross many resident-window boundaries, then revisit unloaded chunks and
      // reverse the viewing direction. Geometry is sampled, not just route math.
      for (const chunk of [...Array.from({ length: 28 }, (_, i) => i), 5, 0, 10000, 1]) {
        for (const front of [false, true]) {
          scene.render(
            { ...initialState(), distance: chunk * routeChunkLength + 20, speed: 280 / 3.6 },
            0,
            true,
            false,
            false,
            front,
          );
          const world = scene.scene.getObjectByName('streamed-world');
          maxResident = Math.max(maxResident, world.children.length);
          if (world.children.length !== 7) throw new Error('Resident chunk budget changed');
          for (const section of world.children) {
            const distance = section.userData.distance;
            const signature = fingerprint(section.children[0].geometry);
            if (fingerprints.has(distance)) {
              if (fingerprints.get(distance) !== signature)
                throw new Error(`Road changed on revisit at ${distance}`);
              regenerated++;
            } else fingerprints.set(distance, signature);
          }
        }
      }
      // Changing curve length must rebuild actual road meshes, then reproduce
      // the original geometry on restoration without growing the resident set.
      const atStart = () => {
        scene.render({ ...initialState(), distance: 20 }, 0, true);
        return scene.scene
          .getObjectByName('streamed-world')
          .children.slice()
          .sort((a, b) => a.userData.distance - b.userData.distance)
          .map((chunk) => fingerprint(chunk.children[0].geometry))
          .join(':');
      };
      const base = atStart();
      scene.applySettings({ ...settings, curveLength: 1.6 });
      const longer = atStart();
      scene.applySettings(settings);
      if (base === longer || atStart() !== base)
        throw new Error('Curve length mesh invalidation failed');
      for (const curveMix of [0, 1]) {
        scene.applySettings({ ...settings, curveMix });
        if (base === atStart()) throw new Error('Curve mix failed to update road meshes');
        scene.applySettings(settings);
        if (base !== atStart()) throw new Error('Curve mix cache failed to restore road meshes');
      }
      for (const kind of ['bend', 's-curve', 'sweep', 'straight']) {
        let stretch = roadStretchAt(0, settings.seed);
        while (stretch.kind !== kind)
          stretch = roadStretchAt(stretch.start + stretch.length + 1, settings.seed);
        const snapshot = {
          ...initialState(),
          distance: stretch.start + stretch.length * (kind === 's-curve' ? 0.3 : 0.43),
          speed: 36 / 3.6,
        };
        scene.renderer.render = () => {};
        for (let i = 0; i < 90; i++) scene.render(snapshot, 1 / 60, true);
        scene.renderer.render = draw;
        scene.render(snapshot, 0, true);
        // Preserve each rendered frame for review after disposing WebGL.
        const preview = document.createElement('img');
        preview.id = `route-preview-${kind}`;
        preview.src = scene.renderer.domElement.toDataURL();
        preview.style.cssText = host.style.cssText + ';display:none';
        document.querySelector('#settings-dialog').append(preview);
      }
      return {
        chunks: fingerprints.size,
        distinctMeshes: new Set(fingerprints.values()).size,
        maxResident,
        regenerated,
      };
    } finally {
      scene.renderer.render = draw;
      scene.dispose();
      host.remove();
    }
  });
  assert.equal(
    report.chunks,
    report.distinctMeshes,
    'Every sampled chunk has distinct terrain/road geometry',
  );
  assert.equal(report.maxResident, 7);
  assert.ok(report.chunks > 30 && report.regenerated > 100);
  for (const kind of ['bend', 's-curve', 'sweep', 'straight']) {
    const preview = page.locator(`#route-preview-${kind}`);
    await preview.evaluate((element) => (element.style.display = 'block'));
    await preview.screenshot({ path: `artifacts/route-mix-${kind}.png` });
    await preview.evaluate((element) => element.remove());
  }
  await page.locator('#close-settings').click();
  await page.keyboard.press('Escape');
  if (await page.locator('#resume').isVisible()) await page.locator('#resume').click();
  await page.keyboard.down('w');
  await page.waitForFunction(() => window.__chillhill.state.speed > 5);
  await page.keyboard.up('w');
  await page.screenshot({ path: 'artifacts/random-route-coast.png' });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: saved curve length/mix, scene compatibility, mobile settings, safe challenge edits, mesh invalidation; refresh changes seed; distinct streamed geometry, deterministic revisits, both viewing directions and bounded residency.',
    report,
  );
} finally {
  await browser.close();
}
