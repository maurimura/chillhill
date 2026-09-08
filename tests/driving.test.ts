import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, roadOffsetLimit, stepDriving, type Input } from '../src/game/driving.ts';
import { roadAt, random, terrainAt } from '../src/game/route.ts';
import { maxDrivingSpeed } from '../src/config/scoring.ts';

const config = { cruiseSpeed: 36, maxSpeed: 80, drift: 0.55, roadWidth: 10 };
const neutral: Input = { steer: 0, accelerate: false, brake: false };
const simulate = (seconds: number, input = neutral, fps = 120, state = initialState()) => {
  for (let i = 0; i < seconds * fps; i++) stepDriving(state, input, config, 1 / fps);
  return state;
};

test('the car eases from rest to the configured coasting speed', () => {
  const state = simulate(12);
  assert.equal(state.speed * 3.6, 36);
  assert.ok(state.distance > 90);
});

test('holding acceleration reaches but never exceeds the speed cap', () => {
  const state = simulate(30, { ...neutral, accelerate: true });
  assert.equal(state.speed, 80 / 3.6);
});

test('280 km/h is reachable in both modes at every frame rate, with unchanged coasting and full braking', () => {
  const fastConfig = { ...config, maxSpeed: maxDrivingSpeed };
  for (const mode of ['cozy', 'challenge'] as const)
    for (const fps of [30, 60, 120]) {
      const state = initialState();
      for (let i = 0; i < fps * 25; i++) {
        stepDriving(state, { ...neutral, accelerate: true }, fastConfig, 1 / fps, 0, 1, mode);
        assert.ok(state.speed <= 280 / 3.6);
      }
      assert.equal(state.speed, 280 / 3.6);
      for (let i = 0; i < fps * 50; i++)
        stepDriving(state, neutral, fastConfig, 1 / fps, 0, 1, mode);
      if (mode === 'cozy') assert.equal(state.speed * 3.6, 36);
      else assert.ok(state.speed < 280 / 3.6);
      state.speed = 280 / 3.6;
      for (let i = 0; i < fps * 9; i++)
        stepDriving(
          state,
          { steer: 1, accelerate: true, brake: true },
          fastConfig,
          1 / fps,
          0,
          1,
          mode,
        );
      assert.equal(state.speed, 0);
      const stopped = { ...state };
      for (let i = 0; i < fps; i++)
        stepDriving(
          state,
          { steer: 1, accelerate: false, brake: true },
          fastConfig,
          1 / fps,
          0,
          1,
          mode,
        );
      assert.equal(state.distance, stopped.distance);
      assert.equal(state.offset, stopped.offset);
      assert.equal(state.slide, stopped.slide);
    }
});

test('brake wins over acceleration and holds every position axis completely still', () => {
  const state = simulate(10, { ...neutral, accelerate: true });
  const braking = { steer: 1, accelerate: true, brake: true };
  simulate(4, braking, 120, state);
  assert.equal(state.speed, 0);
  const { distance, offset, slide } = state;
  simulate(20, braking, 120, state);
  assert.equal(state.distance, distance);
  assert.equal(state.offset, offset);
  assert.equal(state.lateralSpeed, 0);
  assert.equal(state.slide, slide);
  assert.equal(state.yawVelocity, 0);
  assert.equal(state.driftAmount, 0);
});

test('releasing the brake gently resumes automatic motion', () => {
  const state = simulate(10, { ...neutral, brake: true });
  assert.equal(state.distance, 20);
  stepDriving(state, neutral, config, 1 / 60);
  assert.ok(state.speed > 0 && state.speed < 0.1);
  simulate(10, neutral, 120, state);
  assert.equal(state.speed, config.cruiseSpeed / 3.6);
});

test('releasing acceleration settles back to cruise speed', () => {
  const state = simulate(10, { ...neutral, accelerate: true });
  simulate(15, neutral, 120, state);
  assert.equal(state.speed, 10);
});

test('steering drifts sideways and the forgiving edge keeps the car on the road', () => {
  const state = simulate(10);
  simulate(0.2, { ...neutral, steer: 1 }, 120, state);
  assert.ok(state.offset > 0 && state.lateralSpeed > 0);
  const before = state.offset;
  stepDriving(state, neutral, config, 1 / 120);
  assert.ok(state.offset > before, 'sideways momentum should persist after releasing steering');
  simulate(20, { ...neutral, steer: 1 }, 120, state);
  assert.ok(state.offset <= config.roadWidth / 2 - 1.15);
});

test('driving distance remains consistent at 30, 60, and 120 Hz', () => {
  const distances = [30, 60, 120].map((fps) => simulate(20, neutral, fps).distance);
  assert.ok(Math.max(...distances) - Math.min(...distances) < 0.2);
});

