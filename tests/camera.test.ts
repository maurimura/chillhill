import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraFrame, followDistance, framingPullback } from '../src/game/camera.ts';

test('both driving cameras gain distance with speed, and front view gains drift clearance', () => {
  for (const front of [false, true])
    for (const portrait of [false, true]) {
      const stopped = followDistance(front, true, portrait, 0, 0);
      const cruising = followDistance(front, true, portrait, 10, 0);
      const fast = followDistance(front, true, portrait, 280 / 3.6, 0);
      assert.ok(stopped >= 12 && cruising > stopped && fast > cruising);
    }
  assert.ok(followDistance(true, true, false, 20, 0.78) > followDistance(true, true, false, 20, 0));
});

test('framing solves all screen edges and the near plane at different aspect ratios', () => {
  const corners = [];
  for (const x of [-4, 3])
    for (const y of [-3, 2]) for (const z of [-6, 1]) corners.push({ x, y, z });
  for (const aspect of [0.35, 0.6, 1, 1.7, 4])
    for (const fov of [40, 53, 60]) {
      const move = framingPullback(corners, fov, aspect);
      const tan = Math.tan((fov * Math.PI) / 360);
      for (const point of corners) {
        const depth = -point.z + move;
        assert.ok(depth >= 0.5);
        assert.ok(Math.abs(point.x / (depth * tan * aspect)) <= cameraFrame.horizontal + 1e-10);
        assert.ok(Math.abs(point.y / (depth * tan)) <= cameraFrame.vertical + 1e-10);
      }
    }
});

test('a comfortably framed car does not force a camera adjustment', () => {
  assert.equal(
    framingPullback(
      [
        { x: -1, y: -1, z: -12 },
        { x: 1, y: 1, z: -8 },
      ],
      53,
      1.7,
    ),
    0,
  );
});
