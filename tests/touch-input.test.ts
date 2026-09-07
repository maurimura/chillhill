import assert from 'node:assert/strict';
import test from 'node:test';
import { touchDrivingSteer, touchPedals, touchSteering } from '../src/game/touch-input.ts';
import { initialState, stepDriving } from '../src/game/driving.ts';
import { standardDriving } from '../src/config/scoring.ts';
import { initialChallenge, stepChallenge } from '../src/game/challenge.ts';
import { challengeDefaults } from '../src/config/challenge.ts';
import { initialScore, stepDriftScore } from '../src/game/scoring.ts';

test('challenge touch steering is continuous, symmetric and gentle near center', () => {
  for (const speed of [0, 10, 110 / 3.6]) {
    let previous = 0;
    for (let i = 0; i <= 100; i++) {
      const raw = i / 100;
      const steer = touchSteering(raw, 'challenge', speed);
      assert.ok(steer >= previous && steer <= raw);
      assert.equal(touchSteering(-raw, 'challenge', speed), -steer);
      previous = steer;
    }
    assert.equal(touchSteering(0.12, 'challenge', speed), 0);
    assert.ok(touchSteering(0.121, 'challenge', speed) < 0.001);
    assert.equal(touchSteering(1, 'challenge', speed), 1);
    assert.equal(touchSteering(-1, 'challenge', speed), -1);
  }
  assert.ok(touchSteering(0.5, 'challenge', 30) < 0.23);
  assert.ok(touchSteering(0.5, 'challenge', 30) < touchSteering(0.5, 'challenge', 5));
});

test('touch values stay bounded; cozy keeps its direct steering response', () => {
  assert.equal(touchSteering(3, 'challenge'), 1);
  assert.equal(touchSteering(-3, 'challenge'), -1);
  assert.equal(touchSteering(NaN, 'challenge'), 0);
  assert.equal(touchSteering(0.1, 'cozy'), 0);
  assert.equal(touchSteering(0.6, 'cozy'), 0.6);
});

test('pedal hysteresis absorbs jitter, still coasts in the center and fully brakes', () => {
  let pedals = { accelerate: false, brake: false };
  pedals = touchPedals(-0.3, pedals);
  assert.equal(pedals.accelerate, true);
  pedals = touchPedals(-0.2, pedals);
  assert.equal(pedals.accelerate, true);
  pedals = touchPedals(0, pedals);
  assert.deepEqual(pedals, { accelerate: false, brake: false });
  pedals = touchPedals(0.4, pedals);
  assert.deepEqual(pedals, { accelerate: false, brake: true });
  pedals = touchPedals(0.25, pedals);
  assert.equal(pedals.brake, true);
  assert.deepEqual(touchPedals(0, pedals), { accelerate: false, brake: false });
  assert.deepEqual(touchPedals(NaN, pedals), { accelerate: false, brake: false });
});

test('the same short thumb correction produces less heading change at speed', () => {
  const config = { ...standardDriving, cruiseSpeed: 34 };
  const raw = initialState(),
    softened = initialState();
  raw.speed = softened.speed = 25;
  for (let i = 0; i < 60; i++) {
    stepDriving(
      raw,
      { steer: 0.5, accelerate: true, brake: false },
      config,
      1 / 120,
      0,
      1,
      'challenge',
    );
    stepDriving(
      softened,
      { steer: touchSteering(0.5, 'challenge', softened.speed), accelerate: true, brake: false },
      config,
      1 / 120,
      0,
      1,
      'challenge',
    );
  }
  assert.ok(softened.headingOffset! < raw.headingOffset! * 0.5);
  assert.ok(softened.offset < raw.offset * 0.5);
  assert.equal(softened.speed, raw.speed, 'input shaping changes neither throttle nor speed caps');
  assert.equal(softened.travelled, raw.travelled, 'distance-based scoring stays unchanged');
});

test('touch lane changes have a subtle tail swing and settle after release at every speed', () => {
  const config = { ...standardDriving, cruiseSpeed: 34 };
  for (const speed of [10, 20, 110 / 3.6]) {
    const previous = initialState(),
      touch = initialState(),
      score = initialScore();
    previous.speed = touch.speed = speed;
    let previousPeak = 0,
      touchPeak = 0,
      releaseOffset = 0;
    for (let i = 0; i < 360; i++) {
      const intent = i < 120 ? 1 : 0;
      stepDriving(
        previous,
        { steer: intent, accelerate: true, brake: false },
        config,
        1 / 120,
        0,
        1,
        'challenge',
      );
      stepDriving(
        touch,
        { steer: touchDrivingSteer(intent, touch), accelerate: true, brake: false },
        config,
        1 / 120,
        0,
        1,
        'challenge',
      );
      stepDriftScore(score, 1 / 120, touch.driftAmount, touch.speed * 3.6, true);
      previousPeak = Math.max(previousPeak, Math.abs(previous.slide));
      touchPeak = Math.max(touchPeak, Math.abs(touch.slide));
      if (i === 119) releaseOffset = touch.offset;
    }
    assert.ok(touchPeak < previousPeak * 0.45, 'the rear swings less than half as far');
    assert.ok(touchPeak < 0.26, 'a deliberate lane change stays below 15 degrees of body yaw');
    assert.ok(Math.abs(touch.headingOffset!) < 0.001, 'release settles the heading');
    assert.ok(
      touch.offset - releaseOffset < 2,
      'release does not continue sailing across the road',
    );
    assert.ok(
      score.driftEarned > 0,
      'real subtle drifts still earn the existing smoke-based points',
    );
    assert.equal(touch.speed, previous.speed);
    assert.equal(touch.travelled, previous.travelled);
  }
});

