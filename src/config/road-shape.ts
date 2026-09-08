/** Curve length scales bends; straight-road limits remain in world metres. */
export const defaultCurveLength = 1;
export const curveLengthLimits: [number, number] = [0.6, 1.6];
/** 0 = twistier, 0.5 = balanced, 1 = more sweeping; never changes tightness. */
export const defaultCurveMix = 0.5;
export const curveMixLimits: [number, number] = [0, 1];

export const straightRoadLimits = Object.freeze({
  min: 80,
  max: 160,
  target: 110,
  uninterrupted: 220,
  // Below this curvature the road changes heading by less than 0.51° over 220 m.
  // Count these nearly-flat entry/exit and inflection zones as straight too.
  nearFlatCurvature: 0.00004,
  // Limits the very shallow tails/inflections of the longest sweep, not its
  // sustained turning core. Shorter/standard sweeps are unaffected.
  maxSweepLength: 2400,
});

export function normalizedCurveMix(value?: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(curveMixLimits[0], Math.min(curveMixLimits[1], value))
    : defaultCurveMix;
}

/** Shares of planned distance, not selection counts (long sections last longer). */
export function roadMixShares(value?: number) {
  const mix = normalizedCurveMix(value);
  const sweep = mix <= 0.5 ? 0.15 + mix * 0.3 : 0.3 + (mix - 0.5) * 0.5;
  return { bend: 0.75 - sweep, sweep, 's-curve': 0.15, straight: 0.1 };
}

export function curveMixLabel(value: number) {
  const mix = normalizedCurveMix(value);
  return mix === 0.5
    ? 'Balanced'
    : mix === 0
      ? 'Twisty'
      : mix === 1
        ? 'Sweeping'
        : mix < 0.5
          ? 'More twisty'
          : 'More sweeping';
}

export function normalizedCurveLength(value?: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(curveLengthLimits[0], Math.min(curveLengthLimits[1], value))
    : defaultCurveLength;
}
