import assert from 'node:assert/strict';
import test from 'node:test';
import { touchPedals, touchSteering } from '../src/game/touch-input.ts';
import { initialState, stepDriving } from '../src/game/driving.ts';
import { standardDriving } from '../src/config/scoring.ts';

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
