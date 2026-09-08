import { roadSupportWidth } from '../config/road.ts';
import { SeededSpline } from './route-spline.ts';
import { normalizedCurveLength, normalizedCurveMix } from '../config/road-shape.ts';
import { roadStretchAt, stretchSlopeBound } from './road-stretches.ts';

export interface RouteSettings {
  curves: number;
  curveLength?: number;
  curveMix?: number;
  grade: number;
  roadWidth: number;
  terrainHeight: number;
  seed: number;
  landscape?: 'highlands' | 'coast' | 'city' | 'desert' | 'lakes' | 'forest';
}
export const routeChunkLength = 180;
// Slow lateral wandering prevents stretch joins from returning to a fixed center.
// Local 90 m wiggles are gone: whole planned stretches own the turning direction.
const wander = new SeededSpline(4860, 0x714c8e29);
const slopes = new SeededSpline(routeChunkLength * 2, 0x4b17a6d3);
const wanderAmplitude = 90;
const slopeVariation = 0.22;

/** Sum of the analytic stretch and slow-wander derivative bounds.
 * Used by lake placement to protect the continuous road, not just mesh samples.
 */
export function roadSlopeBound(settings: Pick<RouteSettings, 'curves'>) {
  return Math.abs(settings.curves) * (stretchSlopeBound + (2 * wanderAmplitude) / wander.spacing);
}

export function roadElevation(s: number, settings: RouteSettings) {
  return (
    -s * settings.grade +
    settings.grade * slopes.spacing * slopeVariation * slopes.at(s, settings.seed)
  );
}

