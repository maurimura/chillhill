import test from 'node:test';
import assert from 'node:assert/strict';
import { scoringDefaults, standardDriving } from '../src/config/scoring.ts';
import {
  awardNearMiss,
  driftMultiplier,
  initialScore,
  nearMissPoints,
  resetScoreEncounter,
  stepDriftScore,
  stepScore,
  streakMultiplier,
} from '../src/game/scoring.ts';
import { challengeDefaults } from '../src/config/challenge.ts';
import { initialChallenge, respawnChallenge, stepChallenge } from '../src/game/challenge.ts';
import { initialState } from '../src/game/driving.ts';
import { cars } from '../src/config/cars.ts';
import { formatSpeed, resolveUnitSystem, type UnitPreference } from '../src/config/units.ts';
import { completedScore, createScoreRun, trackScoreSettings } from '../src/scoreboard.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≈ ${b}`);
const advance = (
  score: ReturnType<typeof initialScore>,
  seconds: number,
  excursion: number,
  hz = 120,
  protectedPass = false,
) => {
  for (let i = 0; i < Math.round(seconds * hz); i++)
    stepScore(score, 1 / hz, excursion, 60, 60 / 3.6 / hz, protectedPass);
};

const driftFor = (score: ReturnType<typeof initialScore>, seconds: number, hz = 120) => {
  for (let i = 0; i < Math.round(seconds * hz); i++) stepDriftScore(score, 1 / hz, 0.5, 60, true);
};

test('metric, imperial and mid-run unit switches produce identical physics and ranked scores', () => {
  const replay = (preference: UnitPreference, switchUnits = false) => {
    const settings = {
      ...standardDriving,
      curves: 0,
      grade: 0,
      car: 'astra' as const,
      cruiseSpeed: 36,
      terrainHeight: 1,
      seed: 42,
      units: preference,
    };
    const config = { ...challengeDefaults, trafficCount: 1, graceSeconds: 0 };
    const driving = {
      ...initialState(),
      speed: 60 / 3.6,
      offset: -(settings.roadWidth / 4 - cars.astra.width - 0.3),
    };
    const challenge = initialChallenge(settings, driving, config);
    const run = createScoreRun(settings, 'units-replay');
    const vehicle = challenge.traffic[0];
    Object.assign(vehicle, { car: 'astra', lane: -1, distance: driving.distance + 10 });
    const step = (steer: number, frame: number) => {
      if (switchUnits) {
        const before = { ...settings };
        settings.units = frame % 2 ? 'metric' : 'imperial';
        trackScoreSettings(run, before, settings);
      }
      // Exercise the actual display conversion alongside the same simulation.
      formatSpeed(driving.speed * 3.6, resolveUnitSystem(settings.units, ['es-AR']));
      stepChallenge(
        challenge,
        driving,
        { steer, accelerate: true, brake: false },
        settings,
        1 / 120,
        config,
      );
    };
    for (let i = 0; i < 600 && !vehicle.passed; i++) step(0, i);
    assert.equal(challenge.overtakes, 1);
    assert.ok(challenge.score.nearMissEarned > 0);
    challenge.traffic = [];
    const quiet = { ...config, trafficCount: 0 };
    respawnChallenge(challenge, driving, settings, quiet);
    driving.speed = 15;
    driving.offset = 0;
    for (let i = 0; i < 60; i++) step(1, i);
    assert.ok(challenge.score.driftEarned > 0);
    Object.assign(driving, { offset: settings.roadWidth / 2, headingOffset: 0, lateralSpeed: 0 });
    for (let i = 0; i < 36; i++) step(0, i);
    assert.ok(challenge.score.penalties > 0);
    challenge.phase = 'gameover';
    return {
      driving,
      score: challenge.score,
      record: completedScore(run, challenge, driving.travelled, '2026-09-07T12:00:00.000Z'),
    };
  };
  const metric = replay('metric');
  assert.deepEqual(replay('imperial'), metric);
  assert.deepEqual(replay('auto'), metric);
  assert.deepEqual(replay('metric', true), metric);
});

test('sustained drifting ramps from 20 to 60 points per second independently of timestep', () => {
  assert.deepEqual(
    [0, 2, 4, 8, 12].map((seconds) => driftMultiplier(seconds)),
    [1, 1.5, 2, 3, 3],
  );
  for (const hz of [20, 30, 60, 120]) {
    const score = initialScore();
    driftFor(score, 12, hz);
    near(score.points, 560);
    near(score.earned, 560);
    near(score.driftEarned, 560);
    assert.equal(score.nearMissEarned, 0);
    near(score.driftSeconds, 12);
    near(score.bestDriftSeconds, 12);
    near(score.driftTime, 12);
    near(score.driftPoints, 560);
    assert.equal(score.notice, 'drift');
    near(score.noticePoints, 560);
  }
  const boundary = initialScore();
  driftFor(boundary, 7.95, 20);
  stepDriftScore(boundary, 0.15, 0.5, 60, true);
  near(boundary.points, 326);
});

