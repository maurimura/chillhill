import test from 'node:test';
import assert from 'node:assert/strict';
import { straightRoadLimits, roadMixShares } from '../src/config/road-shape.ts';
import { roadStretchAt, roadPlanLength } from '../src/game/road-stretches.ts';
import { roadAt } from '../src/game/route.ts';

const settings = { seed: 42, curves: 1, grade: 0.16, roadWidth: 10, terrainHeight: 1 };
function plan(index: number, seed: number, mix: number, scale: number) {
  const size = roadPlanLength * scale;
  let s = index * size;
  const stretches = [];
  while (s < (index + 1) * size && stretches.length < 40) {
    const next = roadStretchAt(s + 0.0001, seed, mix, scale);
    assert.equal(next.start, s);
    assert.ok(next.length > 0 && Number.isFinite(next.length));
    stretches.push(next);
    s = next.start + next.length;
  }
  assert.equal(s, (index + 1) * size);
  return stretches;
}

test('straight lengths stay 80–160 m with no adjacent straights at every mix/length slider step', () => {
  for (const seed of [1, 42, 99999])
    for (let lengthStep = 12; lengthStep <= 32; lengthStep++)
      for (let mixStep = 0; mixStep <= 20; mixStep++) {
        const scale = lengthStep / 20,
          mix = mixStep / 20;
        const stretches = [...plan(-1, seed, mix, scale), ...plan(0, seed, mix, scale)];
        let twisty = 0;
        for (let i = 0; i < stretches.length; i++) {
          const stretch = stretches[i]!;
          if (stretch.kind === 'straight') {
            assert.notEqual(stretches[i - 1]?.kind, 'straight');
            assert.ok(stretch.length >= straightRoadLimits.min - 1e-8);
            const world = { ...settings, seed, curves: 1.7, curveMix: mix, curveLength: scale };
            let travelled = 0;
            for (let sample = 0; sample < 20; sample++)
              travelled +=
                (stretch.length / 20) *
                roadAt(stretch.start + (stretch.length * (sample + 0.5)) / 20, world).metric;
            assert.ok(travelled <= straightRoadLimits.max, `${travelled} m straight`);
          }
          assert.ok(!(stretch.kind === 'sweep' && stretches[i - 1]?.kind === 'sweep'));
          twisty = stretch.kind === 'bend' || stretch.kind === 's-curve' ? twisty + 1 : 0;
          assert.ok(twisty <= 2);
        }
        for (const [kind, share] of Object.entries(roadMixShares(mix))) {
          const distance = stretches
            .filter((s) => s.kind === kind)
            .reduce((sum, s) => sum + s.length, 0);
          assert.ok(Math.abs(distance / (2 * roadPlanLength * scale) - share) < 1e-9);
        }
      }
});

test('the 220 m cap includes nearly-flat curve tails and inflections, across seams and distant plans', () => {
  let longest = 0;
  let hasCombined = false;
  for (const seed of [1, 17, 42, 712, 99999])
    for (const curveLength of [0.6, 1, 1.6])
      for (const curveMix of [0, 0.5, 1])
        for (const curves of [0.2, 1, 1.7]) {
          const world = { ...settings, seed, curves, curveLength, curveMix };
          const size = roadPlanLength * curveLength;
          for (const origin of [-size, 1000 * size]) {
            let run = 0;
            const kinds = new Set<string>();
            for (let s = origin; s < origin + 2 * size; s += 2) {
              const road = roadAt(s, world);
              if (Math.abs(road.curvature) <= straightRoadLimits.nearFlatCurvature) {
                run += 2 * road.metric;
                longest = Math.max(longest, run);
                kinds.add(roadStretchAt(s, seed, curveMix, curveLength).kind);
                if (kinds.has('straight') && kinds.size > 1) hasCombined = true;
                assert.ok(
                  run <= straightRoadLimits.uninterrupted,
                  `Flat run ${run} m: seed ${seed}, mix ${curveMix}, length ${curveLength}, tightness ${curves}, s=${s}`,
                );
              } else {
                run = 0;
                kinds.clear();
              }
            }
          }
        }
  assert.ok(longest > 100, 'Still provides useful breathing room');
  assert.ok(hasCombined, 'The check must include curve transitions, not only tagged straights');
});

test('length-specific plans reproduce after out-of-order sampling and bounded-cache eviction', () => {
  const before = plan(1388, 42, 0.5, 1.6);
  for (let index = 0; index < 1000; index++) plan(index, index + 1, index % 2, 0.6);
  assert.deepEqual(plan(1388, 42, 0.5, 1.6), before);
  assert.notDeepEqual(plan(1388, 42, 0.5, 0.6), before);
  assert.deepEqual(plan(1388, 42, 0.5, 1.6), before);
});
