import test from 'node:test';
import assert from 'node:assert/strict';
import { cars } from '../src/config/cars.ts';
import { challengeDefaults } from '../src/config/challenge.ts';
import {
  initialChallenge,
  respawnChallenge,
  stepChallenge,
  sweptTrafficCollision,
  type ChallengeSettings,
  type TrafficVehicle,
} from '../src/game/challenge.ts';
import { initialState, stepDriving, type Input } from '../src/game/driving.ts';
import { bodyRoadLimits } from '../src/game/collision.ts';
import { roadAt } from '../src/game/route.ts';

const settings: ChallengeSettings = {
  cruiseSpeed: 36,
  maxSpeed: 80,
  drift: 0.55,
  roadWidth: 10,
  car: 'astra',
  curves: 0,
  grade: 0.09,
  terrainHeight: 1,
  seed: 42,
};
const neutral: Input = { steer: 0, accelerate: false, brake: false };
const throttle = { ...neutral, accelerate: true };
const noTraffic = { ...challengeDefaults, trafficCount: 0, graceSeconds: 0 };

function fixture(config = challengeDefaults) {
  const driving = initialState();
  return { driving, challenge: initialChallenge(settings, driving, config) };
}

function vehicle(distance: number, offset: number): TrafficVehicle {
  return {
    id: 0,
    car: 'astra',
    color: '#cad5cb',
    distance,
    offset,
    lane: offset < 0 ? -1 : 1,
    speed: 0,
    passed: false,
  };
}

test('challenge leaves Cozy auto-coasting intact but requires its own manual throttle', () => {
  const cozy = initialState(),
    manual = initialState();
  for (let i = 0; i < 1200; i++) {
    stepDriving(cozy, neutral, settings, 1 / 120);
    stepDriving(manual, neutral, settings, 1 / 120, 0, 1, 'challenge');
  }
  assert.equal(cozy.speed, 10);
  assert.equal(manual.speed, 0);
  assert.equal(manual.distance, 20);
  for (let i = 0; i < 1200; i++)
    stepDriving(manual, throttle, settings, 1 / 120, 0, 1, 'challenge');
  assert.equal(manual.speed, settings.maxSpeed / 3.6);
  stepDriving(manual, neutral, settings, 1 / 120, 0, 1, 'challenge');
  assert.ok(
    manual.speed < settings.maxSpeed / 3.6 && manual.speed > 20,
    'lifting off coasts gently',
  );
  for (let i = 0; i < 1000; i++)
    stepDriving(
      manual,
      { steer: 1, accelerate: true, brake: true },
      settings,
      1 / 120,
      0,
      1,
      'challenge',
    );
  const position = [manual.distance, manual.offset, manual.slide, manual.headingOffset];
  for (let i = 0; i < 1000; i++)
    stepDriving(
      manual,
      { steer: -1, accelerate: true, brake: true },
      settings,
      1 / 120,
      0,
      1,
      'challenge',
    );
  assert.equal(manual.speed, 0);
  assert.deepEqual([manual.distance, manual.offset, manual.slide, manual.headingOffset], position);
});

test('unassisted steering preserves world direction instead of steering itself around bends', () => {
  const world = { ...settings, curves: 1.5 };
  const driving = { ...initialState(), distance: 60, speed: 15 };
  const initialHeading = roadAt(driving.distance, world).heading;
  for (let i = 0; i < 240; i++) {
    const road = roadAt(driving.distance, world);
    stepDriving(driving, neutral, world, 1 / 120, road.curvature, road.metric, 'challenge');
  }
  const roadHeading = roadAt(driving.distance, world).heading;
  assert.ok(Math.abs(roadHeading - initialHeading) > 0.05, 'the test must contain a real bend');
  assert.ok(Math.abs(roadHeading + (driving.headingOffset ?? 0) - initialHeading) < 0.01);
  assert.ok(Math.abs(driving.offset) > 0.3, 'the driver must steer to remain on the curved road');
});

test('challenge keeps the easy smooth tail swing and does not clamp the road edge', () => {
  const driving = { ...initialState(), speed: 15 };
  for (let i = 0; i < 45; i++)
    stepDriving(driving, { ...throttle, steer: 1 }, settings, 1 / 120, 0, 1, 'challenge');
  assert.ok(driving.slide < 0 && driving.driftAmount > 0.1);
  const slide = driving.slide;
  stepDriving(driving, { ...throttle, steer: -1 }, settings, 1 / 120, 0, 1, 'challenge');
  assert.ok(Math.abs(driving.slide - slide) < 0.04, 'countersteering must not snap the tail');
  for (let i = 0; i < 240; i++)
    stepDriving(driving, { ...throttle, steer: 1 }, settings, 1 / 120, 0, 1, 'challenge');
  assert.ok(Math.abs(driving.offset) > settings.roadWidth / 2, 'there is no invisible edge rail');
});