test('one long drift pays more than short drifts and interrupted drift points stay banked', () => {
  const long = initialScore();
  driftFor(long, 8);
  const short = initialScore();
  driftFor(short, 4);
  stepDriftScore(short, 1 / 120, 0, 60, true);
  near(short.points, 120);
  assert.equal(short.driftTime, 0);
  assert.equal(short.driftPoints, 0);
  driftFor(short, 4);
  near(long.points, 320);
  near(short.points, 240);
  near(short.driftSeconds, 8);
  near(short.bestDriftSeconds, 4);
  assert.equal(short.streak, 0, 'a drift does not manufacture a near-miss streak');
  awardNearMiss(short, 60);
  near(short.nearMissEarned, 100);
  near(short.earned, short.nearMissEarned + short.driftEarned);
  resetScoreEncounter(short);
  near(short.points, 340);
  near(short.driftEarned, 240);
  near(short.bestDriftSeconds, 4);
  assert.equal(short.driftTime, 0);
});

test('drift tuning is independent and event feedback does not hide a fresh near miss', () => {
  const score = initialScore();
  stepDriftScore(score, 4, 0.5, 60, true, {
    ...scoringDefaults,
    driftPointsPerSecond: 10,
    driftRampSeconds: 2,
    driftMaxMultiplier: 2,
  });
  near(score.points, 70);
  awardNearMiss(score, 60);
  stepDriftScore(score, 0.1, 0.5, 60, true);
  assert.equal(score.notice, 'near-miss');
  assert.equal(score.noticePoints, 100);
  stepScore(score, 2, 0, 60, 1, false);
  stepDriftScore(score, 0.1, 0.5, 60, true);
  assert.equal(score.notice, 'drift');
});

test('stationary, fading, invalid and ineligible drifts cannot score or keep a combo', () => {
  for (const [amount, speed, eligible] of [
    [0, 60, true],
    [0.099, 60, true],
    [NaN, 60, true],
    [Infinity, 60, true],
    [0.5, 0, true],
    [0.5, 7.2, true],
    [0.5, NaN, true],
    [0.5, Infinity, true],
    [0.5, 60, false],
  ] as const) {
    const score = initialScore();
    driftFor(score, 1);
    const banked = score.points;
    stepDriftScore(score, 1, amount, speed, eligible);
    assert.equal(score.points, banked);
    assert.equal(score.driftTime, 0);
    near(score.driftSeconds, 1);
    near(score.bestDriftSeconds, 1);
  }
  const score = initialScore();
  stepDriftScore(score, 1, 0.1, 7.21, true);
  near(score.points, 22.5);
});

test('drift pauses are exact no-ops; shoulder and grace interrupt immediately', () => {
  const score = initialScore();
  driftFor(score, 1);
  const before = structuredClone(score);
  for (const dt of [0, -1, NaN, Infinity]) stepDriftScore(score, dt, 0.5, 60, true);
  assert.deepEqual(score, before);
  stepScore(score, 1 / 120, 0.001, 60, 1, false);
  assert.equal(score.driftTime, 0, 'even a brief shoulder touch breaks sustained drift');
  assert.equal(score.points, before.points, 'the ordinary shoulder debit retains its debounce');
  driftFor(score, 1);
  const points = score.points;
  stepScore(score, 1 / 120, 0, 60, 1, true);
  assert.equal(score.driftTime, 0);
  assert.equal(score.points, points);
});

test('mixed drift, near misses and shoulder deductions retain consistent rounded totals', () => {
  const score = initialScore();
  for (let i = 0; i < 2000; i++) {
    const outside = i % 173 > 145;
    stepScore(score, 1 / 120, outside ? 0.05 : 0, 60, 0.1, false);
    stepDriftScore(score, 1 / 120, 0.5, 60, !outside);
    if (i % 97 === 0) awardNearMiss(score, 60);
    near(score.earned, score.nearMissEarned + score.driftEarned);
    near(score.points, score.earned - score.penalties);
    assert.ok(score.points >= 0 && score.points <= score.earned);
    assert.ok(Math.round(score.points) <= score.nearMissEarned + Math.round(score.driftEarned));
  }
});

