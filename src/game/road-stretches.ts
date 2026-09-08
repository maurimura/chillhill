import {
  normalizedCurveLength,
  normalizedCurveMix,
  roadMixShares,
  straightRoadLimits,
} from '../config/road-shape.ts';
import { seededRouteValue } from './route-spline.ts';

export type StretchKind = 'sweep' | 'bend' | 's-curve' | 'straight';
export interface RoadStretch {
  readonly start: number;
  readonly length: number;
  readonly kind: StretchKind;
  readonly strength: number;
  readonly skew: number;
}

// A planning window is not a rendered chunk or a recycled mesh. Its random
// feature ordering, boundaries, direction, strength and asymmetry vary by seed.
export const roadPlanLength = 7200;
export const maxStretchStrength = 0.18;
export const maxSCurveStrength = 0.12;
export const maxStretchSkew = 0.2;
// For f(u)=64[u(1-u)]³, max |f'| = 192/(25√5), max f = 1.
// S-curve g(u)=2(2u-1)f(u): max |g'|=4, max |g|=432/(343√7).
export const stretchSlopeBound = Math.max(
  maxStretchStrength * ((192 / (25 * Math.sqrt(5))) * (1 + maxStretchSkew) + 2 * maxStretchSkew),
  maxSCurveStrength *
    (4 * (1 + maxStretchSkew) + (2 * maxStretchSkew * 432) / (343 * Math.sqrt(7))),
);

interface Plan {
  index: number;
  seed: number;
  mix: number;
  scale: number;
  stretches: readonly RoadStretch[];
}
const plans: (Plan | undefined)[] = new Array(32);

interface Feature {
  kind: StretchKind;
  length: number;
}

// Conservative allowances for the nearly-flat tails at either end of a curve.
// They cover tightness 0.2–1.7, all asymmetries, slow wandering and the steepest
// grade. Tests measure the resulting curvature/path length, not just kind tags.
function transitionReserve(feature: Feature) {
  const [metres, length]: [number, number] =
    feature.kind === 'sweep'
      ? [50, straightRoadLimits.maxSweepLength]
      : feature.kind === 's-curve'
        ? [18, 1280]
        : [18, 1040];
  return 1 + metres * (feature.length / length) ** 2;
}
const straightMetricBound = Math.sqrt(1 + ((1.7 * 2 * 90) / 4860) ** 2 + (0.16 * 1.44) ** 2);

function shuffle<T>(values: T[], rng: () => number) {
  for (let i = values.length - 1; i > 0; i--) {
    const next = Math.floor(rng() * (i + 1));
    [values[i], values[next]] = [values[next]!, values[i]!];
  }
  return values;
}

function splitDistance(
  kind: StretchKind,
  budget: number,
  count: number,
  min: number,
  max: number,
  rng: () => number,
): Feature[] {
  const result: Feature[] = [];
  let remaining = budget;
  for (let i = 0; i < count; i++) {
    const left = count - i - 1;
    const low = Math.max(min, remaining - max * left);
    const high = Math.min(max, remaining - min * left);
    const length = left === 0 ? remaining : low + rng() * (high - low);
    result.push({ kind, length });
    remaining -= length;
  }
  return shuffle(result, rng);
}

/** Physical world metres, bounded caching and identical results in the terrain
 * worker. Curve length changes the curved layout, never the straight-road cap. */
