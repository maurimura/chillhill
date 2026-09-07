import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { checkCameraFraming } from './camera-check.mjs';
import { checkGarage } from './garage-check.mjs';
import { checkVehicleShading } from './vehicle-shading-check.mjs';
import { checkGarageLayout } from './garage-layout-check.mjs';
import { checkRouteRefresh } from './route-refresh-check.mjs';
import { checkTreeOcclusion } from './tree-occlusion-check.mjs';
import { checkPauseEnter } from './pause-enter-check.mjs';
import { checkLayout } from './layout-check.mjs';
import { checkWorld } from './world-check.mjs';
import { checkRename } from './rename-check.mjs';
import { checkQuickMenus } from './quick-menus-check.mjs';
import { checkClassicCars } from './classic-cars-check.mjs';
import { checkLandscapes } from './landscapes-check.mjs';
import { checkMusic } from './music-check.mjs';
import { checkRetiredCar } from './retired-car-check.mjs';
import { checkCarMenu } from './car-menu-check.mjs';
import { checkWorldClock } from './world-clock-check.mjs';
import { checkChallenge } from './challenge-check.mjs';
import { checkScoreboard } from './scoreboard-check.mjs';
import { checkOnlineScoreboard } from './online-scoreboard-check.mjs';
import { checkSpeedWidth } from './speed-width-check.mjs';
import { checkReadability } from './readability-check.mjs';
import { checkModeEntry } from './mode-entry-check.mjs';
import { checkOffRoad } from './offroad-check.mjs';
import { checkHitboxes } from './hitbox-check.mjs';
import { checkPauseFocus } from './pause-focus-check.mjs';
import { checkPerformanceRegressions } from './performance-regression-check.mjs';
import { checkUnits } from './units-check.mjs';

