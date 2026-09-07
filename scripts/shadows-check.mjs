import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

export async function checkShadows(browser, origin) {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'local scenes only');
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(origin);
    await page.waitForFunction(() => window.__chillhill?.driveReady);
    await page.evaluate(async () => {
      const { GameScene } = await import('/src/game/scene.ts');
      const { defaults } = await import('/src/config.ts');
      const { initialState } = await import('/src/game/driving.ts');
      const { roadAt, roadElevation } = await import('/src/game/route.ts');
      const { atmosphere } = await import('/src/game/atmosphere.ts');
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;inset:0;z-index:1000';
      document.body.append(host);
      let settings = {
        ...defaults,
        seed: 42,
        treeDensity: 1,
        landscape: 'coast',
        weather: 'clear',
        timeOfDay: 'day',
      };
      let state = { ...initialState(), distance: 80, speed: 20 };
      const scene = new GameScene(host, settings);
      const light = scene.scene.getObjectByName('celestial-light');
      const disc = scene.scene.getObjectByName('celestial-disc');
      let front = false,
        driving = true,
        baseline = false,
        frame;
      const draw = scene.renderer.render.bind(scene.renderer);
      scene.renderer.render = (...args) => {
        if (baseline) {
          const road = roadAt(state.distance, settings);
          const origin = Math.floor(state.distance / 180) * 180;
          const y = road.y - roadElevation(origin, settings);
          const elevation = atmosphere(settings).elevation;
          light.position.set(road.x - 35, y + elevation, origin - state.distance + 20);
          disc.position.set(road.x + 240, y + elevation * 2.2, origin - state.distance - 850);
        }
        draw(...args);
      };
      const render = () => scene.render(state, 1 / 60, driving, false, false, front);
      const loop = () => {
        render();
        frame = requestAnimationFrame(loop);
      };
      loop();
      window.__shadowCheck = {
        preview(patch = {}, pose = {}) {
          settings = { ...settings, ...patch };
          state = { ...state, distance: pose.distance ?? 80 };
          front = pose.front ?? false;
          driving = pose.driving ?? true;
          baseline = pose.baseline ?? false;
          scene.applySettings(settings);
          scene.resetMotion();
          render();
        },
        measure() {
          const visible = disc.position.clone().sub(scene.camera.position).normalize();
          const illumination = light.position.clone().sub(light.target.position).normalize();
          light.shadow.updateMatrices(light);
          // Ground around the car and a 38 m Tallwood canopy must fit the same
          // local shadow volume, even at low sun and after origin rebasing.
          const receivers = [];
          for (const advance of [-10, 0, 20]) {
            const distance = state.distance + advance;
            const road = roadAt(distance, settings);
            const origin = Math.floor(state.distance / 180) * 180;
            for (const side of [-1, 1])
              for (const height of [0, 38]) {
                const point = light.position
                  .clone()
                  .set(
                    road.x + side * (settings.roadWidth / 2 + 2),
                    road.y - roadElevation(origin, settings) + height,
                    origin - distance,
                  );
                point.project(light.shadow.camera);
                receivers.push(point.toArray());
              }
          }
          return {
            alignment: visible.dot(illumination),
            direction: illumination.toArray(),
            receivers,
            shadowMap: !!light.shadow.map,
            mapSize: light.shadow.mapSize.toArray(),
          };
        },
        transition(timeOfDay) {
          settings = { ...settings, timeOfDay };
          scene.applySettings(settings, true);
          const renderer = scene.renderer.render;
          scene.renderer.render = () => {};
          let minAlignment = 1,
            maxStep = 0;
          let previous = light.position.clone().sub(light.target.position).normalize();
          try {
            for (let i = 0; i < 900; i++) {
              render();
              const visible = disc.position.clone().sub(scene.camera.position).normalize();
              const illumination = light.position.clone().sub(light.target.position).normalize();
              minAlignment = Math.min(minAlignment, visible.dot(illumination));
              maxStep = Math.max(maxStep, previous.distanceTo(illumination));
              previous = illumination;
            }
          } finally {
            scene.renderer.render = renderer;
          }
          render();
          return { minAlignment, maxStep };
        },
        dispose() {
          cancelAnimationFrame(frame);
          scene.dispose();
          host.remove();
        },
      };
    });
    await page.evaluate(() => window.__shadowCheck.preview({}, { baseline: true }));
    const old = await page.evaluate(() => window.__shadowCheck.measure());
    assert.ok(old.alignment < 0, 'fixture reproduces the old opposing light directions');
    await page.screenshot({ path: 'artifacts/shadows-before.png' });
    let checked = 0;
    for (const landscape of ['coast', 'forest']) {
      for (const timeOfDay of ['day', 'sunset', 'dusk', 'night', 'dawn']) {
        for (const pose of [{ driving: false }, {}, { front: true }]) {
          await page.evaluate(
            ({ landscape, timeOfDay, pose }) =>
              window.__shadowCheck.preview({ landscape, timeOfDay }, pose),
            { landscape, timeOfDay, pose },
          );
          const result = await page.evaluate(() => window.__shadowCheck.measure());
          assert.ok(
            result.alignment > 1 - 1e-10,
            `${landscape} ${timeOfDay}: sky and shadow rays agree`,
          );
          assert.ok(result.shadowMap, 'GPU shadow map is rendered');
          assert.deepEqual(result.mapSize, [1024, 1024], 'no larger GPU texture budget');
          for (const point of result.receivers)
            assert.ok(
              point.every((v) => Math.abs(v) < 1),
              `${landscape} ${timeOfDay}: nearby road/trees stay inside the shadow camera: ${point}`,
            );
          checked++;
        }
        if (['day', 'night', 'sunset'].includes(timeOfDay)) {
          await page.evaluate(() => window.__shadowCheck.preview());
          await page.screenshot({ path: `artifacts/shadows-${landscape}-${timeOfDay}.png` });
        }
      }
    }
    for (const distance of [179.99, 180.01, 10000000, 10000180]) {
      await page.evaluate((distance) => window.__shadowCheck.preview({}, { distance }), distance);
      const result = await page.evaluate(() => window.__shadowCheck.measure());
      assert.ok(result.alignment > 1 - 1e-10, `direction survives rebasing at ${distance} m`);
    }
    for (const phase of ['day', 'sunset', 'night', 'dawn']) {
      const result = await page.evaluate((phase) => window.__shadowCheck.transition(phase), phase);
      assert.ok(
        result.minAlignment > 1 - 1e-10,
        'gradual changes never separate sky and shadow direction',
      );
      assert.ok(result.maxStep < 0.005, 'time changes do not snap the shadows');
    }
    await page.evaluate(() => window.__shadowCheck.preview({ weather: 'rain' }));
    assert.ok((await page.evaluate(() => window.__shadowCheck.measure())).alignment > 1 - 1e-10);
    assert.deepEqual(errors, []);
    console.log(
      `PASS: ${checked} rendered sun/moon, coast/forest and intro/chase/front-view combinations; shadow coverage, weather, smooth transitions and 10,000 km rebasing. Old mismatch reproduced for before/after images.`,
    );
  } finally {
    await page.evaluate(() => window.__shadowCheck?.dispose()).catch(() => {});
    await page.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mkdir('artifacts', { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    await checkShadows(browser, process.env.TEST_URL || 'http://127.0.0.1:5173');
  } finally {
    await browser.close();
  }
}
