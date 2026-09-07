import test from 'node:test';
import assert from 'node:assert/strict';
import { cars, type CarId } from '../src/config/cars.ts';
import { challengeDefaults } from '../src/config/challenge.ts';
import { initialChallenge, stepChallenge, respawnChallenge } from '../src/game/challenge.ts';
import { initialState } from '../src/game/driving.ts';
import { collisionFootprint, sweptTrafficEncounter } from '../src/game/collision.ts';
import { roadAt } from '../src/game/route.ts';

const settings = {
  cruiseSpeed: 36,
  maxSpeed: 80,
  drift: 0.55,
  roadWidth: 10,
  car: 'astra' as CarId,
  curves: 0,
  grade: 0,
  terrainHeight: 1,
  seed: 42,
};
const throttle = { steer: 0, accelerate: true, brake: false };
const config = { ...challengeDefaults, trafficCount: 1, graceSeconds: 0 };

function fixture(lane: -1 | 1, gap = 0.3, car: CarId = 'astra', other: CarId = 'astra') {
  const world = { ...settings, car };
  const trafficOffset = (lane * settings.roadWidth) / 4;
  const offset = trafficOffset - lane * ((cars[car].width + cars[other].width) / 2 + gap);
  const driving = { ...initialState(), speed: settings.maxSpeed / 3.6, offset };
  const challenge = initialChallenge(world, driving, config);
  const vehicle = challenge.traffic[0];
  Object.assign(vehicle, {
    distance: driving.distance + 10,
    offset: trafficOffset,
    lane,
    car: other,
  });
  const step = (dt = 1 / 120) => stepChallenge(challenge, driving, throttle, world, dt, config);
  const finish = (dt = 1 / 120) => {
    for (let i = 0; i < 6 / dt && !vehicle.passed && challenge.phase === 'racing'; i++) step(dt);
  };
  const qualify = () => {
    for (
      let i = 0;
      i < 720 && !vehicle.nearMissClose && !vehicle.passed && challenge.phase === 'racing';
      i++
    )
      step();
    assert.equal(vehicle.nearMissClose, true, 'fixture must reach a genuine close overlap');
    assert.equal(challenge.overtakes, 0, 'nothing awarded while alongside');
  };
  return { world, driving, challenge, vehicle, step, finish, qualify };
}

for (const lane of [1, -1] as const) {
  test(`${lane === 1 ? 'same-direction' : 'oncoming'}: only close body passes earn one point, at every simulation rate`, () => {
    for (const hz of [20, 30, 60, 120]) {
      for (const gap of [0.025, 0.3, 0.64, 0.66, 2]) {
        const game = fixture(lane, gap);
        game.finish(1 / hz);
        assert.equal(game.challenge.lives, 3, `${gap}m at ${hz}Hz is collision-free`);
        assert.equal(game.vehicle.passed, true);
        assert.equal(
          game.challenge.overtakes,
          gap <= config.nearMissDistance ? 1 : 0,
          `${gap}m at ${hz}Hz`,
        );
        for (let i = 0; i < 2 * hz; i++) game.step(1 / hz);
        assert.equal(
          game.challenge.overtakes,
          gap <= config.nearMissDistance ? 1 : 0,
          'one award per vehicle',
        );
      }
    }
  });

  test(`${lane}: body-sized proximity works for every player and traffic model`, () => {
    for (const car of Object.keys(cars) as CarId[]) {
      for (const other of Object.keys(cars) as CarId[]) {
        for (const gap of [0.1, 0.8]) {
          const game = fixture(lane, gap, car, other);
          game.finish(1 / 30);
          assert.equal(game.challenge.lives, 3, `${car}/${other}`);
          assert.equal(
            game.challenge.overtakes,
            gap < config.nearMissDistance ? 1 : 0,
            `${car}/${other}: ${gap}m`,
          );
        }
      }
    }
  });

  test(`${lane}: a close encounter is pending until the bodies clear, and pause freezes it`, () => {
    const game = fixture(lane);
    game.qualify();
    const snapshot = structuredClone({ driving: game.driving, challenge: game.challenge });
    for (const dt of [0, -1, NaN, Infinity]) game.step(dt);
    assert.deepEqual({ driving: game.driving, challenge: game.challenge }, snapshot);
    game.finish();
    assert.equal(game.challenge.overtakes, 1);
  });

  test(`${lane}: contact after a close approach cancels the score and costs one life`, () => {
    const game = fixture(lane);
    game.qualify();
    game.driving.offset = game.vehicle.offset;
    game.step();
    assert.equal(game.challenge.phase, 'crashed');
    assert.equal(game.challenge.lives, 2);
    assert.equal(game.challenge.overtakes, 0);
    assert.equal(game.vehicle.nearMissClose, false);
    respawnChallenge(game.challenge, game.driving, game.world, config);
    assert.equal(game.challenge.overtakes, 0);
    assert.ok(game.challenge.traffic.every((v) => !v.nearMissClose));
  });

  test(`${lane}: going off-road before clearing cancels even a previously qualified pass`, () => {
    const game = fixture(lane);
    game.qualify();
    const offset = game.driving.offset;
    game.driving.offset = 4.5;
    game.step();
    assert.equal(game.challenge.offRoad.active, true);
    game.driving.offset = offset;
    game.finish();
    assert.equal(game.challenge.lives, 3);
    assert.equal(game.vehicle.passed, true);
    assert.equal(game.challenge.overtakes, 0);
  });

  test(`${lane}: protected overlaps cannot score even if grace ends just before clearing`, () => {
    const game = fixture(lane);
    game.challenge.graceRemaining = 10;
    for (let i = 0; i < 720 && !game.vehicle.nearMissBlocked; i++) game.step();
    assert.equal(game.vehicle.nearMissBlocked, true);
    game.challenge.graceRemaining = 0;
    game.finish();
    assert.equal(game.challenge.overtakes, 0);
    assert.equal(game.vehicle.passed, true);
    assert.equal(game.challenge.lives, 3);
  });
}

