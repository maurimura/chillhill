export interface RouteSettings {
  curves: number;
  grade: number;
  roadWidth: number;
  terrainHeight: number;
  seed: number;
  landscape?: 'highlands' | 'coast';
}
// Each new interval contributes a seeded bend. Quintic interpolation keeps
// position, direction, and curvature continuous at generation boundaries.
function bendValue(index: number, seed: number) {
  let value = Math.imul(index ^ Math.imul(seed, 374761393), 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296 - 0.5;
}

export function roadElevation(s: number, settings: RouteSettings) {
  return -s * settings.grade + 1.6 * Math.sin(s / 130);
}

export function roadAt(s: number, settings: RouteSettings) {
  const phase = (settings.seed % 17) * 0.13;
  const interval = 620;
  const index = Math.floor(s / interval),
    t = s / interval - index;
  const a = bendValue(index, settings.seed),
    difference = bendValue(index + 1, settings.seed) - a;
  const blend = t * t * t * (t * (t * 6 - 15) + 10);
  const blendSlope = 30 * t * t * (t - 1) * (t - 1);
  const blendCurve = 60 * t * (2 * t * t - 3 * t + 1);
  const x =
    settings.curves *
    (32 * Math.sin(s / 92 + phase) + 13 * Math.sin(s / 43) + 65 * (a + difference * blend));
  const dx =
    settings.curves *
    ((32 / 92) * Math.cos(s / 92 + phase) +
      (13 / 43) * Math.cos(s / 43) +
      (65 * difference * blendSlope) / interval);
  const ddx =
    settings.curves *
    ((-32 / (92 * 92)) * Math.sin(s / 92 + phase) -
      (13 / (43 * 43)) * Math.sin(s / 43) +
      (65 * difference * blendCurve) / (interval * interval));
  const y = roadElevation(s, settings);
  const dy = -settings.grade + (1.6 / 130) * Math.cos(s / 130);
  return {
    x,
    y,
    dx,
    dy,
    heading: Math.atan2(dx, 1),
    metric: Math.sqrt(1 + dx * dx + dy * dy),
    curvature: ddx / Math.pow(1 + dx * dx, 1.5),
  };
}

export function terrainAt(s: number, offset: number, settings: RouteSettings) {
  const edge = settings.roadWidth / 2 + 1.3;
  const distance = Math.max(0, Math.abs(offset) - edge);
  const blend = 1 - Math.exp(-distance / 17);
  const phase = settings.seed * 0.31;
  if (settings.landscape === 'coast' && offset > edge) {
    // A fixed, road-relative cliff profile keeps the shore continuous at every
    // chunk boundary. Height controls affect the inland hills, not sea clearance.
    return (
      roadElevation(s, settings) - 0.08 - 18 * (1 - Math.exp(-distance / 12)) - distance * 0.015
    );
  }
  const hills =
    7 + 8 * Math.sin(s * 0.018 + offset * 0.026 + phase) + 5 * Math.cos(s * 0.036 - offset * 0.045);
  const bank = offset < 0 ? Math.min(distance * 0.36, 52) : -Math.min(distance * 0.14, 22);
  return roadElevation(s, settings) - 0.08 + blend * (hills + bank) * settings.terrainHeight;
}

/** An intentionally stylized sea follows the endless grade, never flooding the road. */
export function seaElevation(s: number, settings: RouteSettings) {
  return roadElevation(s, settings) - 18;
}

export function random(seed: number) {
  let value = seed | 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