test('traffic is deterministic, staggered, bounded, and never starts on the player', () => {
  const a = fixture(),
    b = fixture();
  assert.deepEqual(a.challenge, b.challenge);
  assert.equal(a.challenge.traffic.length, challengeDefaults.trafficCount);
  assert.deepEqual(new Set(a.challenge.traffic.map((car) => car.lane)), new Set([-1, 1]));
  for (const traffic of a.challenge.traffic) {
    assert.ok(traffic.distance - a.driving.distance >= challengeDefaults.firstTrafficDistance);
    assert.ok(
      Math.abs(traffic.offset) + cars[traffic.car].mirrorWidth / 2 < settings.roadWidth / 2,
    );
    assert.ok(traffic.speed < settings.maxSpeed / 3.6);
  }
  const sorted = a.challenge.traffic.map((car) => car.distance).sort((x, y) => x - y);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i] - sorted[i - 1] >= 70);
  assert.notDeepEqual(
    a.challenge.traffic,
    initialChallenge({ ...settings, seed: 712 }, initialState()).traffic,
  );
  for (let i = 0; i < 12000; i++) stepChallenge(a.challenge, a.driving, neutral, settings, 0.05);
  assert.equal(a.challenge.traffic.length, challengeDefaults.trafficCount);
  assert.ok(
    a.challenge.nextTrafficId > challengeDefaults.trafficCount,
    'old traffic should recycle',
  );
  assert.ok(a.challenge.nextTrafficId < 200, 'recycling must not thrash on an idle frame');
  assert.ok(a.challenge.traffic.some((traffic) => traffic.distance - a.driving.distance < 600));
  assert.equal(a.challenge.lives, 3);
  assert.equal(a.challenge.overtakes, 0);
});

test('whole-car road departures cost one life, visibly coast outward, and safely respawn', () => {
  const { driving, challenge } = fixture(noTraffic);
  driving.speed = 12;
  driving.slide = -0.4;
  driving.offset = bodyRoadLimits(driving, 'astra', settings).right + noTraffic.offRoadRange + 0.25;
  stepChallenge(challenge, driving, neutral, settings, 1 / 120, noTraffic);
  assert.equal(challenge.phase, 'falling');
  assert.equal(challenge.lastIncident, 'bounds');
  assert.equal(challenge.lives, 2);
  const offset = driving.offset;
  for (let i = 0; i < 60; i++)
    stepChallenge(challenge, driving, throttle, settings, 1 / 120, noTraffic);
  assert.equal(challenge.lives, 2, 'one fall must not deduct lives every frame');
  assert.ok(
    driving.offset > offset + 2,
    'the car should coast beyond the shoulder during the fall',
  );
  assert.ok(challenge.recoveryProgress > 0.3 && challenge.recoveryProgress < 0.5);
  for (let i = 0; i < 110; i++)
    stepChallenge(challenge, driving, neutral, settings, 1 / 120, noTraffic);
  assert.equal(challenge.phase, 'racing');
  assert.equal(challenge.lives, 2);
  assert.equal(driving.speed, 0);
  assert.equal(driving.offset, settings.roadWidth / 4);
  assert.equal(driving.headingOffset, 0);
  assert.equal(driving.slide, 0);
  assert.ok(driving.travelled > 0);
});

test('traffic contact consumes one life, pauses traffic during recovery, and clears the respawn area', () => {
  const config = { ...challengeDefaults, trafficCount: 1, graceSeconds: 0 };
  const { driving, challenge } = fixture(config);
  driving.offset = settings.roadWidth / 4;
  const traffic = challenge.traffic[0];
  traffic.distance = driving.distance;
  stepChallenge(challenge, driving, neutral, settings, 1 / 120, config);
  assert.equal(challenge.phase, 'crashed');
  assert.equal(challenge.lives, 2);
  assert.equal(challenge.lastIncident, 'traffic');
  const atImpact = structuredClone(challenge.traffic);
  for (let i = 0; i < 60; i++)
    stepChallenge(challenge, driving, throttle, settings, 1 / 120, config);
  assert.deepEqual(challenge.traffic, atImpact);
  assert.equal(challenge.lives, 2);
  for (let i = 0; i < 110; i++)
    stepChallenge(challenge, driving, neutral, settings, 1 / 120, config);
  assert.equal(challenge.phase, 'racing');
  assert.ok(challenge.traffic.every((car) => Math.abs(car.distance - driving.distance) > 38));
  assert.equal(driving.offset, settings.roadWidth / 4);
});

