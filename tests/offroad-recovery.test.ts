import test from 'node:test';
import assert from 'node:assert/strict';
import { challengeDefaults } from '../src/config/challenge.ts';
import { initialState, type Input } from '../src/game/driving.ts';
import { bodyRoadLimits } from '../src/game/collision.ts';
import {
  initialChallenge,
  offRoadAllowance,
  respawnChallenge,
  stepChallenge,
} from '../src/game/challenge.ts';

const settings = {
  cruiseSpeed: 36,
  maxSpeed: 80,
  drift: 0.55,
  roadWidth: 10,
  car: 'astra' as const,
  curves: 0,
  grade: 0.09,
  terrainHeight: 1,
  seed: 42,
};
const config = { ...challengeDefaults, trafficCount: 0, graceSeconds: 0 };
const neutral: Input = { steer: 0, accelerate: false, brake: false };
const edge = bodyRoadLimits(initialState(), settings.car, settings).right;
const fixture = (excursion = 0.25) => {
  const state = { ...initialState(), offset: edge + excursion };
  return { state, challenge: initialChallenge(settings, state, config) };
};
const advance = (game: ReturnType<typeof fixture>, seconds: number, input = neutral, fps = 120) => {
  for (let i = 0; i < Math.round(seconds * fps); i++)
    stepChallenge(game.challenge, game.state, input, settings, 1 / fps, config);
};

test('a small departure starts a recovery window instead of losing a life', () => {
  const game = fixture();
  advance(game, 0.5);
  assert.equal(game.challenge.phase, 'racing');
  assert.equal(game.challenge.lives, 3);
  assert.ok(game.challenge.offRoad.active);
  assert.ok(Math.abs(game.challenge.offRoad.excursion - 0.25) < 1e-9);
  assert.ok(game.challenge.offRoad.remaining > 3 && game.challenge.offRoad.remaining < 4);
  assert.equal(game.state.offset, edge + 0.25, 'there is no hidden clamp or automatic rescue');
});

test('greater distance monotonically reduces the time allowance and burns the budget faster', () => {
  const distances = [0, 0.25, 1, 2, 3, 4, 5, 5.9, 6];
  const times = distances.map((distance) => offRoadAllowance(distance, config));
  assert.equal(times[0], 4);
  assert.ok(Math.abs(times.at(-1)! - 0.8) < 1e-9);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] < times[i - 1]);
  const near = fixture(0.25),
    far = fixture(5);
  advance(near, 0.5);
  advance(far, 0.5);
  assert.ok(far.challenge.offRoad.exposure > near.challenge.offRoad.exposure);
  assert.ok(far.challenge.offRoad.remaining < near.challenge.offRoad.remaining);
  assert.equal(far.challenge.lives, 3);
});

test('moving out and back changes urgency without refilling the spent recovery budget', () => {
  const game = fixture(0.25);
  advance(game, 1);
  const near = { ...game.challenge.offRoad };
  game.state.offset = edge + 4.5;
  advance(game, 0.1);
  const far = { ...game.challenge.offRoad };
  assert.ok(far.remaining < near.remaining);
  assert.ok(far.exposure > near.exposure);
  game.state.offset = edge + 0.25;
  advance(game, 0.1);
  assert.ok(game.challenge.offRoad.remaining > far.remaining);
  assert.ok(game.challenge.offRoad.remaining < near.remaining);
  assert.ok(game.challenge.offRoad.exposure > far.exposure);
});

test('a clean return saves the life but crossing to either verge cannot refill the budget', () => {
  const game = fixture();
  advance(game, 1);
  const spent = game.challenge.offRoad.exposure;
  game.state.offset = 0;
  advance(game, 0.1);
  assert.equal(game.challenge.offRoad.exposure, spent);
  game.state.offset = edge + 0.25;
  advance(game, 0.1);
  assert.ok(game.challenge.offRoad.exposure > spent);
  game.state.offset = 0;
  const beforeRejoin = game.challenge.offRoad.exposure;
  advance(game, config.offRoadRejoinSeconds);
  assert.equal(game.challenge.offRoad.active, false);
  assert.equal(game.challenge.offRoad.exposure, beforeRejoin);
  assert.equal(game.challenge.lives, 3);
  game.state.offset = -edge - 0.25;
  advance(game, 0.1);
  assert.ok(game.challenge.offRoad.exposure > beforeRejoin);
  assert.equal(game.challenge.offRoad.side, -1);
  assert.equal(game.challenge.offRoad.rejoinTime, 0);
});

