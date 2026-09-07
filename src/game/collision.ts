import { carAxles, cars, defaultCar, type CarId } from '../config/cars.ts';
import type { DrivingState } from './driving.ts';
import { roadAt, type RouteSettings } from './route.ts';

export interface CollisionPoint {
  x: number;
  /** World Z: forward travel is negative, as in the renderer. */
  z: number;
}
export interface CollisionPose {
  distance: number;
  offset: number;
  slide: number;
  /** Traffic can face uphill; this reverses its body around the model origin. */
  direction?: -1 | 1;
}

export function trafficCollisionPose(vehicle: {
  distance: number;
  offset: number;
  lane?: -1 | 1;
}): CollisionPose {
  return {
    distance: vehicle.distance,
    offset: vehicle.offset,
    slide: 0,
    direction: vehicle.lane === -1 ? -1 : 1,
  };
}

/** Bodywork, not a mirror-width rectangle. Small clipped corners follow the
 * bumpers; mirror/trim brushes deliberately aren't life-ending arcade crashes. */
export function bodyOutline(car: CarId): CollisionPoint[] {
  const { width, length } = cars[car];
  const w = width / 2,
    l = length / 2;
  const cornerX = Math.min(0.14, width * 0.07);
  const cornerZ = Math.min(0.24, length * 0.055);
  return [
    { x: -w + cornerX, z: -l },
    { x: w - cornerX, z: -l },
    { x: w, z: -l + cornerZ },
    { x: w, z: l - cornerZ },
    { x: w - cornerX, z: l },
    { x: -w + cornerX, z: l },
    { x: -w, z: l - cornerZ },
    { x: -w, z: -l + cornerZ },
  ];
}

/** Same front-axle pivot, grade and road heading as the displayed model.
 * Shared by collision detection and the debug overlay, never a second box. */
export function collisionFootprint(pose: CollisionPose, car: CarId, settings?: RouteSettings) {
  const road = settings ? roadAt(pose.distance, settings) : { x: 0, heading: 0, dy: 0 };
  const pivot = carAxles(cars[car]).front;
  const sin = Math.sin(pose.slide),
    cos = Math.cos(pose.slide);
  const sh = Math.sin(road.heading),
    ch = Math.cos(road.heading);
  const pitch = Math.atan(road.dy);
  // Horizontal section through the bumpers, not the wheels or mirrors.
  const height = Math.min(0.6, cars[car].height * 0.4);
  const direction = pose.direction ?? 1;
  return bodyOutline(car).map((point) => {
    const x = (point.x * cos + (point.z + pivot) * sin) * direction;
    const z =
      ((point.z + pivot) * cos - point.x * sin - pivot) * direction * Math.cos(pitch) +
      height * Math.sin(pitch);
    return { x: road.x + pose.offset + x * ch - z * sh, z: -pose.distance + x * sh + z * ch };
  });
}

/** Exact asymmetric reference-position limits for this rotated body on this
 * bend. Sample edges too: a curved asphalt edge can enter between two corners.
 * Six centimetres absorb body roll and the road mesh's small tessellation error. */
export function bodyRoadLimits(pose: CollisionPose, car: CarId, settings: RouteSettings) {
  const points = collisionFootprint({ ...pose, offset: 0 }, car, settings);
  const half = settings.roadWidth / 2 + 0.06;
  let left = -Infinity,
    right = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const samples = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.4));
    for (let step = 0; step <= samples; step++) {
      const t = step / samples;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const relative = x - roadAt(-z, settings).x;
      left = Math.max(left, -half - relative);
      right = Math.min(right, half - relative);
    }
  }
  return { left, right };
}

export function roadDeparture(pose: CollisionPose, car: CarId, settings: RouteSettings) {
  const limits = bodyRoadLimits(pose, car, settings);
  const left = limits.left - pose.offset,
    right = pose.offset - limits.right;
  const excursion = Math.max(0, left, right);
  const side: -1 | 0 | 1 = excursion === 0 ? 0 : left > right ? -1 : 1;
  return { excursion, side };
}

const center = (points: CollisionPoint[]) => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  z: points.reduce((sum, point) => sum + point.z, 0) / points.length,
});
const subtract = (a: CollisionPoint, b: CollisionPoint) => ({ x: a.x - b.x, z: a.z - b.z });

/** Continuous separating-axis test: both shapes must overlap at the SAME time.
 * A fast pass cannot tunnel, and empty corners of rotated AABBs don't collide. */
function sweptPolygons(a: CollisionPoint[], b: CollisionPoint[], relativeMotion: CollisionPoint) {
  let entry = 0,
    exit = 1;
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i],
        q = polygon[(i + 1) % polygon.length];
      const axis = { x: p.z - q.z, z: q.x - p.x };
      const project = (point: CollisionPoint) => point.x * axis.x + point.z * axis.z;
      const ap = a.map(project),
        bp = b.map(project);
      const minA = Math.min(...ap),
        maxA = Math.max(...ap);
      const minB = Math.min(...bp),
        maxB = Math.max(...bp);
      const velocity = project(relativeMotion);
      if (Math.abs(velocity) < 1e-10) {
        if (maxA < minB || maxB < minA) return false;
        continue;
      }
      const t0 = (minB - maxA) / velocity,
        t1 = (maxB - minA) / velocity;
      entry = Math.max(entry, Math.min(t0, t1));
      exit = Math.min(exit, Math.max(t0, t1));
      if (entry > exit) return false;
    }
  }
  return true;
}

export interface TrafficEncounter {
  collided: boolean;
  /** Player started fully behind the traffic body and ended fully ahead. */
  approached: boolean;
  cleared: boolean;
  alongside: boolean;
  close: boolean;
}

