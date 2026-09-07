import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cars, carAxles, type CarId } from '../src/config/cars.ts';
import {
  bodyOutline,
  collisionFootprint,
  sweptTrafficCollision,
  trafficCollisionPose,
} from '../src/game/collision.ts';
import { initialState } from '../src/game/driving.ts';
import { roadAt } from '../src/game/route.ts';

for (const car of Object.keys(cars) as CarId[]) {
  test(`${car}: close body passes are safe; actual side and bumper overlaps collide`, () => {
    const player = { ...initialState(), distance: 30 };
    const traffic = { car, offset: cars[car].width + 0.025, distance: 30 };
    assert.equal(
      sweptTrafficCollision(player, player, traffic, 30, car),
      false,
      'a 2.5 cm body gap is safe even inside the mirror envelope',
    );
    assert.equal(
      sweptTrafficCollision(
        player,
        player,
        { ...traffic, offset: cars[car].width - 0.025 },
        30,
        car,
      ),
      true,
    );
    const front = { car, offset: 0, distance: 30 + cars[car].length + 0.025 };
    assert.equal(sweptTrafficCollision(player, player, front, front.distance, car), false);
    front.distance -= 0.05;
    assert.equal(sweptTrafficCollision(player, player, front, front.distance, car), true);
  });
}

test('empty corners of a drifting car’s old axis-aligned box are not crashes', () => {
  const player = { ...initialState(), distance: 35, slide: 0.6 };
  for (const distance of [30.94, 39.48]) {
    const traffic = { car: 'astra' as const, distance, offset: 3.57 };
    assert.equal(sweptTrafficCollision(player, player, traffic, distance), false);
  }
  const traffic = { car: 'astra' as const, distance: 35, offset: 0 };
  const beside = { ...player, offset: 2.8, slide: 0 };
  assert.equal(
    sweptTrafficCollision(beside, { ...beside, slide: -0.6 }, traffic, 35),
    true,
    'the real tail still collides as it swings',
  );
});

test('oncoming footprints match the reversed renderer on curves and steep hills for every car', () => {
  const settings = { seed: 72, grade: 0.16, curves: 1.7, roadWidth: 10, terrainHeight: 1 };
  for (const car of Object.keys(cars) as (keyof typeof cars)[])
    for (const distance of [20, 180.001, 700, 10000000])
      for (const lane of [-1, 1] as const) {
        const pose = trafficCollisionPose({ distance, offset: lane * 2.5, lane });
        const road = roadAt(distance, settings);
        const model = new THREE.Group();
        model.position.set(road.x + pose.offset, road.y, -distance);
        model.rotation.set(
          lane * Math.atan(road.dy),
          -road.heading + (lane === -1 ? Math.PI : 0),
          0,
          'YXZ',
        );
        model.updateMatrixWorld(true);
        const footprint = collisionFootprint(pose, car, settings);
        for (const [i, point] of bodyOutline(car).entries()) {
          const actual = new THREE.Vector3(
            point.x,
            Math.min(0.6, cars[car].height * 0.4),
            point.z,
          ).applyMatrix4(model.matrixWorld);
          assert.ok(Math.abs(actual.x - footprint[i].x) < 1e-8);
          assert.ok(Math.abs(actual.z - footprint[i].z) < 1e-8);
        }
      }
});

test('high closing-speed head-on sweeps cannot tunnel but clean opposite-lane passes remain safe', () => {
  const before = { ...initialState(), distance: 20, offset: -2.5 };
  const after = { ...before, distance: 50 };
  const oncoming = { car: 'astra' as const, distance: 20, offset: -2.5, lane: -1 as const };
  assert.equal(sweptTrafficCollision(before, after, oncoming, 50), true);
  assert.equal(
    sweptTrafficCollision({ ...before, offset: 2.5 }, { ...after, offset: 2.5 }, oncoming, 50),
    false,
  );
});

test('continuous body sweep catches high-speed crossings, but not close parallel travel', () => {
  const player = { ...initialState(), distance: 20 };
  const after = { ...player, distance: 80 };
  const traffic = { car: 'astra' as const, distance: 42, offset: 0 };
  assert.equal(sweptTrafficCollision(player, after, traffic, 40), true);
  traffic.offset = cars.astra.width + 0.03;
  assert.equal(sweptTrafficCollision(player, after, traffic, 40), false);
  traffic.offset = 0;
  assert.equal(
    sweptTrafficCollision(player, after, { ...traffic, distance: 100 }, 40),
    false,
    'equal-speed cars never occupy the swept path at the same time',
  );
});

test('footprints exactly follow the renderer’s road/grade/front-axle transform for every model', () => {
  const settings = { seed: 72, grade: 0.16, curves: 1.7, roadWidth: 10, terrainHeight: 1 };
  for (const car of Object.keys(cars) as CarId[])
    for (const distance of [20, 180.001, 700, 10000000])
      for (const slide of [-0.65, 0, 0.65]) {
        const state = { ...initialState(), distance, offset: 2, slide };
        const road = roadAt(distance, settings);
        const root = new THREE.Group(),
          pivot = new THREE.Group(),
          model = new THREE.Group();
        root.position.set(road.x + state.offset, road.y, -distance);
        root.rotation.set(Math.atan(road.dy), -road.heading, 0, 'YXZ');
        pivot.position.z = -carAxles(cars[car]).front;
        pivot.rotation.y = slide;
        model.position.z = -pivot.position.z;
        root.add(pivot);
        pivot.add(model);
        root.updateMatrixWorld(true);
        const footprint = collisionFootprint(state, car, settings);
        for (const [i, point] of bodyOutline(car).entries()) {
          const actual = new THREE.Vector3(
            point.x,
            Math.min(0.6, cars[car].height * 0.4),
            point.z,
          ).applyMatrix4(model.matrixWorld);
          assert.ok(Math.abs(actual.x - footprint[i].x) < 1e-8);
          assert.ok(Math.abs(actual.z - footprint[i].z) < 1e-8);
        }
      }
});

test('world-space close passes stay accurate on curves, steep grades and distant chunks', () => {
  const settings = { seed: 72, grade: 0.16, curves: 1.7, roadWidth: 10, terrainHeight: 1 };
  for (const distance of [20, 180.001, 700, 10000000]) {
    const player = { ...initialState(), distance };
    const width = cars.astra.width / Math.cos(roadAt(distance, settings).heading);
    const traffic = { car: 'astra' as const, distance, offset: width + 0.03 };
    assert.equal(
      sweptTrafficCollision(player, player, traffic, distance, 'astra', settings),
      false,
    );
    traffic.offset = width - 0.03;
    assert.equal(sweptTrafficCollision(player, player, traffic, distance, 'astra', settings), true);
  }
});