test('the rear steps out beyond the direction of travel while the car keeps its forward speed', () => {
  const state = simulate(10);
  const start = state.distance;
  simulate(0.75, { ...neutral, steer: 1 }, 120, state);
  const travelYaw = -Math.atan2(state.lateralSpeed, state.speed);
  assert.ok(state.slide < travelYaw - 0.15, 'the tail should swing beyond ordinary turning');
  assert.ok(state.driftAmount > 0.25);
  assert.equal(state.speed, config.cruiseSpeed / 3.6);
  assert.ok(state.distance > start + 7);
  assert.ok(Math.abs(state.offset) <= roadOffsetLimit(config.roadWidth, state.slide));
});

test('countersteering moves the tail smoothly through to the opposite side', () => {
  const state = simulate(10);
  simulate(0.6, { ...neutral, steer: 1 }, 120, state);
  const before = state.slide;
  stepDriving(state, { ...neutral, steer: -1 }, config, 1 / 120);
  assert.ok(Math.abs(state.slide - before) < 0.03, 'a key change must not snap the heading');
  simulate(1.2, { ...neutral, steer: -1 }, 120, state);
  assert.ok(state.slide > 0.2);
  assert.ok(state.speed > 9);
});

test('releasing steering settles the rear and stops generating drift', () => {
  const state = simulate(10);
  simulate(0.65, { ...neutral, steer: 1 }, 120, state);
  simulate(5, neutral, 120, state);
  assert.ok(Math.abs(state.slide) < 0.01);
  assert.ok(Math.abs(state.yawVelocity) < 0.01);
  assert.ok(state.driftAmount < 0.01);
  assert.equal(state.speed, 10);
});

test('stationary steering cannot swing the car or emit drift smoke', () => {
  const state = simulate(5, { ...neutral, steer: 1, brake: true });
  assert.equal(state.slide, 0);
  assert.equal(state.driftAmount, 0);
  assert.equal(state.offset, 0);
});

test('turning drift off disables rear slip effects, and yaw stays stable at different frame rates', () => {
  const noDrift = simulate(10);
  for (let i = 0; i < 120; i++)
    stepDriving(noDrift, { ...neutral, steer: 1 }, { ...config, drift: 0 }, 1 / 120);
  assert.equal(noDrift.driftAmount, 0);
  const angles = [30, 60, 120].map((fps) => {
    const state = simulate(10, neutral, fps);
    return simulate(0.6, { ...neutral, steer: 1 }, fps, state).slide;
  });
  assert.ok(Math.max(...angles) - Math.min(...angles) < 0.06);
});

test('the whole configurable route slopes downhill, with terrain below its shoulders', () => {
  for (const grade of [0.03, 0.09, 0.16]) {
    const world = { curves: 1.7, grade, roadWidth: 10, terrainHeight: 2, seed: 42 };
    for (let s = 0; s <= 2420; s += 5) {
      assert.ok(roadAt(s + 1, world).y < roadAt(s, world).y);
      assert.ok(roadAt(s, world).metric >= 1);
      assert.ok(terrainAt(s, 5, world) < roadAt(s, world).y);
    }
  }
});

test('the same seed recreates scenery; a different seed changes it', () => {
  const a = random(42),
    b = random(42),
    c = random(43);
  const sequenceA = Array.from({ length: 10 }, a);
  assert.deepEqual(sequenceA, Array.from({ length: 10 }, b));
  assert.notDeepEqual(sequenceA, Array.from({ length: 10 }, c));
});

test('generated bends join with continuous position, direction and curvature at any distance', () => {
  const world = { curves: 1.7, grade: 0.09, roadWidth: 10, terrainHeight: 1, seed: 42 };
  for (const boundary of [90, 180, 360, 630, 1260, 180000, 6300000]) {
    const before = roadAt(boundary - 0.0001, world);
    const after = roadAt(boundary + 0.0001, world);
    assert.ok(Math.abs(after.x - before.x) < 0.001);
    assert.ok(Math.abs(after.dx - before.dx) < 0.0001);
    assert.ok(Math.abs(after.curvature - before.curvature) < 0.00001);
    assert.deepEqual(roadAt(boundary, world), roadAt(boundary, { ...world }));
    assert.notEqual(roadAt(boundary, world).x, roadAt(boundary, { ...world, seed: 73 }).x);
  }
});

test('an uninterrupted drive continues far beyond the old endpoint, with an increasing odometer', () => {
  const state = initialState();
  const world = { ...config, curves: 1, grade: 0.09, terrainHeight: 1, seed: 42 };
  for (let i = 0; i < 600 * 60; i++) {
    const road = roadAt(state.distance, world);
    stepDriving(state, neutral, config, 1 / 60, road.curvature, road.metric);
  }
  assert.ok(state.distance > 5000);
  assert.ok(state.travelled > 5900);
  assert.ok(state.travelled >= state.distance - 20);
  assert.equal(state.speed, 10);
  assert.ok(Number.isFinite(state.offset) && Math.abs(state.slide) <= 0.8);
});