// Uses an isolated browser profile; does not touch your normal Chrome session.
const browser = await chromium.launch({
  channel: process.env.CHROME_CHANNEL || 'chrome',
  headless: true,
});
const errors = [];
const origin = process.env.TEST_URL || 'http://127.0.0.1:5173';
await mkdir('artifacts', { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(origin);
  await page.waitForFunction(() => window.__chillhill && document.querySelector('#scene canvas'));
  assert.equal(await page.evaluate(() => window.__chillhill.settings.car), 'astra');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'artifacts/desktop-welcome.png' });
  await page.locator('#open-settings').click();
  await page.locator('#roundness').fill('0');
  await page.locator('#close-settings').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/angular-world.png' });
  await page.locator('#open-settings').click();
  await page.locator('#roundness').fill('1');
  await page.locator('#close-settings').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/rounded-world.png' });
  await page.locator('#start').click();
  await page.waitForFunction(() => window.__chillhill.state.speed > 3);
  await page.keyboard.down('s');
  await page.waitForFunction(() => window.__chillhill.state.speed === 0);
  const stopped = await page.evaluate(() => ({ ...window.__chillhill.state }));
  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  const held = await page.evaluate(() => ({ ...window.__chillhill.state }));
  assert.equal(held.speed, 0);
  assert.equal(held.distance, stopped.distance);
  await page.keyboard.down('v');
  await page.waitForFunction(() => window.__chillhill.cameraMode === 'front');
  await page.keyboard.down('v'); // Key repeat must not toggle the view off.
  assert.equal(await page.evaluate(() => window.__chillhill.cameraMode), 'front');
  assert.equal(await page.evaluate(() => window.__chillhill.state.distance), stopped.distance);
  assert.equal(await page.evaluate(() => window.__chillhill.state.speed), 0);
  await page.screenshot({ path: 'artifacts/front-camera.png' });
  await page.keyboard.up('v');
  await page.waitForFunction(() => window.__chillhill.cameraMode === 'chase');
  await page.keyboard.up('s');
  await page.waitForFunction(() => window.__chillhill.state.speed > 10);
  await page.keyboard.up('w');
  await page.keyboard.down('d');
  const beforeDrift = await page.evaluate(() => window.__chillhill.state.distance);
  await page.waitForFunction(
    (start) =>
      window.__chillhill.state.distance > start + 4 &&
      window.__chillhill.state.steering > 0.8 &&
      window.__chillhill.state.driftAmount > 0.3 &&
      window.__chillhill.smokeParticles > 3,
    beforeDrift,
  );
  assert.ok((await page.evaluate(() => window.__chillhill.state.distance)) > beforeDrift);
  await page.screenshot({ path: 'artifacts/rear-drift-smoke.png' });
  await page.keyboard.down('v');
  await page.waitForFunction(() => window.__chillhill.cameraMode === 'front');
  const frontViewDistance = await page.evaluate(() => window.__chillhill.state.distance);
  await page.waitForFunction(
    (start) => window.__chillhill.state.distance > start + 1,
    frontViewDistance,
  );
  assert.ok(await page.evaluate(() => window.__chillhill.state.steering > 0.8));
  await page.screenshot({ path: 'artifacts/front-camera-drift.png' });
  await page.keyboard.up('v');
  await page.waitForFunction(() => window.__chillhill.cameraMode === 'chase');
  await page.keyboard.up('d');
  await page.screenshot({ path: 'artifacts/desktop-driving.png' });
  await page.keyboard.down('v');
  await page.waitForFunction(() => window.__chillhill.cameraMode === 'front');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__chillhill.cameraMode === 'chase');
  await page.keyboard.up('v');
  assert.equal(await page.locator('#pause-card').isVisible(), true);
  const pausedDistance = await page.evaluate(() => window.__chillhill.state.distance);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__chillhill.state.distance), pausedDistance);
  await page.locator('#resume').click();
  await page.keyboard.down('v');
  await page.waitForFunction(() => window.__chillhill.cameraMode === 'front');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(
    () => window.__chillhill.paused && window.__chillhill.cameraMode === 'chase',
  );
  await page.keyboard.up('v');
  await page.locator('#resume').click();
  await page.keyboard.down('v');
  await page.waitForFunction(() => window.__chillhill.cameraMode === 'front');
  await page.locator('#open-settings').click();
  await page.waitForFunction(() => window.__chillhill.cameraMode === 'chase');
  await page.keyboard.up('v');
  await page.locator('#seed').focus();
  await page.keyboard.down('v');
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__chillhill.cameraMode), 'chase');
  await page.keyboard.up('v');
  await page.locator('#close-settings').click();
  await page.locator('#open-car-menu').click();
  const settingsDistance = await page.evaluate(() => window.__chillhill.state.distance);
  const settingsSpeed = await page.evaluate(() => window.__chillhill.state.speed);
  for (const car of ['wagon', 'astra', 'peugeot-206']) {
    await page.locator(`[data-car="${car}"]`).click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator(`[data-car="${car}"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => window.__chillhill.settings.car), car);
    assert.equal(await page.evaluate(() => window.__chillhill.state.distance), settingsDistance);
    assert.equal(await page.evaluate(() => window.__chillhill.state.speed), settingsSpeed);
  }
  await page.screenshot({ path: 'artifacts/car-selector.png' });
  await page.locator('#open-settings').click();
  const advancedDistance = await page.evaluate(() => window.__chillhill.state.distance);
  await page.locator('[data-style="golden"]').click();
  await page.locator('#treeDensity').fill('0.5');
  await page.locator('#roadWidth').fill('13');
  await page.locator('#roundness').fill('0.8');
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => window.__chillhill.state.distance), advancedDistance);
  assert.equal(await page.evaluate(() => window.__chillhill.settings.roadWidth), 13);
  assert.equal(await page.evaluate(() => window.__chillhill.settings.roundness), 0.8);
  assert.equal(await page.evaluate(() => window.__chillhill.settings.car), 'peugeot-206');
  await page.screenshot({ path: 'artifacts/desktop-settings.png' });
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-settings').click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'chillhill.settings.json');
  await page.reload();
  await page.waitForFunction(() => window.__chillhill);
  assert.equal(await page.evaluate(() => window.__chillhill.settings.style), 'golden');
  assert.equal(await page.evaluate(() => window.__chillhill.settings.roadWidth), 13);
  assert.equal(await page.evaluate(() => window.__chillhill.settings.roundness), 0.8);
  assert.equal(await page.evaluate(() => window.__chillhill.settings.car), 'peugeot-206');
  await page.locator('#open-settings').click();
  await page.locator('#reset-settings').click();
  assert.equal(await page.evaluate(() => window.__chillhill.settings.car), 'astra');
  await page.locator('#close-settings').click();

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  mobile.on('pageerror', (error) => errors.push(error.message));
  await mobile.goto(origin);
  await mobile.waitForFunction(() => window.__chillhill);
  await mobile.emulateMedia({ reducedMotion: 'reduce' });
  await mobile.evaluate(() => document.fonts.ready);
  assert.equal(
    await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await mobile.screenshot({ path: 'artifacts/mobile-welcome.png' });
  await mobile.locator('#start').tap();
  assert.equal(await mobile.locator('.touch-controls').isVisible(), true);
  await mobile.waitForFunction(() => window.__chillhill.state.speed > 2);
  const cdp = await mobile.context().newCDPSession(mobile);
  const pad = await mobile.locator('#thumb-pad').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: pad.x + pad.width / 2, y: pad.y + pad.height - 10 }],
  });
  await mobile.waitForFunction(() => window.__chillhill.state.speed === 0);
  const touchStop = await mobile.evaluate(() => window.__chillhill.state.distance);
  await mobile.waitForTimeout(300);
  assert.equal(await mobile.evaluate(() => window.__chillhill.state.distance), touchStop);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await mobile.waitForFunction(() => window.__chillhill.state.speed > 0.2);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: pad.x + pad.width - 15, y: pad.y + 15 }],
  });
  await mobile.waitForFunction(
    () => window.__chillhill.state.offset > 0.5 && window.__chillhill.state.speed > 2,
  );
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.screenshot({ path: 'artifacts/mobile-driving.png' });
  await mobile.locator('#open-car-menu').tap();
  await mobile.locator('[data-car="peugeot-206"]').tap();
  assert.equal(await mobile.evaluate(() => window.__chillhill.settings.car), 'peugeot-206');
  await mobile.screenshot({ path: 'artifacts/mobile-car-selector.png' });
  await mobile.locator('#open-settings').tap();
  await mobile.locator('[data-style="dusk"]').tap();
  await mobile.waitForTimeout(300);
  await mobile.screenshot({ path: 'artifacts/mobile-settings.png' });
  // Exercise world streaming across the entire descent and extreme art settings.
  const worldCheck = await page.evaluate(async () => {
    const { GameScene } = await import('/src/game/scene.ts');
    const { defaults } = await import('/src/config.ts');
    const { initialState, stepDriving, FRONT_AXLE } = await import('/src/game/driving.ts');
    const element = document.createElement('div');
    element.style.cssText = 'position:fixed;width:320px;height:240px;left:-1000px;top:0';
    document.body.append(element);
    const scene = new GameScene(element, defaults);
    const counts = [];
    let maxLocalCoordinate = 0,
      maxSeaCoordinate = 0,
      maxCameraDistance = 0,
      maxChunks = 0;
    const distances = [...Array.from({ length: 15 }, (_, i) => 20 + i * 180), 10000000, 10000180];
    for (const distance of distances) {
      scene.render({ ...initialState(), distance, speed: 20 }, 0, true, false);
      // Three uploads geometry lazily when visible. Upload every resident chunk
      // before comparing counts, so camera culling cannot skew the measurement.
      scene.scene.traverse((item) => {
        item.frustumCulled = false;
      });
      scene.render({ ...initialState(), distance, speed: 20 }, 0, true, false);
      counts.push(scene.renderer.info.memory.geometries);
      maxChunks = Math.max(
        maxChunks,
        scene.scene.getObjectByName('streamed-world').children.length,
      );
      if (distance >= 10000000) {
        const car = scene.scene.getObjectByName('car-route-root');
        maxCameraDistance = Math.max(
          maxCameraDistance,
          scene.camera.position.distanceTo(car.position),
        );
        scene.scene.traverse((item) => {
          if (!item.geometry) return;
          const positions = item.geometry.getAttribute('position').array;
          for (const value of positions) {
            // The coast intentionally extends 2.2 km sideways to the horizon.
            // Keep its extent separate so terrain/road rebasing stays strict.
            if (item.name === 'coastal-water')
              maxSeaCoordinate = Math.max(maxSeaCoordinate, Math.abs(value));
            else maxLocalCoordinate = Math.max(maxLocalCoordinate, Math.abs(value));
          }
        });
      }
    }
    for (const style of ['golden', 'dusk', 'alpine']) {
      scene.applySettings({
        ...defaults,
        style,
        roadWidth: 16,
        curves: 1.7,
        terrainHeight: 2,
        treeDensity: 2,
        roundness: 1,
      });
      scene.render({ ...initialState(), distance: 1400 }, 0, true, false);
    }
    // An ordinary chunk crossing shifts existing smoke without clearing it.
    scene.applySettings({ ...defaults, smoke: 1 });
    const crossingState = {
      ...initialState(),
      distance: 179,
      speed: 10,
      slide: 0.5,
      driftAmount: 1,
    };
    for (let i = 0; i < 30; i++) scene.render(crossingState, 1 / 60, true, false);
    const smokeBeforeCrossing = scene.smokeCount;
    const crossingGeometry = scene.scene.getObjectByName('rear-tire-smoke').geometry;
    const puffZBefore = crossingGeometry.getAttribute('puffCenter').getZ(0);
    scene.render({ ...crossingState, distance: 180.1 }, 1 / 60, true, false);
    const puffShift = crossingGeometry.getAttribute('puffCenter').getZ(0) - puffZBefore;
    const smokeAfterCrossing = scene.smokeCount;
    // The front axle remains on its path while the rear visibly swings out.
    scene.applySettings({ ...defaults, curves: 0.2, smoke: 1 });
    const pivotState = { ...initialState(), distance: 1400 };
    scene.render(pivotState, 0, true, false);
    const model = scene.scene.getObjectByName('car-model');
    const frontBefore = model.localToWorld(model.position.clone().set(0, 0.4, -FRONT_AXLE));
    const rearBefore = model.localToWorld(model.position.clone().set(0, 0.4, 1.15));
    scene.render({ ...pivotState, slide: -0.6 }, 0, true, false);
    const frontAfter = model.localToWorld(model.position.clone().set(0, 0.4, -FRONT_AXLE));
    const rearAfter = model.localToWorld(model.position.clone().set(0, 0.4, 1.15));
    const frontMovement = frontAfter.distanceTo(frontBefore);
    const rearMovement = rearAfter.distanceTo(rearBefore);
    const driftState = { ...initialState(), distance: 1400, speed: 10 };
    for (let i = 0; i < 60; i++) {
      stepDriving(driftState, { steer: 1, accelerate: false, brake: false }, defaults, 1 / 60);
      scene.render(driftState, 1 / 60, true, false);
    }
    const activeSmoke = scene.smokeCount;
    const smokeGeometry = scene.scene.getObjectByName('rear-tire-smoke').geometry;
    const centersBeforePause = Array.from(smokeGeometry.getAttribute('puffCenter').array);
    scene.render(driftState, 1, true, false, false);
    const smokeFrozen = centersBeforePause.every(
      (value, i) => value === smokeGeometry.getAttribute('puffCenter').array[i],
    );
    for (let i = 0; i < 120; i++)
      scene.render({ ...driftState, speed: 0, driftAmount: 0 }, 1 / 60, true, true);
    const fadedSmoke = scene.smokeCount;
    scene.dispose();
    element.remove();
    return {
      counts,
      frontMovement,
      rearMovement,
      activeSmoke,
      smokeFrozen,
      fadedSmoke,
      maxLocalCoordinate,
      maxSeaCoordinate,
      maxCameraDistance,
      maxChunks,
      smokeBeforeCrossing,
      smokeAfterCrossing,
      puffShift,
    };
  });
  assert.ok(
    Math.max(...worldCheck.counts) - Math.min(...worldCheck.counts) <= 2,
    `streaming must keep GPU geometry counts bounded: ${worldCheck.counts.join(', ')}`,
  );
  assert.ok(worldCheck.frontMovement < 0.00001, 'the front axle should be the drift pivot');
  assert.ok(worldCheck.rearMovement > 1, 'the rear should swing out visibly');
  assert.ok(
    worldCheck.activeSmoke > 0 && worldCheck.activeSmoke <= 80,
    'rear tire smoke should stay within its pool',
  );
  assert.equal(worldCheck.smokeFrozen, true, 'smoke should freeze when paused');
  assert.equal(worldCheck.fadedSmoke, 0, 'smoke should fade after drifting stops');
  assert.ok(
    worldCheck.smokeAfterCrossing >= worldCheck.smokeBeforeCrossing &&
      worldCheck.smokeBeforeCrossing > 0,
    'existing smoke should survive a chunk boundary',
  );
  assert.ok(
    worldCheck.puffShift > 179.9 && worldCheck.puffShift < 180.1,
    'smoke should shift with the world origin, preserving its position behind the car',
  );
  assert.equal(
    worldCheck.maxChunks,
    7,
    'endless generation should keep only nearby chunks resident',
  );
  assert.ok(
    worldCheck.maxLocalCoordinate < 2000,
    'GPU geometry should stay near the origin even after 10,000 km',
  );
  assert.ok(
    worldCheck.maxSeaCoordinate > 2200 && worldCheck.maxSeaCoordinate < 2400,
    `coastal water should retain its bounded horizon extent after rebasing (${worldCheck.maxSeaCoordinate})`,
  );
  assert.ok(
    worldCheck.maxCameraDistance < 35,
    `the chase camera should stay near the car after rebasing (${worldCheck.maxCameraDistance})`,
  );
  const carChecks = await page.evaluate(async () => {
    const { GameScene } = await import('/src/game/scene.ts');
    const { defaults, normalizeSettings } = await import('/src/config.ts');
    const { cars, carAxles } = await import('/src/config/cars.ts');
    const { initialState } = await import('/src/game/driving.ts');
    const element = document.createElement('div');
    element.id = 'car-test-view';
    element.style.cssText =
      'position:fixed;width:760px;height:500px;left:30px;top:30px;z-index:1000';
    document.body.append(element);
    const settings = { ...defaults, treeDensity: 0, curves: 0.2 };
    const scene = new GameScene(element, settings);
    const state = initialState();
    const samples = [];
    const warm = () => {
      scene.render(state, 0, true, false);
      scene.scene.traverse((item) => {
        item.frustumCulled = false;
      });
      scene.render(state, 0, true, false);
    };
    for (let cycle = 0; cycle < 4; cycle++)
      for (const car of Object.keys(cars)) {
        scene.applySettings({ ...settings, car });
        warm();
        const root = scene.scene.getObjectByName('car-model');
        const spec = cars[car],
          axles = carAxles(spec);
        const localPoint = (z) => root.localToWorld(root.position.clone().set(0, 0.4, z));
        const front = localPoint(-axles.front),
          rear = localPoint(axles.rear);
        scene.render({ ...state, slide: 0.6 }, 0, true, true);
        const frontMovement = localPoint(-axles.front).distanceTo(front);
        const rearMovement = localPoint(axles.rear).distanceTo(rear);
        const frontWheel = root.getObjectByName('front-wheel-left');
        const rearWheel = root.getObjectByName('rear-wheel-left');
        samples.push({
          car,
          cycle,
          id: root.userData.carId,
          wheelbase: rearWheel.position.z - frontWheel.position.z,
          frontTrack: -2 * frontWheel.position.x,
          rearTrack: -2 * rearWheel.position.x,
          frontRadius: frontWheel.children[0].userData.tireRadius,
          rearRadius: rearWheel.children[0].userData.tireRadius,
          rearTireWidth: rearWheel.children[0].userData.tireWidth,
          expectedFrontRadius: spec.tireRadius,
          expectedRearRadius: spec.rearTireRadius ?? spec.tireRadius,
          expectedRearTireWidth: spec.rearTireWidth ?? spec.tireWidth,
          expectedWheelbase: spec.wheelbase,
          expectedFrontTrack: spec.frontTrack,
          expectedRearTrack: spec.rearTrack,
          frontMovement,
          rearMovement,
          geometry: scene.renderer.info.memory.geometries,
          textures: scene.renderer.info.memory.textures,
          drawCalls: scene.renderer.info.render.calls,
        });
      }
    const cameraChecks = [];
    for (const car of Object.keys(cars)) {
      scene.applySettings({ ...settings, car, grade: 0.16, curves: 1.7 });
      for (const distance of [179, 180.1, 10000000])
        for (const frontView of [false, true, false]) {
          const snapshot = { ...state, distance, speed: 10, slide: 0.6, driftAmount: 1 };
          scene.render(snapshot, 1 / 60, true, false, true, frontView);
          const root = scene.scene.getObjectByName('car-route-root');
          const toCar = root.position.clone().sub(scene.camera.position).normalize();
          const direction = scene.camera.getWorldDirection(root.position.clone());
          cameraChecks.push({
            frontView,
            mode: scene.cameraMode,
            relativeZ: scene.camera.position.z - root.position.z,
            height: scene.camera.position.y - root.position.y,
            alignment: direction.dot(toCar),
            chunks: scene.scene
              .getObjectByName('streamed-world')
              .children.map((chunk) => chunk.userData.distance / 180),
            chunk: Math.floor(distance / 180),
            cameraDistance: scene.camera.position.distanceTo(root.position),
          });
        }
    }
    window.__carCheck = {
      scene,
      element,
      state,
      settings,
      preview(car, roundness, front) {
        scene.applySettings({ ...settings, car, roundness });
        scene.render(state, 0, true, false);
        const root = scene.scene.getObjectByName('car-model');
        const center = root.getWorldPosition(root.position.clone());
        scene.camera.position.copy(center).add(center.clone().set(5.1, 3.1, front ? -5.7 : 5.7));
        scene.camera.fov = 40;
        scene.camera.updateProjectionMatrix();
        scene.camera.lookAt(center.add(center.clone().set(0, 0.7, 0)));
        scene.renderer.render(scene.scene, scene.camera);
      },
    };
    return {
      samples,
      cameraChecks,
      invalid: normalizeSettings({ car: 'missing' }, defaults).car,
      inherited: normalizeSettings({ car: 'toString' }, defaults).car,
      oldSave: normalizeSettings({ style: 'dusk' }, defaults).car,
    };
  });
  for (const sample of carChecks.samples) {
    assert.equal(sample.id, sample.car);
    assert.ok(Math.abs(sample.wheelbase - sample.expectedWheelbase) < 1e-10);
    assert.equal(sample.frontTrack, sample.expectedFrontTrack);
    assert.equal(sample.rearTrack, sample.expectedRearTrack);
    assert.equal(sample.frontRadius, sample.expectedFrontRadius);
    assert.equal(sample.rearRadius, sample.expectedRearRadius);
    assert.equal(sample.rearTireWidth, sample.expectedRearTireWidth);
    assert.ok(sample.frontMovement < 1e-10 && sample.rearMovement > 1);
    const first = carChecks.samples.find((other) => other.car === sample.car);
    assert.equal(sample.geometry, first.geometry, 'switching cars must release old geometry');
    assert.equal(sample.textures, first.textures, 'switching cars must release old badge textures');
  }
  assert.equal(carChecks.invalid, 'astra');
  assert.equal(carChecks.inherited, 'astra');
  assert.equal(carChecks.oldSave, 'astra');
  for (const check of carChecks.cameraChecks) {
    assert.equal(check.mode, check.frontView ? 'front' : 'chase');
    assert.ok(
      check.frontView ? check.relativeZ < 0 : check.relativeZ > 0,
      'camera switches sides on the same frame',
    );
    assert.ok(check.height > 2 && check.cameraDistance < 35);
    if (check.frontView) assert.ok(check.alignment > 0.99, 'front view looks back at the car');
    assert.equal(check.chunks.length, 7);
    assert.equal(Math.min(...check.chunks), check.chunk - (check.frontView ? 5 : 1));
    assert.equal(Math.max(...check.chunks), check.chunk + (check.frontView ? 1 : 5));
  }
  for (const car of ['astra', 'peugeot-206', 'wagon']) {
    for (const front of [true, false]) {
      await page.evaluate(({ car, front }) => window.__carCheck.preview(car, 0.65, front), {
        car,
        front,
      });
      await page
        .locator('#car-test-view')
        .screenshot({ path: `artifacts/${car}-${front ? 'front' : 'rear'}.png` });
    }
  }
  for (const roundness of [0, 1]) {
    await page.evaluate(
      (roundness) => window.__carCheck.preview('astra', roundness, false),
      roundness,
    );
    await page
      .locator('#car-test-view')
      .screenshot({ path: `artifacts/astra-softness-${roundness}.png` });
  }
  await page.evaluate(() => {
    window.__carCheck.scene.dispose();
    window.__carCheck.element.remove();
    delete window.__carCheck;
  });
  console.log('Car GPU usage:', carChecks.samples.slice(0, 3));
  await checkCameraFraming(page);
  await checkGarage(browser, origin, errors);
  await checkGarageLayout(browser, origin, errors);
  await checkRouteRefresh(browser, origin, errors);
  await checkClassicCars(browser, origin, errors);
  await checkVehicleShading(browser, origin, errors);
  await checkQuickMenus(browser, origin, errors);
  await checkPauseEnter(browser, origin, errors);
  await checkCarMenu(browser, origin, errors);
  await checkLayout(browser, origin, errors);
  await checkWorld(browser, origin, errors);
  await checkLandscapes(browser, origin, errors);
  await checkTreeOcclusion(browser, origin, errors);
  await checkMusic(browser, origin, errors);
  await checkRetiredCar(browser, origin, errors);
  await checkRename(browser, origin, errors);
  await checkWorldClock(browser, origin, errors);
  await checkUnits(browser, origin, errors);
  await checkSpeedWidth(browser, origin, errors);
  await checkChallenge(browser, origin, errors);
  await checkScoreboard(browser, origin, errors);
  await checkOnlineScoreboard(browser, origin, errors);
  await checkOffRoad(browser, origin, errors);
  await checkHitboxes(browser, origin, errors);
  await checkPauseFocus(browser, origin, errors);
  await checkPerformanceRegressions(browser, origin, errors);
  await checkModeEntry(browser, origin, errors);
  await checkReadability(browser, origin, errors);
  assert.deepEqual(errors, [], 'browser should not report application errors');
  console.log(
    'PASS: hold-V front camera/release/repeat/focus/pause, camera framing and bidirectional streaming for every car, desktop/mobile driving and car selection, factory axle positions, car switching/persistence/disposal, brake priority, smooth rear drift, smoke emission/fading/pause, front-axle pivot, shape softness, settings/export, endless streaming at 10,000 km, bounded geometry and particles, and all art presets.',
  );
  console.log('Screenshots saved in artifacts/.');
} finally {
  await browser.close();
}
