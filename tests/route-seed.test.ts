import test from 'node:test';
import assert from 'node:assert/strict';
import { freshRouteSeed } from '../src/config/route-seed.ts';
import { roadAt } from '../src/game/route.ts';

function memory(initial = '[]') {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
}
test('fresh routes avoid the last drive and the recent refresh history, even on RNG collisions', () => {
  const storage = memory();
  const seeds = Array.from({ length: 64 }, () => freshRouteSeed(42, storage, () => 0));
  assert.equal(new Set(seeds).size, 64);
  assert.ok(!seeds.includes(42));
  assert.equal(JSON.parse(storage.getItem()).length, 64);
  freshRouteSeed(42, storage, () => 0);
  assert.equal(JSON.parse(storage.getItem()).length, 64, 'history stays bounded');
});
test('route seeds remain valid with corrupt history, blocked storage and boundary randomness', () => {
  const blocked = {
    getItem: () => {
      throw Error('blocked');
    },
    setItem: () => {
      throw Error('blocked');
    },
  };
  for (const storage of [memory('oops'), memory('{}'), memory('[null,"12",-2,100000]'), blocked]) {
    for (const value of [0, 1, -1, NaN]) {
      const seed = freshRouteSeed(1, storage, () => value);
      assert.ok(Number.isInteger(seed) && seed > 1 && seed <= 99999);
    }
  }
  assert.equal(
    freshRouteSeed(99999, memory(), () => 1),
    1,
    'candidate wraps safely',
  );
});
test('a new seed changes the actual road, while one drive remains deterministic at chunk boundaries', () => {
  const settings = { seed: 42, curves: 1, grade: 0.07, roadWidth: 10, terrainHeight: 1 };
  const seed = freshRouteSeed(settings.seed, memory(), () => 0.65);
  const samples = [20, 180, 360, 620, 1240, 10000000];
  const original = samples.map((s) => roadAt(s, settings));
  const fresh = samples.map((s) => roadAt(s, { ...settings, seed }));
  assert.notDeepEqual(fresh, original);
  assert.deepEqual(
    samples.map((s) => roadAt(s, { ...settings, seed })),
    fresh,
  );
  assert.notDeepEqual(
    fresh.map((p) => p.dx),
    original.map((p) => p.dx),
    'not merely a scenery or sideways-position change',
  );
});