const distantEncounter = (approached: boolean, cleared: boolean): TrafficEncounter => ({
  collided: false,
  approached,
  cleared,
  alongside: false,
  close: false,
});
const trafficAhead = Object.freeze(distantEncounter(true, false));
const trafficBehind = Object.freeze(distantEncounter(false, true));

/** Exact closest body-edge distance, only evaluated while genuinely alongside.
 * Longitudinal overlap is checked separately, so tailgating cannot qualify. */
function bodyGapSquared(a: CollisionPoint[], b: CollisionPoint[]) {
  let nearest = Infinity;
  for (const [points, edges] of [
    [a, b],
    [b, a],
  ]) {
    for (const p of points) {
      for (let i = 0; i < edges.length; i++) {
        const start = edges[i],
          end = edges[(i + 1) % edges.length];
        const dx = end.x - start.x,
          dz = end.z - start.z;
        const t = Math.max(
          0,
          Math.min(1, ((p.x - start.x) * dx + (p.z - start.z) * dz) / (dx * dx + dz * dz)),
        );
        nearest = Math.min(nearest, (p.x - start.x - t * dx) ** 2 + (p.z - start.z - t * dz) ** 2);
      }
    }
  }
  return nearest;
}

/** Collision and near-miss inspection share the same sampled body polygons.
 * A zero proximity distance skips scoring work (debug/tests or already passed cars). */
export function sweptTrafficEncounter(
  before: DrivingState,
  after: DrivingState,
  vehicle: { car: CarId; distance: number; offset: number; lane?: -1 | 1 },
  previousTrafficDistance: number,
  car: CarId = defaultCar,
  settings?: RouteSettings,
  proximityDistance = 0,
) {
  // Conservative broad phase ONLY: a candidate still needs a tight polygon test.
  const reach = cars[car].length + cars[vehicle.car].length;
  const relative0 = before.distance - previousTrafficDistance;
  const relative1 = after.distance - vehicle.distance;
  if (Math.min(relative0, relative1) > reach) return trafficBehind;
  if (Math.max(relative0, relative1) < -reach) return trafficAhead;
  const result = distantEncounter(false, false);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const player = (t: number) => ({
    distance: lerp(before.distance, after.distance, t),
    offset: lerp(before.offset, after.offset, t),
    slide: lerp(before.slide, after.slide, t),
  });
  const traffic = (t: number) =>
    trafficCollisionPose({
      distance: lerp(previousTrafficDistance, vehicle.distance, t),
      offset: vehicle.offset,
      lane: vehicle.lane,
    });
  // Small angular intervals keep the continuous translation sweep tight even
  // when the rear swings. At normal 120 Hz simulation most checks need one step.
  const travel = Math.max(
    Math.abs(after.distance - before.distance),
    Math.abs(vehicle.distance - previousTrafficDistance),
  );
  const steps = Math.max(
    1,
    Math.ceil(Math.abs(after.slide - before.slide) / 0.01),
    Math.ceil(travel / 0.5),
  );
  const inspect = (a: CollisionPoint[], b: CollisionPoint[], t: number) => {
    if (!(proximityDistance > 0)) return;
    const heading = settings ? roadAt(player(t).distance, settings).heading : 0;
    const x = Math.sin(heading),
      z = -Math.cos(heading);
    const interval = (points: CollisionPoint[]) => {
      let min = Infinity,
        max = -Infinity;
      for (const p of points) {
        // Local origin keeps this stable even after thousands of kilometres.
        const value = (p.x - a[0].x) * x + (p.z - a[0].z) * z;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      return { min, max };
    };
    const ap = interval(a),
      bp = interval(b);
    if (t === 0) result.approached = ap.max < bp.min;
    if (t === 1) result.cleared = ap.min > bp.max;
    const overlap = Math.min(ap.max, bp.max) - Math.max(ap.min, bp.min);
    result.alongside ||= overlap > 0;
    // Half a metre of overlap rules out a close bumper-following manoeuvre.
    if (!result.close && overlap >= 0.5)
      result.close = bodyGapSquared(a, b) <= proximityDistance ** 2;
  };
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps,
      t1 = (i + 1) / steps,
      mid = (t0 + t1) / 2;
    const a0 = collisionFootprint(player(t0), car, settings),
      a1 = collisionFootprint(player(t1), car, settings);
    const b0 = collisionFootprint(traffic(t0), vehicle.car, settings),
      b1 = collisionFootprint(traffic(t1), vehicle.car, settings);
    if (sweptPolygons(a0, b0, { x: 0, z: 0 }) || sweptPolygons(a1, b1, { x: 0, z: 0 })) {
      result.collided = true;
      return result;
    }
    const a = collisionFootprint(player(mid), car, settings),
      b = collisionFootprint(traffic(mid), vehicle.car, settings);
    const shiftA = subtract(center(a0), center(a)),
      shiftB = subtract(center(b0), center(b));
    const motion = subtract(subtract(center(a1), center(a0)), subtract(center(b1), center(b0)));
    if (
      sweptPolygons(
        a.map((p) => ({ x: p.x + shiftA.x, z: p.z + shiftA.z })),
        b.map((p) => ({ x: p.x + shiftB.x, z: p.z + shiftB.z })),
        motion,
      )
    ) {
      result.collided = true;
      return result;
    }
    inspect(a0, b0, t0);
    inspect(a, b, mid);
    inspect(a1, b1, t1);
  }
  return result;
}

export function sweptTrafficCollision(
  before: DrivingState,
  after: DrivingState,
  vehicle: { car: CarId; distance: number; offset: number; lane?: -1 | 1 },
  previousTrafficDistance: number,
  car: CarId = defaultCar,
  settings?: RouteSettings,
) {
  return sweptTrafficEncounter(before, after, vehicle, previousTrafficDistance, car, settings)
    .collided;
}