export function roadAt(s: number, settings: RouteSettings) {
  const scale = normalizedCurveLength(settings.curveLength);
  const distance = s / scale;
  const stretch = roadStretchAt(s, settings.seed, settings.curveMix, scale);
  const u = Math.max(0, Math.min(1, (s - stretch.start) / stretch.length));
  const v = u * (1 - u);
  // A compact, asymmetric curve. Value and both derivatives vanish at its ends,
  // so transitions remain C2. The central arc turns one way for several chunks;
  // the entry/exit ease into that turn without superimposed short noise.
  const f = 64 * v * v * v;
  const df = 192 * v * v * (1 - 2 * u);
  const ddf = 384 * v * (1 - 5 * v);
  // Opposite S-curve lobes share a continuous center tangent. This is a distinct
  // road section, never an extra oscillation interrupting a long sweep.
  const t = 2 * u - 1;
  const shape = stretch.kind === 's-curve' ? 2 * f * t : f;
  const dShape = stretch.kind === 's-curve' ? 2 * (df * t + 2 * f) : df;
  const ddShape = stretch.kind === 's-curve' ? 2 * (ddf * t + 4 * df) : ddf;
  const asymmetry = 1 + stretch.skew * (2 * u - 1);
  const amplitude = stretch.strength * stretch.length;
  const x =
    settings.curves *
    (scale * wanderAmplitude * wander.at(distance, settings.seed) + amplitude * shape * asymmetry);
  const dx =
    settings.curves *
    (wanderAmplitude * wander.at(distance, settings.seed, 1) +
      stretch.strength * (dShape * asymmetry + 2 * stretch.skew * shape));
  const ddx =
    settings.curves *
    ((wanderAmplitude / scale) * wander.at(distance, settings.seed, 2) +
      (stretch.strength / stretch.length) * (ddShape * asymmetry + 4 * stretch.skew * dShape));
  const y = roadElevation(s, settings);
  // |slope variation| <= 44% of grade, so even the gentlest setting is downhill.
  const dy =
    -settings.grade +
    settings.grade * slopes.spacing * slopeVariation * slopes.at(s, settings.seed, 1);
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
  const edge = settings.roadWidth / 2 + roadSupportWidth;
  const distance = Math.max(0, Math.abs(offset) - edge);
  const road = roadElevation(s, settings) - 0.08;
  // All landscapes retain exactly the same supported road and shoulder strip.
  if (distance === 0) return road;
  const blend = 1 - Math.exp(-distance / 17);
  const phase = settings.seed * 0.31;
  if (settings.landscape === 'coast' && offset > edge) {
    // A fixed, road-relative cliff profile keeps the shore continuous at every
    // chunk boundary. Height controls affect the inland hills, not sea clearance.
    return (
      roadElevation(s, settings) - 0.08 - 18 * (1 - Math.exp(-distance / 12)) - distance * 0.015
    );
  }
  if (settings.landscape === 'city') {
    const roll = 1.4 * Math.sin(s / 170 + phase) + 0.7 * Math.cos(offset / 91 + s / 260);
    const bank =
      offset < 0
        ? 11 + Math.min(distance * 0.42, 65) + 5 * Math.sin(s / 120 + offset / 97)
        : -(26 + Math.min(distance * 0.065, 50)) + roll;
    return road + (1 - Math.exp(-distance / 22)) * bank * settings.terrainHeight;
  }
  if (settings.landscape === 'desert') {
    // Long wavelengths keep the dune field calm; the outer shelves leave space
    // for independent mesas without converting the roadway into a sand ramp.
    const dunes =
      3.5 * Math.sin(s / 165 + offset / 78 + phase) + 2.1 * Math.cos(s / 260 - offset / 54);
    const bank = offset < 0 ? Math.min(distance * 0.08, 13) : -Math.min(distance * 0.045, 10);
    return road + (1 - Math.exp(-distance / 29)) * (dunes + bank) * settings.terrainHeight;
  }
  if (settings.landscape === 'forest') {
    const floor =
      2.1 + 2.2 * Math.sin(s / 120 + offset / 89 + phase) + 1.2 * Math.cos(s / 77 - offset / 67);
    const bank = offset < 0 ? Math.min(distance * 0.12, 20) : -Math.min(distance * 0.05, 9);
    return road + (1 - Math.exp(-distance / 27)) * (floor + bank) * settings.terrainHeight;
  }
  if (settings.landscape === 'lakes') {
    const roll =
      2 * Math.sin(s / 160 + offset / 110 + phase) + 1.5 * Math.cos(s / 100 - offset / 95);
    const bank =
      offset < 0 ? 9 + Math.min(distance * 0.34, 57) : -(20 + Math.min(distance * 0.075, 16));
    // A prompt drop beside the lake road opens the view across the near bank.
    // Keeping the old gently sloping meadow here hid the level water entirely.
    const base = road + blend * (roll * (offset < 0 ? 1 : 0.3) + bank) * settings.terrainHeight;
    // Evaluate against a fixed WORLD X center. A curved road is only our terrain
    // sampling coordinate system, never the coordinate system of the water.
    const worldX = roadAt(s, settings).x + offset;
    for (const lake of nearbyLakes(s, 0, settings)) {
      const rho = Math.hypot(
        (worldX - lake.centerX) / lake.radiusX,
        (s - lake.centerDistance) / lake.radiusZ,
      );
      if (rho >= lakeBasinScale) continue;
      // The bed rises smoothly to the exact level shoreline at rho=1. Outside,
      // a dry collar blends into the original mountains with zero edge slope.
      const bowl = lake.elevation + 6 * (rho * rho - 1);
      if (rho <= 1.22) return bowl;
      const t = Math.min(1, (rho - 1.22) / (lakeBasinScale - 1.22));
      const smooth = t * t * t * (t * (t * 6 - 15) + 10);
      return bowl + (base - bowl) * smooth;
    }
    return base;
  }
  const hills =
    7 + 8 * Math.sin(s * 0.018 + offset * 0.026 + phase) + 5 * Math.cos(s * 0.036 - offset * 0.045);
  const bank = offset < 0 ? Math.min(distance * 0.36, 52) : -Math.min(distance * 0.14, 22);
  return roadElevation(s, settings) - 0.08 + blend * (hills + bank) * settings.terrainHeight;
}