test('real steering drift earns without smoke rendering; shoulders, grace and impacts never award', () => {
  const settings = {
    ...standardDriving,
    curves: 0,
    grade: 0,
    car: 'astra' as const,
    cruiseSpeed: 36,
    terrainHeight: 1,
    seed: 42,
    smoke: 0,
  };
  const config = { ...challengeDefaults, trafficCount: 0, graceSeconds: 0 };
  const driving = { ...initialState(), speed: 15 };
  const challenge = initialChallenge(settings, driving, config);
  const input = { steer: 1, accelerate: true, brake: false };
  for (let i = 0; i < 60; i++) stepChallenge(challenge, driving, input, settings, 1 / 120, config);
  assert.ok(driving.driftAmount > scoringDefaults.driftMinAmount);
  assert.ok(challenge.score.driftEarned > 0);
  assert.ok(challenge.score.driftTime > 0);

  const banked = challenge.score.driftEarned;
  driving.offset = settings.roadWidth / 2;
  stepChallenge(challenge, driving, input, settings, 1 / 120, config);
  assert.equal(challenge.offRoad.active, true);
  assert.equal(challenge.score.driftEarned, banked);
  assert.equal(challenge.score.driftTime, 0);

  respawnChallenge(challenge, driving, settings, config);
  Object.assign(driving, { speed: 15, driftAmount: 0.8 });
  challenge.graceRemaining = 1;
  stepChallenge(challenge, driving, input, settings, 1 / 120, config);
  assert.equal(challenge.score.driftEarned, banked);
  assert.equal(challenge.score.driftTime, 0);

  const collisionConfig = { ...config, trafficCount: 1 };
  const collisionDriving = {
    ...initialState(),
    offset: settings.roadWidth / 4,
    speed: 15,
    driftAmount: 0.8,
  };
  const collision = initialChallenge(settings, collisionDriving, collisionConfig);
  driftFor(collision.score, 1);
  const beforeCollision = collision.score.points;
  collision.traffic[0].distance = collisionDriving.distance;
  stepChallenge(collision, collisionDriving, input, settings, 1 / 120, collisionConfig);
  assert.equal(collision.phase, 'crashed');
  assert.equal(collision.score.points, beforeCollision, 'no drift points on the impact step');
  assert.equal(collision.score.driftTime, 0);
  const atImpact = structuredClone(collision.score);
  stepChallenge(collision, collisionDriving, input, settings, 1 / 120, collisionConfig);
  assert.deepEqual(collision.score, atImpact, 'crash animation never accrues score or time');
  respawnChallenge(collision, collisionDriving, settings, collisionConfig);
  assert.equal(collision.score.points, beforeCollision);
  near(collision.score.bestDriftSeconds, 1);
});

test('near-miss points scale with captured speed and the next clean-streak multiplier', () => {
  assert.deepEqual(
    [15, 30, 60, 90, 120, 180].map((speed) => nearMissPoints(speed, 0)),
    [50, 50, 100, 150, 200, 200],
  );
  const score = initialScore();
  assert.deepEqual(
    Array.from({ length: 6 }, () => awardNearMiss(score, 90)),
    [150, 188, 225, 263, 300, 300],
  );
  assert.equal(score.streak, 6);
  assert.equal(score.bestStreak, 6);
  assert.equal(score.points, 1426);
  assert.equal(streakMultiplier(score.streak), 2);
  advance(score, 120, 0);
  assert.equal(score.points, 1426, 'time/distance do not earn points');
  assert.equal(score.streak, 6, 'clean streak has no expiry timer');
  assert.equal(score.noticeRemaining, 0);
});

test('all scoring constants are independently tweakable', () => {
  assert.equal(
    nearMissPoints(60, 2, { ...scoringDefaults, nearMissPoints: 200, streakStep: 0.5 }),
    400,
  );
  const score = initialScore();
  awardNearMiss(score, 60);
  stepScore(score, 1, 0.5, 60, 1, false, {
    ...scoringDefaults,
    shoulderDebounce: 0,
    shoulderEntryPenalty: 10,
    shoulderMinRate: 2,
    shoulderMaxRate: 2,
  });
  near(score.points, 88);
});

test('shoulder entry and depth-weighted drain are frame-rate independent', () => {
  for (const hz of [20, 30, 60, 120]) {
    for (const excursion of [0.001, 1.25, 2.5, 6]) {
      const score = initialScore();
      awardNearMiss(score, 120);
      awardNearMiss(score, 120);
      advance(score, 1, excursion, hz);
      const rate = 10 + 20 * Math.min(1, excursion / 2.5);
      near(score.points, 450 - 25 - rate * 0.85);
      near(score.points, score.earned - score.penalties);
      assert.equal(score.shoulderTouches, 1);
      assert.equal(score.streak, 0);
      assert.equal(score.bestStreak, 2);
      near(score.shoulderSeconds, 1);
    }
  }
});

