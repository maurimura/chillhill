import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWorld, worldDefaults } from '../src/config/world.ts';
import {
  sceneKeys,
  sceneName,
  readScene,
  sceneSnapshot,
  serializeScene,
} from '../src/config/scenes.ts';
import { roadAt, roadElevation, seaElevation, terrainAt } from '../src/game/route.ts';
import type { Settings } from '../src/config.ts';

const settings = {
  ...worldDefaults,
  style: 'coastal',
  landscape: 'coast',
  seed: 42,
  curves: 0.7,
  roadWidth: 10,
  grade: 0.06,
  terrainHeight: 0.7,
  treeDensity: 0.55,
  roundness: 0.75,
  fog: 0.25,
  car: 'astra',
  paint: { astra: '#123456', 'astra-sedan': null, wagon: null },
  cruiseSpeed: 36,
  maxSpeed: 80,
  drift: 0.55,
  smoke: 0.65,
  pixelRatio: 1,
} satisfies Settings;

test('old saves inherit independent world ingredients and invalid choices cannot overwrite them', () => {
  assert.deepEqual(normalizeWorld({}, worldDefaults), worldDefaults);
  for (const value of ['toString', '__proto__', 'ocean', 3, null, {}])
    assert.equal(
      normalizeWorld({ landscape: value } as never, worldDefaults).landscape,
      'highlands',
    );
  assert.equal(
    normalizeWorld(Object.create({ landscape: 'coast' }), worldDefaults).landscape,
    'highlands',
  );
  assert.equal(normalizeWorld({ weatherIntensity: Infinity, wind: NaN }, worldDefaults).wind, 0.25);
  assert.equal(
    normalizeWorld({ weatherIntensity: -2, wind: 3 }, worldDefaults).weatherIntensity,
    0,
  );
  assert.equal(normalizeWorld({ wind: '0.6' } as never, worldDefaults).wind, 0.6);
});

test('weather, season, landscape, and road ingredients change independently', () => {
  const mix = normalizeWorld(
    { landscape: 'coast', season: 'winter', roadSurface: 'gravel' },
    worldDefaults,
  );
  assert.deepEqual(normalizeWorld({ weather: 'rain' }, mix), { ...mix, weather: 'rain' });
  assert.equal(normalizeWorld({ season: 'summer' }, mix).roadSurface, 'gravel');
});

test('the infinite coastal shore stays continuous and safely below the road at all grades', () => {
  for (const grade of [0.03, 0.06, 0.16])
    for (const width of [7, 10, 16])
      for (const height of [0.25, 2]) {
        const config = { ...settings, grade, roadWidth: width, terrainHeight: height };
        for (const s of [-900, 0, 180, 360, 10000000, 10000180]) {
          assert.ok(Math.abs(roadElevation(s, config) - seaElevation(s, config) - 18) < 1e-8);
          for (const offset of [-width / 2, 0, width / 2])
            assert.ok(
              Math.abs(terrainAt(s, offset, config) - roadElevation(s, config) + 0.08) < 1e-8,
            );
          assert.ok(terrainAt(s, width / 2 + 60, config) < seaElevation(s, config));
          for (const offset of [0, width / 2 + 10, width / 2 + 41.3, 400])
            assert.ok(
              Math.abs(
                terrainAt(s + 0.0001, offset, config) - terrainAt(s - 0.0001, offset, config),
              ) < 0.01,
            );
          assert.ok(roadAt(s, config).dy < 0);
        }
      }
});

test('scene snapshots and files never carry car, paint, handling, or rendering settings', () => {
  const snapshot = sceneSnapshot(settings);
  assert.deepEqual(Object.keys(snapshot), sceneKeys);
  for (const key of ['car', 'paint', 'maxSpeed', 'cruiseSpeed', 'drift', 'smoke', 'pixelRatio'])
    assert.equal(Object.hasOwn(snapshot, key), false);
  const text = serializeScene('My coast', settings);
  assert.deepEqual(readScene(text), { name: 'My coast', settings: snapshot });
  const file = JSON.parse(text);
  assert.equal(file.format, 'chillhill.scene');
  file.settings.car = 'wagon';
  file.settings.maxSpeed = 110;
  assert.deepEqual(readScene(JSON.stringify(file)).settings, snapshot);
  assert.equal(sceneName(' \nMy coast\u0000 '), 'My coast');
  assert.equal(sceneName('a'.repeat(100)).length, 48);
});

test('earlier branded scene exports remain importable after the rename', () => {
  const file = JSON.parse(serializeScene('My coast', settings));
  file.format = 'chill-the-hill.scene';
  assert.deepEqual(readScene(JSON.stringify(file)), {
    name: 'My coast',
    settings: sceneSnapshot(settings),
  });
});

test('scene import rejects invalid formats, choices, numbers, and oversized files', () => {
  for (const text of ['', '[]', '{}', 'null', ' '.repeat(65537)])
    assert.throws(() => readScene(text));
  for (const patch of [
    { weather: 'hurricane' },
    { landscape: 'toString' },
    { style: '__proto__' },
    { fog: 'bad' },
    { roadSurface: {} },
  ])
    assert.throws(() =>
      readScene(JSON.stringify({ format: 'chillhill.scene', version: 1, settings: patch })),
    );
  assert.throws(() =>
    readScene(
      JSON.stringify({
        format: 'chillhill.scene',
        version: 2,
        settings: sceneSnapshot(settings),
      }),
    ),
  );
});