test('five continuous safe seconds precede gradual refill, which a new departure interrupts', () => {
  const game = fixture();
  advance(game, 2);
  const spent = game.challenge.offRoad.exposure;
  game.state.offset = 0;
  advance(game, 5);
  assert.ok(Math.abs(game.challenge.offRoad.exposure - spent) < 1e-9);
  advance(game, 0.5);
  assert.ok(Math.abs(game.challenge.offRoad.exposure - (spent - 0.5 / 4)) < 1e-9);
  const partial = game.challenge.offRoad.exposure;
  game.state.offset = -edge - 0.25;
  advance(game, 0.1);
  assert.ok(game.challenge.offRoad.exposure > partial);
  assert.equal(game.challenge.offRoad.rejoinTime, 0);
  game.state.offset = 0;
  const interrupted = game.challenge.offRoad.exposure;
  advance(game, 4.5);
  assert.equal(game.challenge.offRoad.exposure, interrupted, 'a new full cooldown is required');
  advance(game, 4.5);
  assert.equal(game.challenge.offRoad.exposure, 0);
  assert.equal(game.challenge.offRoad.active, false);
  assert.equal(game.challenge.offRoad.rejoinTime, 0);
  game.state.offset = edge + 0.25;
  advance(game, 0.1);
  assert.ok(
    game.challenge.offRoad.remaining > 3.8,
    'a full refill restores the four-second budget',
  );
});

test('repeated side-to-side departures share one finite budget and eventually cost one life', () => {
  const game = fixture();
  for (let i = 0; i < 8 && game.challenge.phase === 'racing'; i++) {
    game.state.offset = (i % 2 ? -1 : 1) * (edge + 0.25);
    advance(game, 0.5);
    if (game.challenge.phase !== 'racing') break;
    game.state.offset = 0;
    advance(game, 0.5);
  }
  assert.equal(game.challenge.phase, 'falling');
  assert.equal(game.challenge.lives, 2);
});

test('cooldown and refill freeze on invalid/paused steps, and are reset by respawn', () => {
  for (const safeSeconds of [2, 5.5]) {
    const game = fixture();
    advance(game, 2);
    game.state.offset = 0;
    advance(game, safeSeconds);
    const snapshot = structuredClone(game);
    for (const dt of [0, -1, NaN, Infinity])
      stepChallenge(game.challenge, game.state, neutral, settings, dt, config);
    assert.deepEqual(game, snapshot);
    respawnChallenge(game.challenge, game.state, settings, config);
    assert.equal(game.challenge.offRoad.exposure, 0);
    assert.equal(game.challenge.offRoad.rejoinTime, 0);
  }
});

test('cooldown boundary and refill rate are frame-rate independent and configurable', () => {
  for (const fps of [30, 60, 120]) {
    const game = fixture();
    advance(game, 2, neutral, fps);
    const spent = game.challenge.offRoad.exposure;
    game.state.offset = 0;
    const tuned = { ...config, offRoadCooldownSeconds: 0.515, offRoadRefillSeconds: 2 };
    for (let i = 0; i < fps; i++)
      stepChallenge(game.challenge, game.state, neutral, settings, 1 / fps, tuned);
    assert.ok(Math.abs(game.challenge.offRoad.exposure - (spent - (1 - 0.515) / 2)) < 1e-9);
  }
});

test('steering remains live and can drive back onto the road without a lost life', () => {
  const game = fixture();
  game.state.speed = 7;
  advance(game, 0.05);
  assert.ok(game.challenge.offRoad.active);
  const distance = game.state.distance;
  advance(game, 3.5, { ...neutral, steer: -0.3 });
  assert.equal(game.challenge.phase, 'racing');
  assert.equal(game.challenge.lives, 3);
  assert.equal(game.challenge.offRoad.active, false);
  assert.ok(game.state.distance > distance + 10, 'recovery never freezes forward driving');
});