test('three incidents exhaust three lives, stop at game over, and a new run fully resets', () => {
  const { driving, challenge } = fixture(noTraffic);
  for (let expectedLives = 2; expectedLives >= 0; expectedLives--) {
    driving.offset = 20;
    stepChallenge(challenge, driving, neutral, settings, 1 / 120, noTraffic);
    assert.equal(challenge.lives, expectedLives);
    assert.equal(challenge.phase, 'falling');
    for (let i = 0; i < 170; i++)
      stepChallenge(challenge, driving, neutral, settings, 1 / 120, noTraffic);
  }
  assert.equal(challenge.phase, 'gameover');
  respawnChallenge(challenge, driving, settings, noTraffic);
  assert.equal(challenge.phase, 'gameover', 'only a new run can restore exhausted lives');
  const snapshot = structuredClone({ driving, challenge });
  for (let i = 0; i < 300; i++)
    stepChallenge(challenge, driving, throttle, settings, 1 / 120, noTraffic);
  assert.deepEqual({ driving, challenge }, snapshot);
  const retry = fixture(noTraffic);
  assert.equal(retry.challenge.phase, 'racing');
  assert.equal(retry.challenge.lives, 3);
  assert.equal(retry.challenge.overtakes, 0);
  assert.equal(retry.driving.travelled, 0);
});

test('grace prevents repeated hits without enabling scoring, then normal hazards resume', () => {
  const config = { ...challengeDefaults, graceSeconds: 0.1, trafficCount: 1 };
  const { driving, challenge } = fixture(config);
  driving.offset = 20;
  for (let i = 0; i < 6; i++) stepChallenge(challenge, driving, neutral, settings, 1 / 120, config);
  assert.equal(challenge.lives, 3);
  assert.equal(challenge.phase, 'racing');
  for (let i = 0; i < 12; i++)
    stepChallenge(challenge, driving, neutral, settings, 1 / 120, config);
  assert.equal(challenge.lives, 2);
  assert.equal(challenge.phase, 'falling');
  respawnChallenge(challenge, driving, settings, config);
  assert.equal(challenge.graceRemaining, config.graceSeconds);
  assert.equal(challenge.overtakes, 0);
  assert.equal(challenge.lives, 2);
});

test('a close overtake scores once only after the whole player clears traffic', () => {
  const config = { ...challengeDefaults, trafficCount: 1, graceSeconds: 0 };
  const { driving, challenge } = fixture(config);
  driving.offset =
    settings.roadWidth / 4 - (cars.astra.width + cars[challenge.traffic[0].car].width) / 2 - 0.3;
  driving.speed = settings.maxSpeed / 3.6;
  challenge.traffic[0].distance = driving.distance + 8;
  const traffic = challenge.traffic[0];
  for (let i = 0; i < 200; i++) {
    stepChallenge(challenge, driving, throttle, settings, 1 / 120, config);
    if (driving.distance - cars.astra.length / 2 <= traffic.distance + cars[traffic.car].length / 2)
      assert.equal(challenge.overtakes, 0);
  }
  assert.equal(challenge.phase, 'racing');
  assert.equal(challenge.lives, 3);
  assert.equal(challenge.overtakes, 1);
  assert.equal(traffic.passed, true);
  for (let i = 0; i < 120; i++)
    stepChallenge(challenge, driving, throttle, settings, 1 / 120, config);
  assert.equal(challenge.overtakes, 1);
});

test('already-behind traffic and protected passes cannot award phantom overtakes', () => {
  for (const graceSeconds of [0, 5]) {
    const config = { ...challengeDefaults, trafficCount: 1, graceSeconds };
    const { driving, challenge } = fixture(config);
    driving.offset =
      settings.roadWidth / 4 - (cars.astra.width + cars[challenge.traffic[0].car].width) / 2 - 0.3;
    driving.speed = settings.maxSpeed / 3.6;
    challenge.traffic[0].distance = driving.distance + (graceSeconds ? 4 : -10);
    for (let i = 0; i < 180; i++)
      stepChallenge(challenge, driving, throttle, settings, 1 / 120, config);
    assert.equal(challenge.overtakes, 0);
  }
});