export function roadStretchAt(
  distance: number,
  seed: number,
  curveMix?: number,
  curveLength?: number,
): RoadStretch {
  const mix = normalizedCurveMix(curveMix);
  const scale = normalizedCurveLength(curveLength);
  const planLength = roadPlanLength * scale;
  const index = Math.floor(distance / planLength);
  const slot = index & 31;
  let plan = plans[slot];
  if (
    !plan ||
    plan.index !== index ||
    plan.seed !== seed ||
    plan.mix !== mix ||
    plan.scale !== scale
  ) {
    let draw = 0;
    const rng = () =>
      (seededRouteValue(index, seed, 0x63a912b7 ^ Math.imul(++draw, 19349663)) + 1) / 2;
    const shares = roadMixShares(mix);
    const bendBudget = planLength * shares.bend;
    const sweepBudget = planLength * shares.sweep;
    const straightBudget = planLength * shares.straight;
    const straightCount = Math.ceil(straightBudget / straightRoadLimits.target);
    const sweepCount = Math.max(
      1,
      Math.round(sweepBudget / (1300 * scale)),
      Math.ceil(sweepBudget / straightRoadLimits.maxSweepLength),
    );
    // More/larger curves never stretch the straights. Redistribute their 10%
    // budget over more short rests, with enough bends to separate every one.
    const requestedBends = Math.round(bendBudget / ((360 + rng() * 140) * scale));
    const bendCount = Math.max(
      straightCount - sweepCount - 1,
      Math.min(requestedBends, 2 * (straightCount + sweepCount) - 2),
    );
    const twisty = shuffle(
      [
        ...splitDistance(
          'bend',
          bendBudget,
          bendCount,
          Math.min(250 * scale, bendBudget / bendCount),
          650 * scale,
          rng,
        ),
        ...splitDistance(
          's-curve',
          planLength * shares['s-curve'],
          2,
          400 * scale,
          800 * scale,
          rng,
        ),
      ],
      rng,
    );
    const sweeps = splitDistance(
      'sweep',
      sweepBudget,
      sweepCount,
      Math.min(960 * scale, sweepBudget / sweepCount),
      Math.min(2000 * scale, straightRoadLimits.maxSweepLength),
      rng,
    );
    // Spread long sweeps among straight slots; fill remaining same-kind joins
    // with bends below. Random positions retain variety without shuffle retries.
    const sweepSlots = new Set(
      shuffle(
        Array.from({ length: straightCount - 1 }, (_, i) => i),
        rng,
      ).slice(0, sweepCount),
    );
    const spacers: Feature[] = [];
    for (let i = 0; i < straightCount; i++) {
      spacers.push({ kind: 'straight', length: 0 });
      if (sweepSlots.has(i)) spacers.push(sweeps.pop()!);
    }
    const gaps = Array<number>(spacers.length + 1).fill(0);
    // A curve at each window edge prevents straights joining across windows.
    // One twisty feature at each edge keeps cross-window twisty streaks <= 2.
    gaps[0] = 1;
    gaps[spacers.length] = 1;
    for (let i = 1; i < spacers.length; i++)
      if (spacers[i - 1]!.kind === spacers[i]!.kind) gaps[i] = 1;
    let unplaced = twisty.length - gaps.reduce((sum, count) => sum + count, 0);
    while (unplaced-- > 0) {
      const available = gaps
        .map((count, i) => ({ count, i }))
        .filter(({ count, i }) => count < (i === 0 || i === spacers.length ? 1 : 2));
      gaps[available[Math.floor(rng() * available.length)]!.i]!++;
    }
    const features: Feature[] = [];
    let nextTwisty = 0;
    for (let i = 0; i < gaps.length; i++) {
      for (let j = 0; j < gaps[i]!; j++) features.push(twisty[nextTwisty++]!);
      if (i < spacers.length) features.push(spacers[i]!);
    }
    // Allocate actual straight lengths only after both neighbours are known.
    // The 220 m allowance includes their flat tails and a 4 m sampling margin.
    const straightSlots = features.flatMap((feature, i) =>
      feature.kind === 'straight'
        ? [
            {
              feature,
              max:
                Math.min(
                  straightRoadLimits.max,
                  straightRoadLimits.uninterrupted -
                    transitionReserve(features[i - 1]!) -
                    transitionReserve(features[i + 1]!) -
                    4,
                ) / straightMetricBound,
            },
          ]
        : [],
    );
    let remaining = straightBudget;
    let remainingMax = straightSlots.reduce((sum, slot) => sum + slot.max, 0);
    for (let i = 0; i < straightSlots.length; i++) {
      const slot = straightSlots[i]!;
      remainingMax -= slot.max;
      const left = straightSlots.length - i - 1;
      const low = Math.max(straightRoadLimits.min, remaining - remainingMax);
      const high = Math.min(slot.max, remaining - left * straightRoadLimits.min);
      slot.feature.length = left === 0 ? remaining : low + rng() * Math.max(0, high - low);
      remaining -= slot.feature.length;
    }
    let start = index * planLength;
    const stretches = features.map((feature, i): RoadStretch => {
      const end = i === features.length - 1 ? (index + 1) * planLength : start + feature.length;
      const strength =
        feature.kind === 'straight'
          ? 0
          : (feature.kind === 'sweep'
              ? 0.11 + rng() * 0.07
              : feature.kind === 's-curve'
                ? 0.08 + rng() * 0.04
                : 0.08 + rng() * 0.06) * (rng() < 0.5 ? -1 : 1);
      const stretch = Object.freeze({
        start,
        length: end - start,
        kind: feature.kind,
        strength,
        skew: (rng() * 2 - 1) * maxStretchSkew,
      });
      start = end;
      return stretch;
    });
    plan = { index, seed, mix, scale, stretches: Object.freeze(stretches) };
    plans[slot] = plan;
  }
  for (const stretch of plan.stretches)
    if (distance < stretch.start + stretch.length) return stretch;
  return plan.stretches.at(-1)!;
}