test('timeout deducts exactly one life, then respawn clears the recovery state', () => {
  const game = fixture(1);
  let elapsed = 0;
  while (game.challenge.phase === 'racing' && elapsed < 6) {
    advance(game, 1 / 120);
    elapsed += 1 / 120;
  }
  assert.ok(Math.abs(elapsed - offRoadAllowance(1, config)) < 1 / 120 + 1e-6);
  assert.equal(game.challenge.phase, 'falling');
  assert.equal(game.challenge.lives, 2);
  assert.equal(game.challenge.lastIncident, 'bounds');
  advance(game, 0.5);
  assert.equal(game.challenge.lives, 2);
  respawnChallenge(game.challenge, game.state, settings, config);
  assert.equal(game.challenge.offRoad.active, false);
  assert.equal(game.challenge.offRoad.exposure, 0);
  assert.equal(game.state.offset, settings.roadWidth / 4);
});

test('crossing the outer recovery range fails on either side, without waiting for timeout', () => {
  for (const side of [-1, 1]) {
    const game = fixture();
    game.state.offset = side * (edge + config.offRoadRange + 0.01);
    advance(game, 1 / 120);
    assert.equal(game.challenge.phase, 'falling');
    assert.equal(game.challenge.lives, 2);
    assert.equal(game.challenge.offRoad.remaining, 0);
  }
});

test('off-road timers freeze with paused/invalid steps and do not bypass respawn grace', () => {
  const game = fixture();
  advance(game, 1);
  const snapshot = structuredClone(game);
  for (const dt of [0, -1, NaN, Infinity])
    stepChallenge(game.challenge, game.state, neutral, settings, dt, config);
  assert.deepEqual(game, snapshot);
  game.challenge.graceRemaining = 0.5;
  advance(game, 0.25);
  assert.equal(game.challenge.offRoad.exposure, 0);
  assert.equal(game.challenge.lives, 3);
});

test('off-road shortcuts never score, even when they complete a pass', () => {
  const game = fixture(0.5);
  const trafficConfig = { ...config, trafficCount: 1 };
  game.challenge = initialChallenge(settings, game.state, trafficConfig);
  game.state.speed = settings.maxSpeed / 3.6;
  game.challenge.traffic[0].distance = game.state.distance + 4;
  for (let i = 0; i < 120; i++)
    stepChallenge(
      game.challenge,
      game.state,
      { ...neutral, accelerate: true },
      settings,
      1 / 120,
      trafficConfig,
    );
  assert.equal(game.challenge.phase, 'racing');
  assert.equal(game.challenge.traffic[0].passed, true);
  assert.equal(game.challenge.overtakes, 0);
});

test('traffic collisions still cost a life while an off-road recovery is active', () => {
  const game = fixture();
  advance(game, 0.5);
  const trafficConfig = { ...config, trafficCount: 1 };
  const traffic = initialChallenge(settings, initialState(), trafficConfig).traffic[0];
  game.state.offset = traffic.offset;
  traffic.distance = game.state.distance;
  game.challenge.traffic = [traffic];
  stepChallenge(game.challenge, game.state, neutral, settings, 1 / 120, trafficConfig);
  assert.equal(game.challenge.phase, 'crashed');
  assert.equal(game.challenge.lives, 2);
  assert.equal(game.challenge.lastIncident, 'traffic');
});

test('recovery timing stays consistent at 30/60/120 Hz and respects tuning', () => {
  for (const fps of [30, 60, 120]) {
    const game = fixture(3);
    let elapsed = 0;
    while (game.challenge.phase === 'racing' && elapsed < 6) {
      advance(game, 1 / fps, neutral, fps);
      elapsed += 1 / fps;
    }
    assert.ok(Math.abs(elapsed - offRoadAllowance(3, config)) <= 1 / fps + 1e-6);
    assert.equal(game.challenge.lives, 2);
  }
  const tuned = { ...config, offRoadRange: 10, offRoadSeconds: 8, offRoadMinSeconds: 2 };
  assert.equal(offRoadAllowance(0, tuned), 8);
  assert.equal(offRoadAllowance(10, tuned), 2);
});
