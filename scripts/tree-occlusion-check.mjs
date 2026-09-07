import assert from 'node:assert/strict';

export async function checkTreeOcclusion(browser, origin, errors) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  try {
    await page.goto(`${origin}/#garage`);
    await page.waitForFunction(() => window.__chillhill?.garage);
    const results = await page.evaluate(async () => {
      const THREE = await import('/node_modules/three/build/three.module.js');
      const { GameScene } = await import('/src/game/scene.ts');
      const { defaults } = await import('/src/config.ts');
      const { initialState } = await import('/src/game/driving.ts');
      const { segmentIntersectsBox } = await import('/src/game/camera-occlusion.ts');
      const recipes = (await import('/src/config/scenes.json')).default;
      const host = document.createElement('div');
      host.id = 'occlusion-check';
      host.style.cssText = 'position:fixed;inset:0;z-index:1000;';
      document.body.append(host);
      const settings = { ...defaults, ...recipes.tallwood.settings, timeOfDay: 'night' };
      const scene = new GameScene(host, settings);
      const draw = scene.renderer.render.bind(scene.renderer);
      scene.renderer.render = () => {};
      const matrix = new THREE.Matrix4(),
        box = new THREE.Box3();
      let obstructors = 0,
        checks = 0,
        maxFaded = 0,
        repeatedCounts = [];
      const inspect = () => {
        scene.scene.updateMatrixWorld(true);
        const car = scene.modelCenter.clone().applyMatrix4(scene.model.matrixWorld);
        let trees = 0;
        for (const chunk of scene.scene.getObjectByName('streamed-world').children) {
          const parts = chunk.children.filter((mesh) =>
            mesh.geometry?.getAttribute('treeVisibility'),
          );
          trees += parts[0]?.count ?? 0;
          if (!parts.length) continue;
          for (const mesh of parts) {
            if (
              mesh.geometry.getAttribute('treeVisibility') !==
              parts[0].geometry.getAttribute('treeVisibility')
            )
              throw Error('Trunk/crowns must fade together');
            for (let i = 0; i < mesh.count; i++) {
              mesh.getMatrixAt(i, matrix);
              matrix.premultiply(mesh.matrixWorld);
              box.copy(mesh.geometry.boundingBox).applyMatrix4(matrix);
              const opacity = mesh.geometry.getAttribute('treeVisibility').getX(i);
              if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
                throw Error('Invalid tree visibility');
              if (
                segmentIntersectsBox(scene.camera.position, car, box, 2.4) ||
                segmentIntersectsBox(scene.camera.position, scene.lookTarget, box, 2.4)
              ) {
                obstructors++;
                if (opacity > 0.0001)
                  throw Error('Tree still blocks the protected car/road sightline');
              }
            }
          }
        }
        if (scene.environment.chunks !== 7) throw Error('Streaming budget changed');
        if (scene.environment.fadedTrees >= trees * 0.25)
          throw Error('Too much of the forest is removed');
        maxFaded = Math.max(maxFaded, scene.environment.fadedTrees);
        checks++;
      };
      for (const seed of [19, 42, 99999]) {
        scene.applySettings({ ...settings, seed, treeDensity: 2 });
        for (const aspect of [1440 / 900, 390 / 844, 844 / 390]) {
          scene.camera.aspect = aspect;
          for (const distance of [20, 179, 181, 620, 10000020]) {
            for (const [driving, front] of [
              [false, false],
              [true, false],
              [true, true],
            ]) {
              scene.render(
                { ...initialState(), distance, speed: 30, slide: 0.6, offset: 1.5 },
                1 / 60,
                driving,
                false,
                false,
                front,
              );
              inspect();
            }
          }
        }
      }
      // Force every chunk onto the GPU and verify old fade buffers are released on rebuild.
      scene.renderer.render = draw;
      scene.camera.aspect = 1440 / 900;
      for (let cycle = 0; cycle < 3; cycle++) {
        const counts = [];
        for (const roundness of [0, 1]) {
          scene.applySettings({ ...settings, roundness });
          scene.render(initialState(), 0, false, false, false);
          scene.scene.traverse((mesh) => {
            mesh.frustumCulled = false;
          });
          scene.render(initialState(), 0, false, false, false);
          counts.push(scene.renderer.info.memory.geometries);
        }
        repeatedCounts.push(counts);
      }
      scene.applySettings(settings);
      for (let i = 0; i < 25; i++) scene.render(initialState(), 1 / 30, false, false, false);
      window.__treeCheck = { scene, host, draw, initialState };
      return { obstructors, checks, maxFaded, repeatedCounts };
    });
    assert.ok(results.obstructors > 0, 'the scenarios actually encounter blocking trees');
    assert.equal(results.checks, 135);
    assert.deepEqual(results.repeatedCounts[1], results.repeatedCounts[0]);
    assert.deepEqual(results.repeatedCounts[2], results.repeatedCounts[0]);
    await page
      .locator('#occlusion-check')
      .screenshot({ path: 'artifacts/tallwood-occlusion-fixed.png' });
    // Same scene, no regeneration: reveal only the faded instances for a true before/after.
    await page.evaluate(() => {
      const { scene, draw } = window.__treeCheck;
      scene.scene.traverse((mesh) => {
        const visibility = mesh.geometry?.getAttribute('treeVisibility');
        if (visibility) {
          visibility.array.fill(1);
          visibility.needsUpdate = true;
        }
      });
      draw(scene.scene, scene.camera);
    });
    await page
      .locator('#occlusion-check')
      .screenshot({ path: 'artifacts/tallwood-occlusion-before.png' });
    await page.evaluate(() => {
      const { scene, host } = window.__treeCheck;
      scene.dispose();
      host.remove();
      delete window.__treeCheck;
    });
    console.log(
      'PASS: tree clearance in 135 intro/chase/front poses, multiple seeds/aspects, high density, 10,000 km rebasing and repeated GPU disposal.',
      results,
    );
  } finally {
    await page.close();
  }
}