test('a held touch gesture stays bounded and reversing it does not snap the tail', () => {
  const config = { ...standardDriving, cruiseSpeed: 34 };
  const state = initialState();
  state.speed = 110 / 3.6;
  for (let i = 0; i < 480; i++) {
    const before = state.slide;
    stepDriving(
      state,
      { steer: touchDrivingSteer(i < 240 ? 1 : -1, state), accelerate: true, brake: false },
      config,
      1 / 120,
      0,
      1,
      'challenge',
    );
    assert.ok(Math.abs(state.headingOffset!) < 0.11, 'holding a thumb does not keep adding yaw');
    assert.ok(Math.abs(state.slide - before) < 0.025, 'direction changes stay smooth');
  }
  assert.ok(state.headingOffset! < -0.08, 'opposite lane changes remain available');
});

test('touch follows the bend direction, not a road-center target', () => {
  const config = { ...standardDriving, cruiseSpeed: 34 };
  for (const curvature of [-0.008, 0, 0.008]) {
    const state = initialState();
    state.speed = 25;
    state.offset = -2;
    for (let i = 0; i < 360; i++) {
      assert.equal(
        touchDrivingSteer(0, state, curvature),
        touchDrivingSteer(0, { ...state, offset: 15 }, curvature),
        'no lane-center or off-road position feedback',
      );
      stepDriving(
        state,
        { steer: touchDrivingSteer(0, state, curvature), accelerate: true, brake: false },
        config,
        1 / 120,
        curvature,
        1,
        'challenge',
      );
    }
    assert.ok(Math.abs(state.headingOffset!) < 0.003);
    assert.ok(Math.abs(state.offset + 2) < 0.25, 'neutral keeps the chosen lateral position');
  }
  assert.equal(touchDrivingSteer(1, initialState()), 0, 'no stationary rotation');
  assert.ok(Number.isFinite(touchDrivingSteer(NaN, { ...initialState(), speed: 20 }, NaN)));
});

test('touch heading recovery remains stable at 30, 60 and 120 Hz', () => {
  const states = [30, 60, 120].map((fps) => {
    const state = initialState();
    state.speed = 25;
    for (let i = 0; i < fps * 3; i++)
      stepDriving(
        state,
        { steer: touchDrivingSteer(i < fps ? 1 : 0, state), accelerate: true, brake: false },
        { ...standardDriving, cruiseSpeed: 34 },
        1 / fps,
        0,
        1,
        'challenge',
      );
    return state;
  });
  assert.ok(
    Math.max(...states.map((s) => s.offset)) - Math.min(...states.map((s) => s.offset)) < 0.2,
  );
  states.forEach((s) => {
    assert.ok(Math.abs(s.headingOffset!) < 0.001);
    assert.ok(Math.abs(s.slide) < 0.005);
  });
});

test('touch Challenge still allows road departures and the brake still holds completely', () => {
  const config = { ...standardDriving, cruiseSpeed: 34, seed: 42, curves: 0, grade: 0.09 };
  const rules = { ...challengeDefaults, trafficCount: 0 };
  const state = initialState();
  state.speed = 25;
  const challenge = initialChallenge(config, state, rules);
  for (let i = 0; i < 120 * 12 && challenge.lives === 3; i++)
    stepChallenge(
      challenge,
      state,
      { steer: 1, touch: true, accelerate: true, brake: false },
      config,
      1 / 120,
      rules,
    );
  assert.equal(challenge.lives, 2, 'holding outward still costs a life; there is no edge clamp');
  const stopped = initialState();
  stopped.speed = 20;
  const run = initialChallenge(config, stopped, rules);
  for (let i = 0; i < 120 * 3; i++)
    stepChallenge(
      run,
      stopped,
      { steer: 1, touch: true, accelerate: true, brake: true },
      config,
      1 / 120,
      rules,
    );
  assert.equal(stopped.speed, 0);
  const position = { offset: stopped.offset, distance: stopped.distance, slide: stopped.slide };
  for (let i = 0; i < 120; i++)
    stepChallenge(
      run,
      stopped,
      { steer: -1, touch: true, accelerate: true, brake: true },
      config,
      1 / 120,
      rules,
    );
  assert.deepEqual(
    { offset: stopped.offset, distance: stopped.distance, slide: stopped.slide },
    position,
  );
});