test('edge debounce avoids flicker charges and rapid side switching shares one departure', () => {
  const score = initialScore();
  awardNearMiss(score, 120);
  advance(score, 0.1, 0.1);
  assert.equal(score.points, 200);
  assert.equal(score.shoulderTouches, 0);
  advance(score, 0.1, 0);
  advance(score, 0.1, 0.2);
  assert.equal(score.shoulderTouches, 1);
  assert.equal(score.streak, 0);
  advance(score, 0.5, 0);
  advance(score, 0.5, 0.1);
  assert.equal(score.shoulderTouches, 1, 'brief rejoins do not charge another entry');
  advance(score, 1, 0);
  assert.equal(score.streak, 0, 'crossing/rejoining does not restore a combo');
  advance(score, 0.2, 0.1);
  assert.equal(score.shoulderTouches, 2);
});

test('penalties stop at zero without creating debt, and crashes preserve banked points', () => {
  const score = initialScore();
  awardNearMiss(score, 60);
  advance(score, 20, 5);
  assert.equal(score.points, 0);
  assert.equal(score.penalties, 100);
  awardNearMiss(score, 60);
  assert.equal(score.points, 100, 'new points do not pay an invisible debt');
  resetScoreEncounter(score);
  assert.equal(score.points, 100);
  assert.equal(score.streak, 0);
  assert.equal(score.noticeRemaining, 0);
});

test('pause/invalid dt freezes points, streak, penalties, notices and run statistics exactly', () => {
  const score = initialScore();
  awardNearMiss(score, 90);
  advance(score, 0.2, 0.5);
  const before = structuredClone(score);
  for (const dt of [0, -1, NaN, Infinity]) stepScore(score, dt, 5, 100, 100, false);
  assert.deepEqual(score, before);
  advance(score, 3, 5, 120, true);
  assert.equal(score.points, before.points, 'grace does not penalize');
  assert.equal(score.shoulderTouches, 1);
});

test('run statistics use moving speed/time, not a stationary wait or fall animation', () => {
  const score = initialScore();
  advance(score, 10, 0);
  stepScore(score, 30, 0, 0, 0, false);
  near((score.movingDistance / score.movingSeconds) * 3.6, 60);
  near(score.drivingSeconds, 40);
  assert.equal(score.topSpeed, 60);
});

test('real near misses bank speed-weighted points only on clearance, not the later speed', () => {
  for (const lane of [1, -1] as const) {
    const settings = {
      ...standardDriving,
      curves: 0,
      grade: 0,
      car: 'astra' as const,
      cruiseSpeed: 36,
      terrainHeight: 1,
      seed: 42,
    };
    // Keep this capture-speed fixture at 40 km/h traffic even when the default
    // cap changes: the 60 km/h player must be able to overtake it.
    const config = {
      ...challengeDefaults,
      trafficCount: 1,
      graceSeconds: 0,
      trafficSpeedRatio: 40 / settings.maxSpeed,
    };
    const driving = {
      ...initialState(),
      speed: 60 / 3.6,
      offset: lane * (settings.roadWidth / 4 - cars.astra.width - 0.3),
    };
    const challenge = initialChallenge(settings, driving, config);
    const vehicle = challenge.traffic[0];
    Object.assign(vehicle, { car: 'astra', lane, distance: driving.distance + 10 });
    for (let i = 0; i < 1200 && !vehicle.nearMissClose; i++) {
      driving.speed = 60 / 3.6;
      stepChallenge(
        challenge,
        driving,
        { steer: 0, accelerate: false, brake: false },
        settings,
        1 / 120,
        config,
      );
    }
    assert.equal(challenge.score.points, 0);
    assert.equal(vehicle.nearMissClose, true);
    const captured = vehicle.nearMissSpeed!;
    driving.speed = 80 / 3.6;
    for (let i = 0; i < 1200 && !vehicle.passed; i++)
      stepChallenge(
        challenge,
        driving,
        { steer: 0, accelerate: true, brake: false },
        settings,
        1 / 120,
        config,
      );
    assert.equal(challenge.overtakes, 1);
    assert.equal(challenge.score.points, nearMissPoints(captured, 0));
    assert.equal(challenge.score.points, 100);
    const banked = challenge.score.points;
    driving.offset = 30;
    stepChallenge(
      challenge,
      driving,
      { steer: 0, accelerate: true, brake: false },
      settings,
      1 / 120,
      config,
    );
    assert.equal(challenge.score.streak, 0);
    assert.equal(challenge.score.points, banked, 'falling costs a life, no extra crash deduction');
    respawnChallenge(challenge, driving, settings, config);
    assert.equal(challenge.score.points, banked);
  }
});
