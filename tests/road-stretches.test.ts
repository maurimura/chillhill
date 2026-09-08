import test from 'node:test';
import assert from 'node:assert/strict';
import { roadPlanLength, roadStretchAt } from '../src/game/road-stretches.ts';
import { normalizedCurveLength, roadMixShares } from '../src/config/road-shape.ts';
import { roadAt, roadSlopeBound, lakeAt, lakeBasinScale } from '../src/game/route.ts';
import { roadSupportWidth } from '../src/config/road.ts';

const settings = { seed: 42, curves: 1, grade: 0.09, roadWidth: 10, terrainHeight: 1 };
function plan(index: number, seed = 42, curveLength = 1) {
  const result = [];
  const length = roadPlanLength * curveLength;
  let start = index * length;
  for (let i = 0; start < (index + 1) * length && i < 32; i++) {
    const stretch = roadStretchAt(start + 0.001, seed, 0.5, curveLength);
    result.push(stretch);
    start = stretch.start + stretch.length;
  }
  assert.equal(start, (index + 1) * length);
  return result;
}

test('balanced plans allocate distance to 45% bends, 30% sweeps, 15% S-curves and 10% straights', () => {
  const orders = new Set();
  for (let index = -30; index < 80; index++) {
    const stretches = plan(index);
    for (const [kind, share] of Object.entries(roadMixShares())) {
      const length = stretches.filter((s) => s.kind === kind).reduce((sum, s) => sum + s.length, 0);
      assert.ok(Math.abs(length / roadPlanLength - share) < 1e-10);
    }
    assert.ok(stretches.length > 10 && stretches.length < 24);
    orders.add(stretches.map((s) => `${s.kind}:${Math.sign(s.strength)}`).join(','));
    assert.equal(stretches[0]!.start, index * roadPlanLength);
    assert.equal(stretches.at(-1)!.start + stretches.at(-1)!.length, (index + 1) * roadPlanLength);
    for (let i = 1; i < stretches.length; i++)
      assert.equal(stretches[i]!.start, stretches[i - 1]!.start + stretches[i - 1]!.length);
  }
  assert.ok(orders.size > 20);
});

test('long sweeps hold one meaningful curve across several chunks, at every length and tightness', () => {
  for (const seed of [1, 17, 42, 712, 99999])
    for (const index of [0, 1, 31, 32, 3086])
      for (const curveLength of [0.6, 1, 1.6])
        for (const stretch of plan(index, seed, curveLength).filter((s) => s.kind === 'sweep')) {
          const coreLength = stretch.length * 0.38;
          assert.ok(coreLength >= 360 * curveLength && coreLength <= 720 * curveLength);
          for (const curves of [0.2, 1, 1.7])
            for (let sample = 0; sample <= 30; sample++) {
              const s = stretch.start + stretch.length * (0.31 + (0.38 * sample) / 30);
              const road = roadAt(s, { ...settings, seed, curves, curveLength });
              assert.ok(
                road.curvature * Math.sign(stretch.strength) < -0.00001,
                `A sustained curve cannot reverse or flatten mid-sweep: seed ${seed}, ${s}`,
              );
            }
        }
});

test('straight stretches suppress local wiggles instead of adding another slalom', () => {
  for (const index of [0, 1, 2, 20, 3086]) {
    const stretch = plan(index).find((s) => s.kind === 'straight')!;
    for (let i = 0; i <= 50; i++)
      assert.ok(
        Math.abs(roadAt(stretch.start + (stretch.length * i) / 50, settings).curvature) < 0.00002,
      );
  }
});

test('feature and planning-window joins preserve position, heading and curvature at long distances', () => {
  const epsilon = 0.0001;
  for (const seed of [1, 42, 99999])
    for (const index of [-1, 0, 1, 3086])
      for (const curveLength of [0.6, 1, 1.6])
        for (const stretch of plan(index, seed, curveLength)) {
          const s = stretch.start;
          const world = { ...settings, seed, curveLength };
          const before = roadAt(s - epsilon, world),
            after = roadAt(s + epsilon, world),
            current = roadAt(s, world);
          assert.ok(Math.abs(before.x - after.x) < 0.001);
          assert.ok(Math.abs(before.dx - after.dx) < 0.00001);
          assert.ok(Math.abs(before.curvature - after.curvature) < 0.000001);
          assert.ok(Math.abs((after.x - before.x) / (2 * epsilon) - current.dx) < 0.00001);
        }
});

test('curve length extends bends without stretching straights or changing vertical grade', () => {
  const averageSweep = (scale: number) => {
    const sweeps = plan(0, 42, scale).filter((s) => s.kind === 'sweep');
    return sweeps.reduce((sum, s) => sum + s.length, 0) / sweeps.length;
  };
  for (const scale of [0.6, 1, 1.6]) {
    assert.ok(Math.abs(averageSweep(scale) / averageSweep(1) - scale) < 1e-10);
    for (const straight of plan(0, 42, scale).filter((s) => s.kind === 'straight'))
      assert.ok(straight.length >= 80 - 1e-8 && straight.length <= 160);
    for (let s = 0; s < 6000; s += 31) {
      const extended = roadAt(s, { ...settings, curveLength: scale });
      assert.equal(extended.y, roadAt(s, settings).y);
      assert.ok(Math.abs(extended.dx) <= roadSlopeBound(settings));
    }
  }
});

test('plans regenerate exactly after out-of-order access and cache eviction', () => {
  const before = plan(2);
  for (let index = 10000; index >= 0; index--) roadStretchAt(index * roadPlanLength, index);
  assert.deepEqual(plan(2), before);
  assert.notDeepEqual(plan(2, 43), before);
  assert.ok(before.every(Object.isFrozen));
});

test('missing or invalid curve length falls back safely and settings have bounded extremes', () => {
  for (const value of [undefined, NaN, Infinity]) {
    assert.equal(normalizedCurveLength(value), 1);
    assert.deepEqual(roadAt(900, { ...settings, curveLength: value }), roadAt(900, settings));
  }
  assert.equal(normalizedCurveLength(-1), 0.6);
  assert.equal(normalizedCurveLength(9), 1.6);
});

test('changing curve length invalidates lake placement and keeps all basins outside the road', () => {
  for (const curveLength of [0.6, 1, 1.6]) {
    const world = { ...settings, curveLength, curves: 1.7, roadWidth: 16 };
    for (const index of [0, 1, 4, 14285]) {
      const lake = lakeAt(index, world);
      const reach = lake.radiusZ * lakeBasinScale;
      for (let i = 0; i <= 100; i++) {
        const s = lake.centerDistance - reach + (reach * 2 * i) / 100;
        assert.ok(
          lake.centerX - lake.radiusX * lakeBasinScale - roadAt(s, world).x >
            8 + roadSupportWidth + 19.99,
        );
      }
    }
  }
  assert.notDeepEqual(
    lakeAt(1, { ...settings, curveLength: 0.6 }),
    lakeAt(1, { ...settings, curveLength: 1.6 }),
  );
});