test('right-lane traffic goes downhill, left-lane traffic approaches, with a stable split', () => {
  const { challenge, driving } = fixture();
  driving.offset = settings.roadWidth / 4;
  const before = new Map(challenge.traffic.map((car) => [car.id, car.distance]));
  stepChallenge(challenge, driving, neutral, settings, 1 / 30);
  for (const car of challenge.traffic) {
    assert.equal(Math.sign(car.distance - before.get(car.id)!), car.lane);
    assert.equal(Math.sign(car.offset), car.lane);
    assert.ok(car.speed > 0);
  }
  for (let i = 0; i < 12000; i++) {
    stepChallenge(challenge, driving, neutral, settings, 0.05);
    assert.equal(challenge.traffic.filter((car) => car.lane === -1).length, 3);
    assert.equal(challenge.traffic.filter((car) => car.lane === 1).length, 4);
  }
  assert.equal(challenge.lives, 3);
  assert.equal(challenge.overtakes, 0);
});

test('wide oncoming passes do not score, including while parked', () => {
  for (const moving of [false, true]) {
    const config = { ...challengeDefaults, trafficCount: 1, graceSeconds: 0 };
    const { driving, challenge } = fixture(config);
    driving.offset = settings.roadWidth / 4;
    challenge.traffic[0].lane = -1;
    challenge.traffic[0].offset = -settings.roadWidth / 4;
    challenge.traffic[0].distance = driving.distance + 15;
    const oncoming = challenge.traffic[0];
    for (let i = 0; i < 300; i++)
      stepChallenge(challenge, driving, moving ? throttle : neutral, settings, 1 / 120, config);
    assert.equal(challenge.overtakes, 0);
    assert.equal(oncoming.passed, true);
    assert.equal(challenge.lives, 3);
  }
});

test('oncoming contact consumes exactly one life and then respawns safely on the right', () => {
  const config = { ...challengeDefaults, trafficCount: 2, graceSeconds: 0 };
  const { driving, challenge } = fixture(config);
  const oncoming = challenge.traffic.find((car) => car.lane === -1)!;
  driving.offset = oncoming.offset;
  driving.speed = 25;
  oncoming.distance = driving.distance + 5;
  for (let i = 0; i < 60 && challenge.phase === 'racing'; i++)
    stepChallenge(challenge, driving, throttle, settings, 1 / 120, config);
  assert.equal(challenge.phase, 'crashed');
  assert.equal(challenge.lives, 2);
  for (let i = 0; i < 180; i++)
    stepChallenge(challenge, driving, neutral, settings, 1 / 120, config);
  assert.equal(challenge.lives, 2);
  assert.equal(challenge.phase, 'racing');
  assert.equal(driving.offset, settings.roadWidth / 4);
});

test('swept collision catches a fast crossing, a swinging rear, and excludes clean adjacent passes', () => {
  const traffic = vehicle(35, 0);
  const before = { ...initialState(), distance: 20 };
  const after = { ...initialState(), distance: 50 };
  assert.equal(sweptTrafficCollision(before, after, traffic, 35), true);
  assert.equal(
    sweptTrafficCollision({ ...before, offset: 4 }, { ...after, offset: 4 }, traffic, 35),
    false,
  );
  const beside = { ...initialState(), distance: 35, offset: 2.8, slide: 0 };
  assert.equal(sweptTrafficCollision(beside, beside, traffic, 35), false);
  assert.equal(sweptTrafficCollision(beside, { ...beside, slide: -0.6 }, traffic, 35), true);
});

test('pausing is an exact no-op for driving, traffic, recovery, score, and grace', () => {
  const { driving, challenge } = fixture();
  for (const phase of ['racing', 'falling', 'crashed', 'gameover'] as const) {
    challenge.phase = phase;
    const snapshot = structuredClone({ driving, challenge });
    for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
      stepChallenge(challenge, driving, throttle, settings, dt);
    assert.deepEqual({ driving, challenge }, snapshot);
  }
});

test('narrow-road recovery warnings account for the full rotated footprint of every car', () => {
  for (const car of Object.keys(cars) as (keyof typeof cars)[]) {
    const config = { ...settings, roadWidth: 7, car };
    const driving = { ...initialState(), slide: 0.55 };
    const challenge = initialChallenge(config, driving, noTraffic);
    driving.offset = bodyRoadLimits(driving, car, config).right + 0.01;
    stepChallenge(challenge, driving, { ...neutral, brake: true }, config, 1 / 120, noTraffic);
    assert.equal(challenge.phase, 'racing', `${car} should have a chance to recover`);
    assert.equal(challenge.lives, 3);
    assert.ok(challenge.offRoad.excursion > 0, `${car} must include its actual sideways body`);
    assert.ok(challenge.offRoad.remaining > 3.9);
  }
});