test('parked or crawling players cannot farm close oncoming cars', () => {
  for (const speed of [0, 2]) {
    const game = fixture(-1);
    game.driving.speed = speed;
    for (let i = 0; i < 720 && !game.vehicle.passed; i++)
      stepChallenge(
        game.challenge,
        game.driving,
        { ...throttle, accelerate: false },
        game.world,
        1 / 120,
        config,
      );
    assert.equal(game.challenge.lives, 3);
    assert.equal(game.vehicle.passed, true);
    assert.equal(game.challenge.overtakes, 0);
  }
});

test('clearing one car and hitting a different car in the same step awards nothing', () => {
  const game = fixture(1);
  // A narrower two-way road allows a genuine clean right-side encounter
  // while an oncoming car clips the player's other side.
  game.world.roadWidth = 7;
  game.driving.offset -= (settings.roadWidth - game.world.roadWidth) / 4;
  game.qualify();
  game.vehicle.distance = game.driving.distance - cars.astra.length + 0.02;
  game.challenge.traffic.push({
    ...game.vehicle,
    id: 99,
    distance: game.driving.distance,
    lane: -1,
    offset: -game.world.roadWidth / 4,
    seenAhead: true,
    nearMissClose: false,
  });
  game.step();
  assert.equal(game.vehicle.passed, true, 'the first near miss would have completed');
  assert.equal(game.challenge.lastIncident, 'traffic');
  assert.equal(game.challenge.lives, 2);
  assert.equal(game.challenge.overtakes, 0, 'the second collision takes priority');
});

test('an outboard close pass also scores when the whole car stays on the asphalt', () => {
  const game = fixture(1);
  game.world.roadWidth = 14;
  game.driving.offset = game.world.roadWidth / 4 + cars.astra.width + 0.3;
  game.finish();
  assert.equal(game.challenge.lives, 3);
  assert.equal(game.challenge.offRoad.exposure, 0);
  assert.equal(game.challenge.overtakes, 1);
});

test('scored traffic does not award again after another approach; new instances start fresh', () => {
  const game = fixture(-1);
  game.finish();
  assert.equal(game.challenge.overtakes, 1);
  game.driving.distance = game.vehicle.distance - 10;
  for (let i = 0; i < 120; i++) game.step();
  assert.equal(game.challenge.overtakes, 1, 'no repeat points for the same car');
  for (let i = 0; i < 240; i++) game.step();
  assert.equal(game.challenge.traffic.length, 1, 'the pool remains bounded');
  assert.ok(!game.challenge.traffic.includes(game.vehicle), 'old encounter state is recycled');
  assert.ok(game.challenge.traffic.every((car) => !car.nearMissClose && !car.nearMissBlocked));
});

