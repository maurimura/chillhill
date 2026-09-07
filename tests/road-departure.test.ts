import test from 'node:test';
import assert from 'node:assert/strict';
import { cars, type CarId } from '../src/config/cars.ts';
import { challengeDefaults } from '../src/config/challenge.ts';
import { bodyRoadLimits, collisionFootprint, roadDeparture } from '../src/game/collision.ts';
import { initialState, roadOffsetLimit } from '../src/game/driving.ts';
import { initialChallenge, stepChallenge } from '../src/game/challenge.ts';
import { roadAt } from '../src/game/route.ts';

const settings = {
  car: 'renault-12' as const,
  seed: 42,
  curves: 1.7,
  grade: 0.16,
  terrainHeight: 1,
  roadWidth: 10,
  cruiseSpeed: 36,
  maxSpeed: 80,
  drift: 0.55,
};
const config = { ...challengeDefaults, trafficCount: 0, graceSeconds: 0 };
const stopped = { steer: 0, accelerate: false, brake: true };

test('Renault drift entirely on asphalt never triggers the old symmetric false warning', () => {
  const world = { ...settings, curves: 0 };
  const state = { ...initialState(), offset: -2.7, slide: 0.6 };
  assert.ok(
    Math.abs(state.offset) > roadOffsetLimit(world.roadWidth, state.slide, world.car),
    'regression pose would have warned before',
  );
  const points = collisionFootprint(state, world.car, world);
  assert.ok(
    points.every((point) => Math.abs(point.x - roadAt(-point.z, world).x) < world.roadWidth / 2),
    'the real body is entirely on asphalt',
  );
  const challenge = initialChallenge(world, state, config);
  for (let i = 0; i < 720; i++) stepChallenge(challenge, state, stopped, world, 1 / 120, config);
  assert.equal(challenge.offRoad.active, false);
  assert.equal(challenge.lives, 3);
});

test('asymmetric body limits work for every car, drift direction, grade and curved stretch', () => {
  let oldFalseWarnings = 0;
  for (const car of Object.keys(cars) as CarId[])
    for (const distance of [20, 100, 180.01, 470, 10000000])
      for (const slide of [-0.65, -0.35, 0, 0.35, 0.65]) {
        const world = { ...settings, car };
        const state = { ...initialState(), distance, slide };
        const limits = bodyRoadLimits(state, car, world);
        assert.ok(limits.left < limits.right);
        for (const side of [-1, 1]) {
          state.offset = side < 0 ? limits.left + 0.08 : limits.right - 0.08;
          assert.equal(roadDeparture(state, car, world).excursion, 0);
          const outline = collisionFootprint(state, car, world);
          // Independently sample edges more densely than production. No invisible
          // symmetric envelope may overrule a body that is actually on the asphalt.
          for (let i = 0; i < outline.length; i++) {
            const a = outline[i],
              b = outline[(i + 1) % outline.length];
            for (let j = 0; j <= 40; j++) {
              const x = a.x + ((b.x - a.x) * j) / 40,
                z = a.z + ((b.z - a.z) * j) / 40;
              assert.ok(Math.abs(x - roadAt(-z, world).x) <= world.roadWidth / 2 + 1e-6);
            }
          }
          if (Math.abs(state.offset) > roadOffsetLimit(world.roadWidth, slide, car))
            oldFalseWarnings++;
          const challenge = initialChallenge(world, state, config);
          stepChallenge(challenge, state, stopped, world, 1 / 120, config);
          assert.equal(challenge.offRoad.active, false);
          state.offset += side * 0.28;
          const outside = roadDeparture(state, car, world);
          assert.ok(Math.abs(outside.excursion - 0.2) < 1e-8);
          assert.equal(outside.side, side);
          stepChallenge(challenge, state, stopped, world, 1 / 120, config);
          assert.equal(challenge.offRoad.active, true);
          assert.equal(challenge.offRoad.side, side);
          assert.equal(challenge.lives, 3);
        }
      }
  assert.ok(oldFalseWarnings > 100, 'covers many poses formerly flagged by the oversized envelope');
});

test('a genuine return ends the warning without erasing its spent recovery budget', () => {
  const state = { ...initialState(), slide: 0.6 };
  const limits = bodyRoadLimits(state, settings.car, settings);
  state.offset = limits.left - 0.4;
  const challenge = initialChallenge(settings, state, config);
  for (let i = 0; i < 300; i++) stepChallenge(challenge, state, stopped, settings, 1 / 120, config);
  assert.equal(challenge.offRoad.active, true);
  state.offset = limits.left + 0.1;
  stepChallenge(challenge, state, stopped, settings, 1 / 120, config);
  assert.equal(challenge.offRoad.excursion, 0, 'HUD must stop warning on the first on-road frame');
  for (let i = 0; i < 40; i++) stepChallenge(challenge, state, stopped, settings, 1 / 120, config);
  assert.equal(challenge.offRoad.active, false);
  assert.equal(challenge.offRoad.side, 0);
  assert.ok(challenge.offRoad.exposure > 0, 'safe rejoining must not bypass the refill cooldown');
  assert.equal(challenge.lives, 3);
});
