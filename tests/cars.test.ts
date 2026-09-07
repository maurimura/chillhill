import test from 'node:test';
import assert from 'node:assert/strict';
import { cars, carAxles, carRoadLimit, defaultCar, type CarId } from '../src/config/cars.ts';
import { initialState, stepDriving } from '../src/game/driving.ts';

test('the default is the Argentine Astra hatch with documented factory dimensions', () => {
  assert.equal(defaultCar, 'astra');
  assert.equal(cars.astra.length, 4.199);
  assert.equal(cars.astra.width, 1.709);
  assert.equal(cars.astra.wheelbase, 2.614);
  assert.equal(Object.hasOwn(cars, 'astra-sedan'), false, 'the sedan has been retired');
});

test('both pickers inherit the requested catalog order, with the 206 last', () => {
  assert.deepEqual(Object.keys(cars), [
    'astra',
    'renault-12',
    'testarossa',
    'porsche-911',
    'camaro-ss',
    'mustang-fastback',
    'wagon',
    'peugeot-206',
  ]);
});

test('classic silhouettes retain the documented body dimensions and wheelbases', () => {
  for (const [id, expected] of [
    ['renault-12', [4.34, 1.636, 1.434, 2.441]],
    ['porsche-911', [4.163, 1.61, 1.32, 2.211]],
    ['testarossa', [4.485, 1.976, 1.13, 2.55]],
    ['peugeot-206', [3.835, 1.652, 1.432, 2.442]],
    ['camaro-ss', [4.7244, 1.8796, 1.29794, 2.7432]],
    ['mustang-fastback', [4.66344, 1.80086, 1.31572, 2.7432]],
  ] as const) {
    const spec = cars[id];
    assert.deepEqual([spec.length, spec.width, spec.height, spec.wheelbase], expected);
  }
  assert.equal(cars['renault-12'].frontOverhang, 0.859);
  assert.equal(cars['renault-12'].wheelStyle, 'steel');
  assert.equal(cars['porsche-911'].wheelStyle, 'fuchs');
  assert.equal(cars['camaro-ss'].frontOverhang, 0.94234);
  assert.equal(cars['camaro-ss'].wheelStyle, 'rally');
  assert.equal(cars['mustang-fastback'].wheelStyle, 'styled-steel');
});

test('Testarossa uses the period staggered 16-inch tire dimensions', () => {
  const spec = cars.testarossa;
  assert.ok(Math.abs(spec.tireRadius - ((16 * 0.0254) / 2 + 0.225 * 0.5)) < 1e-10);
  assert.ok(Math.abs(spec.rearTireRadius - ((16 * 0.0254) / 2 + 0.255 * 0.5)) < 1e-10);
  assert.ok(spec.rearTireWidth > spec.tireWidth);
  assert.ok(spec.rearTrack > spec.frontTrack);
});

for (const id of Object.keys(cars) as CarId[]) {
  test(`${id}: axles and tire sizes fit the car`, () => {
    const spec = cars[id],
      axles = carAxles(spec);
    assert.ok(Math.abs(axles.front + axles.rear - spec.wheelbase) < 1e-12);
    assert.ok(axles.front > 0 && axles.rear > 0);
    assert.ok(axles.front + spec.tireRadius < spec.length / 2);
    assert.ok(axles.rear + spec.tireRadius < spec.length / 2);
    assert.ok(spec.mirrorWidth >= spec.width);
  });
  test(`${id}: road clearance includes the tail swinging around its front axle`, () => {
    const spec = cars[id],
      axles = carAxles(spec);
    for (const width of [7, 10, 16])
      for (const yaw of [-0.8, -0.4, 0, 0.4, 0.8]) {
        const limit = carRoadLimit(width, yaw, id);
        assert.ok(limit >= 0);
        for (const x of [-spec.mirrorWidth / 2, spec.mirrorWidth / 2])
          for (const z of [-spec.length / 2, spec.length / 2]) {
            const rotatedX = x * Math.cos(yaw) + (z + axles.front) * Math.sin(yaw);
            assert.ok(limit + Math.abs(rotatedX) <= width / 2 + 1e-10);
          }
      }
  });
  test(`${id}: drifting stays forward and the brake still holds completely`, () => {
    const settings = { car: id, cruiseSpeed: 36, maxSpeed: 80, drift: 0.8, roadWidth: 7 };
    const state = { ...initialState(), speed: 10 };
    for (let i = 0; i < 300; i++) {
      stepDriving(state, { steer: 1, brake: false, accelerate: false }, settings, 1 / 60);
      assert.ok(Math.abs(state.offset) <= carRoadLimit(7, state.slide, id) + 1e-10);
    }
    assert.ok(state.distance > 65 && state.driftAmount > 0.1);
    for (let i = 0; i < 300; i++)
      stepDriving(state, { steer: 1, brake: true, accelerate: true }, settings, 1 / 60);
    const stopped = { ...state };
    for (let i = 0; i < 120; i++)
      stepDriving(state, { steer: -1, brake: true, accelerate: false }, settings, 1 / 60);
    assert.equal(state.speed, 0);
    assert.equal(state.distance, stopped.distance);
    assert.equal(state.offset, stopped.offset);
    assert.equal(state.slide, stopped.slide);
  });
}
