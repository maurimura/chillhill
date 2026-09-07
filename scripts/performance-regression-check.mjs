import assert from 'node:assert/strict';

export async function checkPerformanceRegressions(browser, origin, errors) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(origin);
    await page.waitForFunction(() => window.__chillhill?.driveReady);
    const report = await page.evaluate(async () => {
      const { GameScene } = await import('/src/game/scene.ts');
      const { baseline } = await import('/src/config.ts');
      const { initialState } = await import('/src/game/driving.ts');
      const { initialChallenge } = await import('/src/game/challenge.ts');
      const element = document.createElement('div');
      element.style.cssText = 'position:fixed;inset:0;z-index:1000';
      document.body.append(element);
      const settings = { ...baseline, landscape: 'forest', treeDensity: 0.5, pixelRatio: 1 };
      const state = initialState();
      const challenge = initialChallenge(settings, state);
      challenge.traffic.forEach((car) => (car.car = 'astra'));
      const scene = new GameScene(element, settings);
      const show = () => scene.render(state, 0, true, false, false, false, challenge);
      show();
      const pool = scene.traffic;
      const first = pool.slots.get(0),
        second = pool.slots.get(1);
      const meshes = (visual) => {
        const list = [];
        visual.root.traverse((node) => {
          if (node.isMesh) list.push(node);
        });
        return list;
      };
      const a = meshes(first),
        b = meshes(second);
      const sharedGeometry = a.every((mesh, i) => mesh.geometry === b[i].geometry);
      const independentMaterials = a.every((mesh, i) => mesh.material !== b[i].material);
      const wheel = second.wheels[0].rotation.x;
      first.wheels[0].rotation.x += 1;
      const independentWheels = second.wheels[0].rotation.x === wheel;
      const originalPaint = second.root.userData.paint;
      first.setPaint('#fff', '#ff0000');
      const independentPaint =
        second.root.userData.paint === originalPaint && first.root.userData.paint !== originalPaint;
      let disposals = 0;
      a[0].geometry.addEventListener('dispose', () => disposals++);
      challenge.traffic.shift();
      challenge.traffic.push({
        ...challenge.traffic[0],
        id: 7,
        car: 'peugeot-206',
        distance: state.distance + 600,
      });
      show();
      const sameSurvivor = pool.slots.get(1) === second;
      const noEarlyDisposal = disposals === 0;
      const built = pool.telemetry.builds;
      const ids = ['astra', 'renault-12', 'wagon', 'peugeot-206', 'mustang-fastback'];
      for (let i = 0; i < 120; i++) {
        challenge.traffic.shift();
        challenge.traffic.push({
          ...challenge.traffic[0],
          id: i + 8,
          car: ids[i % ids.length],
          distance: state.distance + 500,
        });
        show();
      }
      const afterRecycle = pool.telemetry;
      const vertices = () =>
        meshes(pool.templates.get('astra')).reduce(
          (sum, mesh) => sum + mesh.geometry.getAttribute('position').count,
          0,
        );
      const verticesBefore = vertices();
      scene.applySettings({ ...settings, roundness: 0 });
      show();
      const afterSoftness = pool.telemetry;
      const verticesAfter = vertices();
      scene.render(state, 0, true, false, false, false);
      const cleared = pool.telemetry;
      scene.dispose();
      element.remove();
      return {
        sharedGeometry,
        independentMaterials,
        independentWheels,
        independentPaint,
        sameSurvivor,
        noEarlyDisposal,
        built,
        afterRecycle,
        afterSoftness,
        verticesBefore,
        verticesAfter,
        cleared,
        disposed: pool.telemetry,
        worker: scene.terrainPrefetch.telemetry,
      };
    });
    for (const key of [
      'sharedGeometry',
      'independentMaterials',
      'independentWheels',
      'independentPaint',
      'sameSurvivor',
      'noEarlyDisposal',
    ])
      assert.equal(report[key], true, key);
    assert.equal(report.built, 5);
    assert.equal(
      report.afterRecycle.builds,
      5,
      '120 replacements do not regenerate any car geometry',
    );
    assert.equal(report.afterRecycle.active, 7);
    assert.equal(report.afterRecycle.templates, 5);
    assert.equal(
      report.afterSoftness.builds,
      10,
      'softness invalidates exactly the five template shapes',
    );
    assert.notEqual(report.verticesBefore, report.verticesAfter);
    assert.equal(report.cleared.templates, 0);
    assert.equal(report.cleared.active, 0);
    assert.equal(report.disposed.templates, 0);
    assert.equal(report.worker.worker, false);

    const terrain = await page.evaluate(async () => {
      const { TerrainPrefetch } = await import('/src/game/terrain-prefetch.ts');
      const { terrainGeometry } = await import('/src/game/art.ts');
      const { baseline } = await import('/src/config.ts');
      const prefetch = new TerrainPrefetch();
      let comparisons = 0,
        hits = 0;
      try {
        for (const landscape of ['highlands', 'coast', 'city', 'desert', 'lakes', 'forest']) {
          for (const roundness of [0, 0.65]) {
            const settings = { ...baseline, landscape, roundness, grade: 0.16, curves: 1.7 };
            prefetch.reset();
            prefetch.request(6, 1080, 180, settings, '#617241', '#d5c382');
            const deadline = performance.now() + 15000;
            while (
              !prefetch.telemetry.ready &&
              performance.now() < deadline &&
              !prefetch.telemetry.failed
            )
              await new Promise((resolve) => setTimeout(resolve, 10));
            const actual = prefetch.take(6);
            if (!actual)
              throw Error(
                `Terrain worker failed: ${landscape}/${roundness}: ${JSON.stringify(prefetch.telemetry)}`,
              );
            const expected = terrainGeometry(1080, 180, settings, '#617241', '#d5c382');
            for (const key of ['position', 'normal', 'color']) {
              const a = actual.getAttribute(key).array,
                b = expected.getAttribute(key).array;
              if (a.length !== b.length) throw Error(`Wrong terrain ${key} length`);
              for (let i = 0; i < a.length; i++)
                if (a[i] !== b[i]) throw Error(`Terrain worker changes ${landscape} ${key}[${i}]`);
              comparisons += a.length;
            }
            actual.dispose();
            expected.dispose();
            hits++;
          }
        }
      } finally {
        prefetch.dispose();
      }
      return { comparisons, hits, worker: prefetch.telemetry };
    });
    assert.equal(terrain.hits, 12);
    assert.ok(terrain.comparisons > 500000);
    assert.equal(terrain.worker.worker, false);
    console.log(
      `PASS: stable traffic identity, shared geometry with independent paint/animation, 120 replacements without rebuilding, cache invalidation/disposal; worker terrain matches ${terrain.comparisons} attribute values across all six landscapes and both softness cases.`,
    );
  } finally {
    await page.close();
  }
}
