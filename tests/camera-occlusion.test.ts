import test from 'node:test';
import assert from 'node:assert/strict';
import {
  obstructionVisibility,
  segmentIntersectsBox,
  restoreTreeVisibility,
} from '../src/game/camera-occlusion.ts';

const camera = { x: 0, y: 8, z: 15 },
  car = { x: 0, y: 1, z: 0 };
const trunk = { min: { x: -0.6, y: 0, z: 7 }, max: { x: 0.6, y: 25, z: 8 } };
test('tree between camera and car is removed, including when the camera is inside it', () => {
  assert.equal(segmentIntersectsBox(camera, car, trunk), true);
  assert.equal(obstructionVisibility(camera, car, trunk), 0);
  assert.equal(obstructionVisibility({ x: 0, y: 8, z: 7.5 }, car, trunk), 0);
  assert.equal(segmentIntersectsBox(camera, camera, trunk), false);
});
test('trees outside the corridor, behind the camera or beyond the target remain visible', () => {
  for (const [x, z] of [
    [20, 7],
    [0, 35],
    [0, -20],
  ]) {
    const tree = { min: { x: x - 0.5, y: 0, z }, max: { x: x + 0.5, y: 25, z: z + 1 } };
    assert.equal(obstructionVisibility(camera, car, tree), 1);
  }
  const canopy = { min: { x: -5, y: 20, z: 7 }, max: { x: 5, y: 30, z: 10 } };
  assert.equal(
    obstructionVisibility(camera, car, canopy),
    1,
    'high canopy stays above the clear view',
  );
});
test('clearance fades smoothly and is symmetric for front view and world rebasing', () => {
  const shifted = { min: { ...trunk.min, x: 3.5 }, max: { ...trunk.max, x: 4.5 } };
  const visibility = obstructionVisibility(camera, car, shifted);
  assert.ok(visibility > 0 && visibility < 1);
  assert.equal(obstructionVisibility(car, camera, shifted), visibility);
  const rebase = (p: typeof camera) => ({ x: p.x, y: p.y + 700000, z: p.z - 10000000 });
  assert.ok(
    Math.abs(
      obstructionVisibility(rebase(camera), rebase(car), {
        min: rebase(shifted.min),
        max: rebase(shifted.max),
      }) - visibility,
    ) < 0.03,
  );
});
test('occlusion responds immediately at any speed; returning trees ease in at pause and low frame rate', () => {
  for (const dt of [0, 1 / 120, 1 / 30, 0.2]) assert.equal(restoreTreeVisibility(1, 0, dt), 0);
  assert.equal(restoreTreeVisibility(0, 1, 0), 0);
  const halfway = restoreTreeVisibility(0, 1, 0.2);
  assert.ok(halfway > 0 && halfway < 1);
  assert.equal(restoreTreeVisibility(halfway, 1, 3), 1);
});
