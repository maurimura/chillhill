import test from 'node:test';
import assert from 'node:assert/strict';
import { SeededSpline } from '../src/game/route-spline.ts';
import { roadAt, roadElevation, roadSlopeBound, routeChunkLength } from '../src/game/route.ts';

const settings = { seed: 42, curves: 1, grade: 0.09, roadWidth: 10, terrainHeight: 1 };

test('random spline pieces join with continuous position, tangent and curvature', () => {
  const spline = new SeededSpline(90, 712);
  for (const seed of [1, 42, 99999])
    for (const index of [-100, -1, 0, 1, 2, 63, 64, 10000, 1000000])
      for (const derivative of [0, 1, 2] as const) {
        const left = spline.at(index * 90 - 1e-5, seed, derivative);
        const right = spline.at(index * 90 + 1e-5, seed, derivative);
        assert.ok(Math.abs(left - right) < 1e-6);
      }
});

test('spline values and derivatives obey the analytic road-clearance bounds', () => {
  const spline = new SeededSpline(90, 712);
  for (let seed = 1; seed <= 64; seed++)
    for (let s = -180; s < 9000; s += 11.7) {
      assert.ok(Math.abs(spline.at(s, seed)) <= 1);
      assert.ok(Math.abs(spline.at(s, seed, 1)) <= 2 / 90);
      assert.ok(Math.abs(spline.at(s, seed, 2)) <= 4 / (90 * 90));
    }
});

test('eviction, different seeds and out-of-order chunk generation cannot change a route', () => {
  const spline = new SeededSpline(90, 712);
  const samples = [-200, 0, 20, 180, 777, 25000, 10000000];
  const before = samples.map((s) => [0, 1, 2].map((d) => spline.at(s, 42, d as 0 | 1 | 2)));
  for (let i = 0; i < 10000; i++) spline.at(i * 90, i);
  assert.deepEqual(
    [...samples]
      .reverse()
      .map((s) => [0, 1, 2].map((d) => spline.at(s, 42, d as 0 | 1 | 2)))
      .reverse(),
    before,
  );
  assert.equal(Reflect.get(spline, 'cache').length, 64, 'No endless history of visited pieces');
  const independent = new SeededSpline(90, 712);
  assert.deepEqual(
    samples.map((s) => independent.at(s, 42)),
    before.map((row) => row[0]),
  );
});

test('successive rendered chunks have distinct bend profiles, not a recycled translated section', () => {
  for (const seed of [1, 42, 99999]) {
    const profiles = new Set<string>();
    let left = 0,
      right = 0,
      gentle = 0;
    for (let chunk = 0; chunk < 256; chunk++) {
      const profile = [];
      for (let offset = 0; offset < routeChunkLength; offset += 15) {
        const road = roadAt(chunk * routeChunkLength + offset, { ...settings, seed });
        // Derivatives exclude a mere sideways/downhill translation of one mesh.
        profile.push([road.dx, road.curvature, road.dy].map((n) => n.toFixed(7)));
        if (road.curvature > 0.001) left++;
        if (road.curvature < -0.001) right++;
        if (Math.abs(road.curvature) < 0.0003) gentle++;
      }
      const signature = JSON.stringify(profile);
      assert.ok(!profiles.has(signature), `Repeated road in seed ${seed}, chunk ${chunk}`);
      profiles.add(signature);
    }
    assert.ok(left > 100 && right > 100 && gentle > 100, 'Varied turns and gentle stretches');
  }
});

test('seeds sharing the old wave phase now change initial heading, curvature and slope', () => {
  const roads = [42, 59, 76, 93].map((seed) => roadAt(0, { ...settings, seed }));
  for (const key of ['dx', 'curvature', 'dy'] as const)
    assert.equal(new Set(roads.map((road) => road[key])).size, roads.length);
});

test('physics derivatives agree with the actual road and all spline joins', () => {
  const epsilon = 0.001;
  for (const s of [-180, -90, 0, 20, 90, 180, 360, 630, 1260, 10000000]) {
    const before = roadAt(s - epsilon, settings),
      current = roadAt(s, settings),
      after = roadAt(s + epsilon, settings);
    assert.ok(Math.abs((after.x - before.x) / (2 * epsilon) - current.dx) < 1e-6);
    assert.ok(Math.abs((after.y - before.y) / (2 * epsilon) - current.dy) < 1e-6);
    const ddx = (after.dx - before.dx) / (2 * epsilon);
    assert.ok(Math.abs(ddx / (1 + current.dx * current.dx) ** 1.5 - current.curvature) < 1e-7);
    assert.equal(current.y, roadElevation(s, settings));
  }
});

test('random slopes remain downhill and road bounds hold across seeds, controls and long drives', () => {
  for (const seed of [1, 17, 42, 712, 99999])
    for (const grade of [0.03, 0.09, 0.16])
      for (const curves of [0, 0.2, 1, 1.7]) {
        const world = { ...settings, seed, grade, curves };
        for (let i = 0; i < 300; i++) {
          const s = i < 150 ? i * 31 : 10000000 + i * 53;
          const road = roadAt(s, world);
          assert.ok(Math.abs(road.dx) <= roadSlopeBound(world) + 1e-12);
          assert.ok(road.dy <= -grade * 0.56 && road.dy >= -grade * 1.44);
          assert.ok(roadElevation(s + 1, world) < road.y);
          assert.ok(road.metric >= 1 && Object.values(road).every(Number.isFinite));
          if (curves === 0) assert.equal(Math.abs(road.x), 0);
        }
      }
});