export interface LakeDescriptor {
  readonly index: number;
  /** Absolute longitudinal distance, not a chunk-local Z coordinate. */
  readonly centerDistance: number;
  /** Absolute X coordinate; do not add roadAt(centerDistance).x again. */
  readonly centerX: number;
  readonly radiusX: number;
  readonly radiusZ: number;
  /** One constant WORLD elevation across the entire finite water ellipse. */
  readonly elevation: number;
}

export const lakeSpacing = 700;
export const lakeBasinScale = 1.6;
const lakeCache = new Map<string, LakeDescriptor>();

/** Stable finite alpine basin. Its water is level even on the steepest road. */
export function lakeAt(index: number, settings: RouteSettings): LakeDescriptor {
  index = Math.trunc(index);
  const key = `${settings.seed}:${settings.curves}:${normalizedCurveLength(settings.curveLength)}:${normalizedCurveMix(settings.curveMix)}:${settings.grade}:${settings.roadWidth}:${settings.terrainHeight}:${index}`;
  const existing = lakeCache.get(key);
  if (existing) return existing;
  const rng = random(Math.imul(index + 1, 19349663) ^ Math.imul(settings.seed, 73856093));
  const centerDistance = index * lakeSpacing + 170 + (rng() - 0.5) * 36;
  const radiusX = 65 + rng() * 23;
  const radiusZ = 105 + rng() * 23;
  const extent = radiusZ * lakeBasinScale;

  // Bound the continuous road between samples using the analytic maximum of
  // |dx/ds| across planned stretches and wandering. This is a real clearance bound,
  // rather than hoping that no sharp curve falls between sampled positions.
  const segments = 16;
  const step = (extent * 2) / segments;
  const derivativeBound = roadSlopeBound(settings);
  let maxRoadX = -Infinity;
  for (let part = 0; part <= segments; part++) {
    maxRoadX = Math.max(maxRoadX, roadAt(centerDistance - extent + part * step, settings).x);
  }
  const centerX =
    maxRoadX +
    (derivativeBound * step) / 2 +
    settings.roadWidth / 2 +
    roadSupportWidth +
    20 +
    radiusX * lakeBasinScale;
  // grade >= .03 makes the road strictly downhill: the downstream collar edge
  // is its lowest point. An 8 m margin is safe without hiding the water at the
  // bottom of an unnecessarily deep crater; the valley is carved to meet it.
  const elevation = roadElevation(centerDistance + extent, settings) - 8;
  const descriptor = Object.freeze({ index, centerDistance, centerX, radiusX, radiusZ, elevation });
  // Bounded memoization matters: terrain meshing samples the same lake thousands
  // of times, while an endless drive must not retain every old basin forever.
  if (lakeCache.size >= 96) lakeCache.delete(lakeCache.keys().next().value!);
  lakeCache.set(key, descriptor);
  return descriptor;
}

/** Basins whose finite terrain collars overlap this absolute-distance interval.
 * Water renderers should further clip each ellipse to their own chunk bounds.
 */
export function nearbyLakes(
  start: number,
  length: number,
  settings: RouteSettings,
): LakeDescriptor[] {
  if (settings.landscape !== 'lakes' || !Number.isFinite(start) || !Number.isFinite(length))
    return [];
  const from = Math.min(start, start + length),
    to = Math.max(start, start + length);
  const maxReach = 18 + 128 * lakeBasinScale;
  const first = Math.ceil((from - 170 - maxReach) / lakeSpacing);
  const last = Math.floor((to - 170 + maxReach) / lakeSpacing);
  const result: LakeDescriptor[] = [];
  for (let index = first; index <= last; index++) {
    const lake = lakeAt(index, settings);
    if (
      lake.centerDistance + lake.radiusZ * lakeBasinScale >= from &&
      lake.centerDistance - lake.radiusZ * lakeBasinScale <= to
    )
      result.push(lake);
  }
  return result;
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
