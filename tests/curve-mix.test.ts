import assert from 'node:assert/strict';
import test from 'node:test';
import { curveMixLabel, normalizedCurveMix, roadMixShares } from '../src/config/road-shape.ts';
import { roadPlanLength, roadStretchAt } from '../src/game/road-stretches.ts';
import { roadAt, roadSlopeBound, lakeAt, lakeBasinScale } from '../src/game/route.ts';
import { roadSupportWidth } from '../src/config/road.ts';

const settings = { seed: 42, curves: 1, grade: 0.09, roadWidth: 10, terrainHeight: 1 };
function plan(index: number, seed = 42, mix = 0.5, curveLength = 1) {
  const result = [];
  const length = roadPlanLength * curveLength;
  let start = index * length;
  for (let i = 0; start < (index + 1) * length && i < 32; i++) {
    const stretch = roadStretchAt(start + 0.001, seed, mix, curveLength);
    assert.equal(stretch.start, start);
    result.push(stretch);
    start = stretch.start + stretch.length;
  }
  assert.equal(start, (index + 1) * length);
  return result;
}

test('mix follows distance weights at every slider step without consecutive sweeps or three twisty sections', () => {
  for (let step = 0; step <= 20; step++) {
    const mix = step / 20;
    for (const seed of [1, 17, 42, 99999]) {
      const stretches = Array.from({ length: 10 }, (_, i) => plan(i - 2, seed, mix)).flat();
      let twisty = 0;
      for (let i = 0; i < stretches.length; i++) {
        const stretch = stretches[i]!;
        twisty = stretch.kind === 'bend' || stretch.kind === 's-curve' ? twisty + 1 : 0;
        assert.ok(twisty <= 2, `Long twisty streak at mix ${mix}, seed ${seed}`);
        assert.ok(!(stretch.kind === 'sweep' && stretches[i - 1]?.kind === 'sweep'));
        assert.ok(!(stretch.kind === 'straight' && stretches[i - 1]?.kind === 'straight'));
        const bounds = {
          bend: [250, 650],
          sweep: [960, 2000],
          's-curve': [400, 800],
          straight: [80, 160],
        };
        const [min, max] = bounds[stretch.kind]!;
        assert.ok(stretch.length >= min! - 1e-8 && stretch.length <= max! + 1e-8);
      }
      for (const [kind, share] of Object.entries(roadMixShares(mix))) {
        const distance = stretches
          .filter((s) => s.kind === kind)
          .reduce((sum, s) => sum + s.length, 0);
        assert.ok(Math.abs(distance / (10 * roadPlanLength) - share) < 1e-10);
      }
    }
  }
  assert.ok(roadMixShares(0).sweep < roadMixShares(0.5).sweep);
  assert.ok(roadMixShares(0.5).sweep < roadMixShares(1).sweep);
});

test('S-curves smoothly change turn direction and analytic derivatives match the actual road', () => {
  for (const mix of [0, 0.5, 1])
    for (const seed of [1, 42, 99999])
      for (const curveLength of [0.6, 1, 1.6])
        for (const stretch of plan(2, seed, mix, curveLength).filter((s) => s.kind === 's-curve')) {
          const world = { ...settings, seed, curveMix: mix, curveLength, curves: 1.7 };
          const at = (u: number) => roadAt(stretch.start + stretch.length * u, world);
          assert.ok(at(0.35).curvature * at(0.65).curvature < -1e-8);
          for (let i = 0; i <= 100; i++) {
            const s = stretch.start + (stretch.length * i) / 100;
            // Joins are C2, not C3: a smaller probe bounds the one-sided
            // third-derivative contribution at an exact feature boundary.
            const epsilon = 0.00001;
            const road = roadAt(s, world),
              before = roadAt(s - epsilon, world),
              after = roadAt(s + epsilon, world);
            const curvature =
              (after.dx - before.dx) / (2 * epsilon) / Math.pow(1 + road.dx ** 2, 1.5);
            const positionSlope = (roadAt(s + 0.001, world).x - roadAt(s - 0.001, world).x) / 0.002;
            assert.ok(Math.abs(positionSlope - road.dx) < 1e-7);
            assert.ok(Math.abs(curvature - road.curvature) < 2e-8);
            assert.ok(Math.abs(road.dx) <= roadSlopeBound(world));
          }
        }
});

test('all mix and length combinations have smooth joins, meaningful long arcs and bounded headings', () => {
  for (const curveMix of [0, 0.35, 0.5, 0.7, 1])
    for (const index of [-1, 0, 1388])
      for (const curveLength of [0.6, 1, 1.6]) {
        const world = { ...settings, curveMix, curveLength, curves: 1.7 };
        for (const stretch of plan(index, settings.seed, curveMix, curveLength)) {
          const join = stretch.start;
          const before = roadAt(join - 0.0001, world),
            after = roadAt(join + 0.0001, world);
          assert.ok(Math.abs(before.x - after.x) < 0.001);
          assert.ok(Math.abs(before.dx - after.dx) < 1e-6);
          assert.ok(Math.abs(before.curvature - after.curvature) < 1e-6);
          for (let i = 0; i <= 100; i++) {
            const u = i / 100;
            const road = roadAt(stretch.start + stretch.length * u, world);
            assert.ok(Math.abs(road.dx) <= roadSlopeBound(world));
            if (stretch.kind === 'sweep' && u >= 0.31 && u <= 0.69)
              assert.ok(road.curvature * Math.sign(stretch.strength) < -1e-5);
          }
        }
      }
});

test('mix changes and out-of-order regeneration cannot poison cached plans', () => {
  const before = plan(2);
  for (let index = 300; index >= 0; index--)
    roadStretchAt(index * roadPlanLength, index, (index % 11) / 10);
  assert.deepEqual(plan(2), before);
  assert.notDeepEqual(plan(2, 43), before);
  for (const mix of [0, 1, 0.5]) {
    const mixed = plan(2, 42, mix);
    assert.deepEqual(plan(2), before);
    if (mix !== 0.5) assert.notDeepEqual(mixed, before);
  }
});

test('mix defaults, bounds and labels are safe for old saves', () => {
  for (const value of [undefined, NaN, Infinity]) {
    assert.equal(normalizedCurveMix(value), 0.5);
    assert.deepEqual(roadAt(900, { ...settings, curveMix: value }), roadAt(900, settings));
  }
  assert.equal(normalizedCurveMix(-1), 0);
  assert.equal(normalizedCurveMix(9), 1);
  assert.equal(curveMixLabel(0.5), 'Balanced');
  assert.equal(curveMixLabel(0), 'Twisty');
  assert.equal(curveMixLabel(1), 'Sweeping');
});

test('mix invalidates lake placement and all lake basins clear the reshaped road', () => {
  assert.notDeepEqual(
    lakeAt(1, { ...settings, curveMix: 0 }),
    lakeAt(1, { ...settings, curveMix: 1 }),
  );
  for (const curveMix of [0, 0.5, 1])
    for (const curveLength of [0.6, 1.6]) {
      const world = { ...settings, curveMix, curveLength, curves: 1.7, roadWidth: 16 };
      for (const index of [0, 1, 4, 14285]) {
        const lake = lakeAt(index, world);
        for (let i = 0; i <= 100; i++) {
          const s = lake.centerDistance + (i / 50 - 1) * lake.radiusZ * lakeBasinScale;
          assert.ok(
            Math.abs(lake.centerX - roadAt(s, world).x) >
              lake.radiusX * lakeBasinScale + world.roadWidth / 2 + roadSupportWidth,
          );
        }
      }
    }
});