test('near-miss threshold and minimum driving speed are configurable', () => {
  const game = fixture(-1, 0.8);
  const tuning = { ...config, nearMissDistance: 0.9, nearMissMinSpeed: 100 };
  for (let i = 0; i < 720 && !game.vehicle.passed; i++)
    stepChallenge(game.challenge, game.driving, throttle, game.world, 1 / 120, tuning);
  assert.equal(game.challenge.overtakes, 0);
  const closer = fixture(-1, 0.8);
  for (let i = 0; i < 720 && !closer.vehicle.passed; i++)
    stepChallenge(closer.challenge, closer.driving, throttle, closer.world, 1 / 120, {
      ...tuning,
      nearMissMinSpeed: 15,
    });
  assert.equal(closer.challenge.overtakes, 1);
});

test('close tailgating alone never qualifies, even if the subsequent pass is wide', () => {
  const player = { ...initialState(), distance: 30 };
  const front = { car: 'astra' as const, offset: 0, distance: 30 + cars.astra.length + 0.1 };
  const encounter = sweptTrafficEncounter(
    player,
    player,
    front,
    front.distance,
    'astra',
    settings,
    config.nearMissDistance,
  );
  assert.equal(encounter.collided, false);
  assert.equal(encounter.approached, true);
  assert.equal(encounter.alongside, false);
  assert.equal(encounter.close, false);
  const game = fixture(1, 2);
  game.finish();
  assert.equal(game.challenge.overtakes, 0);
});

test('proximity follows actual yawed bodies on steep bends and very distant road chunks', () => {
  const world = { ...settings, curves: 1.7, grade: 0.16, seed: 72 };
  for (const distance of [20, 180.001, 700, 10000000]) {
    for (const slide of [-0.6, 0, 0.6]) {
      const player = { ...initialState(), distance, slide };
      const heading = roadAt(distance, world).heading;
      const lateral = (p: { x: number; z: number }) =>
        p.x * Math.cos(heading) + p.z * Math.sin(heading);
      const right = Math.max(...collisionFootprint(player, 'astra', world).map(lateral));
      const traffic = { car: 'astra' as const, distance, offset: 0 };
      const left = Math.min(
        ...collisionFootprint({ ...player, slide: 0 }, 'astra', world).map(lateral),
      );
      // A visible side gap is along the normal; route offsets are world-X.
      traffic.offset = (right - left + 0.3) / Math.cos(heading);
      // Sweep the pass: on a bend, equal route distance does not align the
      // rotated rear corner with the other car's flank.
      const before = { ...player, distance: distance - 8 };
      const after = { ...player, distance: distance + 8 };
      const close = sweptTrafficEncounter(
        before,
        after,
        traffic,
        distance,
        'astra',
        world,
        config.nearMissDistance,
      );
      assert.equal(close.collided, false, `${distance}/${slide}`);
      assert.equal(close.close, true, `${distance}/${slide}`);
      traffic.offset += 1 / Math.cos(heading);
      assert.equal(
        sweptTrafficEncounter(
          before,
          after,
          traffic,
          distance,
          'astra',
          world,
          config.nearMissDistance,
        ).close,
        false,
      );
    }
  }
});

test('fast oncoming sweeps detect a near miss without tunnelling, but contact still wins', () => {
  const before = { ...initialState(), distance: 20 };
  const after = { ...before, distance: 35 };
  const other = {
    car: 'astra' as const,
    distance: 20,
    offset: cars.astra.width + 0.3,
    lane: -1 as const,
  };
  const result = sweptTrafficEncounter(
    before,
    after,
    other,
    35,
    'astra',
    settings,
    config.nearMissDistance,
  );
  assert.deepEqual(result, {
    collided: false,
    approached: true,
    cleared: true,
    alongside: true,
    close: true,
  });
  other.offset = cars.astra.width - 0.05;
  assert.equal(
    sweptTrafficEncounter(before, after, other, 35, 'astra', settings, config.nearMissDistance)
      .collided,
    true,
  );
});
