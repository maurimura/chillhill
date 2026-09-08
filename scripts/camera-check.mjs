import assert from 'node:assert/strict';

export async function checkCameraFraming(page, curveLength = 1, curveMix = 0.5) {
  const results = await page.evaluate(
    async ({ curveLength, curveMix }) => {
      const { GameScene } = await import('/src/game/scene.ts');
      const { defaults } = await import('/src/config.ts');
      const { cars } = await import('/src/config/cars.ts');
      const { initialState, stepDriving } = await import('/src/game/driving.ts');
      const { roadAt } = await import('/src/game/route.ts');
      const element = document.createElement('div');
      element.id = 'camera-framing-check';
      element.style.cssText =
        'position:fixed;left:20px;top:20px;width:760px;height:500px;z-index:1000';
      document.body.append(element);
      const settings = {
        ...defaults,
        maxSpeed: 280,
        drift: 1,
        grade: 0.16,
        curves: 1.7,
        curveLength,
        curveMix,
        roadWidth: 7,
        treeDensity: 0,
      };
      const scene = new GameScene(element, settings);
      const render = scene.renderer.render.bind(scene.renderer);
      // Exercise thousands of real simulation/camera frames without GPU drawing.
      // Restore rendering below for screenshots of the resulting camera poses.
      scene.renderer.render = () => {};
      const results = [];
      const layouts = [
        [1440, 834],
        [390, 660],
        [844, 220],
      ];
      try {
        for (const car of Object.keys(cars))
          for (const [width, height] of layouts) {
            for (const fps of car === 'astra' && width === 1440 ? [30, 60, 120] : [60]) {
              scene.applySettings({ ...settings, car });
              scene.camera.aspect = width / height;
              const state = { ...initialState(), distance: 10000150 };
              scene.render(state, 0, true, false, false, true);
              const model = scene.scene.getObjectByName('car-model');
              const root = scene.scene.getObjectByName('car-route-root');
              const probe = root.position.clone();
              const meshCorners = [];
              // Project the actual models, including mirrors, wheels, antenna and
              // shadow, independently of the production framing helper's bounds.
              model.traverse((mesh) => {
                if (!mesh.geometry) return;
                mesh.geometry.computeBoundingBox();
                const { min, max } = mesh.geometry.boundingBox;
                for (let i = 0; i < 8; i++)
                  meshCorners.push({
                    mesh,
                    point: probe
                      .clone()
                      .set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z),
                  });
              });
              const sample = {
                car,
                width,
                height,
                fps,
                maxX: 0,
                maxY: 0,
                minZ: 1,
                maxZ: -1,
                stoppedGap: root.position.z - scene.camera.position.z,
                fastGap: 0,
                boundaryJump: 0,
                maxSpeed: 0,
                frames: 0,
              };
              let previousRelative = scene.camera.position.clone().sub(root.position);
              let previousChunk = Math.floor(state.distance / 180);
              for (let frame = 0; frame < fps * 31; frame++) {
                const time = frame / fps;
                const input = {
                  steer: time < 8 ? 0 : Math.sin((time - 8) * 1.9),
                  accelerate: time < 22,
                  brake: time >= 22,
                };
                const road = roadAt(state.distance, settings);
                stepDriving(
                  state,
                  input,
                  { ...settings, car },
                  1 / fps,
                  road.curvature,
                  road.metric,
                );
                const front = time < 25 ? !(time >= 10 && time < 11) : Math.floor(time) % 2 === 0;
                scene.render(state, 1 / fps, true, input.brake, true, front);
                const relative = scene.camera.position.clone().sub(root.position);
                const chunk = Math.floor(state.distance / 180);
                if (chunk !== previousChunk)
                  sample.boundaryJump = Math.max(
                    sample.boundaryJump,
                    relative.distanceTo(previousRelative),
                  );
                previousRelative = relative;
                previousChunk = chunk;
                sample.maxSpeed = Math.max(sample.maxSpeed, state.speed);
                if (time > 20 && time < 21)
                  sample.fastGap = root.position.z - scene.camera.position.z;
                for (const { mesh, point } of meshCorners) {
                  probe.copy(point).applyMatrix4(mesh.matrixWorld).project(scene.camera);
                  sample.maxX = Math.max(sample.maxX, Math.abs(probe.x));
                  sample.maxY = Math.max(sample.maxY, Math.abs(probe.y));
                  sample.minZ = Math.min(sample.minZ, probe.z);
                  sample.maxZ = Math.max(sample.maxZ, probe.z);
                }
                sample.frames++;
              }
              results.push(sample);
            }
          }
      } finally {
        scene.renderer.render = render;
      }
      window.__cameraFramingCheck = {
        scene,
        element,
        preview(car, speed, slide) {
          scene.applySettings({ ...settings, car });
          scene.camera.aspect = element.clientWidth / element.clientHeight;
          const snapshot = { ...initialState(), distance: 200, speed, slide };
          scene.renderer.render = () => {};
          try {
            for (let i = 0; i < 120; i++) scene.render(snapshot, 1 / 60, true, false, false, true);
          } finally {
            scene.renderer.render = render;
          }
          scene.render(snapshot, 0, true, false, false, true);
        },
      };
      return results;
    },
    { curveLength, curveMix },
  );
  for (const result of results) {
    const label = `${result.car}, ${result.width}×${result.height}, ${result.fps} fps: ${JSON.stringify(result)}`;
    assert.ok(
      result.maxX <= 0.8 && result.maxY <= 0.72,
      `the whole car needs screen-edge clearance: ${label}`,
    );
    assert.ok(
      result.minZ > -1 && result.maxZ < 1,
      `no car parts may clip the depth planes: ${label}`,
    );
    assert.ok(result.maxSpeed >= 280 / 3.6 - 0.001, `test must reach the speed cap: ${label}`);
    assert.ok(
      result.fastGap > result.stoppedGap + 3,
      `speed must move the front camera farther away: ${label}`,
    );
    assert.ok(result.boundaryJump < 1, `origin changes must not disturb framing: ${label}`);
  }
  for (const [label, width, height, speed, slide] of [
    ['stopped', 760, 500, 0, 0],
    ['fast-drift', 760, 500, 280 / 3.6, -0.78],
    ['portrait-fast-drift', 390, 660, 280 / 3.6, 0.78],
  ]) {
    await page.evaluate(
      ({ width, height }) => {
        window.__cameraFramingCheck.element.style.width = `${width}px`;
        window.__cameraFramingCheck.element.style.height = `${height}px`;
      },
      { width, height },
    );
    await page.waitForTimeout(50);
    await page.evaluate(
      ({ speed, slide }) => window.__cameraFramingCheck.preview('astra', speed, slide),
      { speed, slide },
    );
    await page.locator('#camera-framing-check').screenshot({
      path: `artifacts/camera-framing-${label}-length-${curveLength}-mix-${curveMix}.png`,
    });
  }
  await page.evaluate(() => {
    window.__cameraFramingCheck.scene.dispose();
    window.__cameraFramingCheck.element.remove();
    delete window.__cameraFramingCheck;
  });
  console.log(
    `PASS: camera framing at curve length ${curveLength}×, mix ${curveMix} across ${results.reduce((total, result) => total + result.frames, 0)} moving frames, all cars, 30/60/120 Hz, portrait/landscape, acceleration to 280 km/h, drift, braking, camera changes and origin rebasing.`,
  );
}
