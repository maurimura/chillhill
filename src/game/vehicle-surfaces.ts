import type { Point, Section, VehicleBuilder } from './vehicle-builder.ts';

export interface BodyContour {
  crown: number;
  shoulder: number;
  shoulderStart: number;
  sill: number;
  tuck: number;
  archRadius: number;
  tailRound?: number;
  noseRound?: number;
  endLift?: number;
  valanceTuck?: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Rounded sheet metal inside the original body envelope, with real wheel openings. */
export function bodyContour(
  belt: Section[],
  axles: number[],
  wheelHeight: number,
  contour: BodyContour,
) {
  const front = belt[0].z;
  const rear = belt.at(-1)!.z;
  const sample = (z: number) => {
    const i = Math.max(
      1,
      belt.findIndex((section) => section.z >= z),
    );
    const a = z >= rear ? belt.at(-1)! : belt[i - 1];
    const b = z >= rear ? a : belt[i];
    const t = a === b ? 0 : clamp((z - a.z) / (b.z - a.z), 0, 1);
    return { width: a.width + (b.width - a.width) * t, y: a.y + (b.y - a.y) * t };
  };
  const ease = (t: number) => {
    const v = clamp(t, 0, 1);
    return v * v * (3 - 2 * v);
  };
  const endWeights = (z: number) => [
    ease((front + 0.45 - z) / 0.45),
    ease((z - (rear - 0.45)) / 0.45),
  ];
  const sillAt = (z: number) => contour.sill + (contour.endLift ?? 0) * Math.max(...endWeights(z));
  const finish = ([x, y, z]: Point): Point => {
    const [nose, tail] = endWeights(z);
    const corner = (x / sample(z).width) ** 4;
    const lower = clamp((0.55 - y) / 0.34, 0, 1) ** 2;
    return [
      x,
      y,
      z +
        corner * ((contour.noseRound ?? 0) * nose - (contour.tailRound ?? 0) * tail) +
        (contour.valanceTuck ?? 0) * lower * (nose - tail),
    ];
  };
  const topPoint = (z: number, u: number): Point => {
    const section = sample(z);
    const edge = clamp((Math.abs(u) - contour.shoulderStart) / (1 - contour.shoulderStart), 0, 1);
    // A quarter ellipse meets the vertical side tangentially; it is not a chamfer.
    const roll = 1 - Math.sqrt(Math.max(0, 1 - edge * edge));
    return finish([
      u * section.width,
      section.y - contour.crown * u * u - contour.shoulder * roll,
      z,
    ]);
  };
  const sidePoint = (z: number, y: number, side = 1): Point => {
    const section = sample(z);
    const shoulderY = topPoint(z, 1)[1];
    const sill = sillAt(z);
    const height = clamp((y - sill) / (shoulderY - sill), 0, 1);
    return finish([side * (section.width - contour.tuck * (1 - height) ** 2), y, z]);
  };
  const lowerAt = (z: number) => {
    let lower = sillAt(z);
    for (const axle of axles) {
      const distance = Math.abs(z - axle);
      if (distance <= contour.archRadius)
        lower = Math.max(
          lower,
          wheelHeight + Math.sqrt(Math.max(0, contour.archRadius ** 2 - distance ** 2)),
        );
    }
    return lower;
  };
  const rows = new Set(belt.map((section) => section.z));
  const steps = Math.ceil((rear - front) / 0.14);
  for (let i = 0; i <= steps; i++) rows.add(front + ((rear - front) * i) / steps);
  for (const axle of axles) {
    for (let i = 0; i <= 24; i++)
      rows.add(axle - Math.cos((i * Math.PI) / 24) * contour.archRadius);
    // Both sides of each upright arch edge preserve the opening down to the sill.
    rows.add(axle - contour.archRadius - 0.00001);
    rows.add(axle + contour.archRadius + 0.00001);
  }
  return {
    topPoint,
    sidePoint,
    lowerAt,
    finish,
    rows: [...rows].filter((z) => z >= front && z <= rear).sort((a, b) => a - b),
  };
}

/** Analytic-surface normals avoid shading seams between separately batched skin strips. */
function normalAt(
  point: (z: number, u: number) => Point,
  z: number,
  u: number,
  direction = 1,
): Point {
  const e = 0.00001;
  const a = point(z + e, u),
    b = point(z - e, u);
  const c = point(z, u + e),
    d = point(z, u - e);
  const dz = a.map((value, i) => value - b[i]);
  const du = c.map((value, i) => value - d[i]);
  const n = [
    dz[1] * du[2] - dz[2] * du[1],
    dz[2] * du[0] - dz[0] * du[2],
    dz[0] * du[1] - dz[1] * du[0],
  ];
  const length = Math.hypot(...n) || 1;
  return n.map((value) => (value * direction) / length) as Point;
}

export function buildBodyContour(ctx: VehicleBuilder, belt: Section[], options: BodyContour) {
  const skin = bodyContour(belt, [-ctx.axles.front, ctx.axles.rear], ctx.spec.tireRadius, options);
  const edges = [
    0,
    0.45,
    0.72,
    options.shoulderStart,
    ...[0.35, 0.65, 0.86, 0.97, 1].map(
      (t) => options.shoulderStart + (1 - options.shoulderStart) * t,
    ),
  ];
  const across = [...new Set([...edges.map((u) => -u), ...edges])].sort((a, b) => a - b);
  ctx.surface(skin.rows, across, skin.topPoint, ctx.materials.paint, (z, u) =>
    normalAt((z, u) => skin.topPoint(z, clamp(u, -1, 1)), z, u),
  );
  for (const side of [-1, 1]) {
    const point = (z: number, v: number): Point => {
      const lower = skin.lowerAt(z);
      return skin.sidePoint(z, lower + (skin.topPoint(z, 1)[1] - lower) * v, side);
    };
    // Mirroring positions also reverses the surface orientation. Reverse the right
    // grid's winding so its facet normals agree with the outward smooth normals.
    const levels = [0, 0.2, 0.45, 0.7, 0.9, 1];
    if (side > 0) levels.reverse();
    ctx.surface(skin.rows, levels, point, ctx.materials.paint, (z, v) =>
      // Differentiate the sheet metal at a fixed height, not the cutout boundary:
      // the abrupt lower edge of an arch must not bend the lighting normals.
      normalAt((z, y) => skin.sidePoint(z, y, side), z, point(z, v)[1], -side),
    );
  }
  for (const z of [belt[0].z, belt.at(-1)!.z]) {
    ctx.surface(
      [0, 0.3, 0.65, 1],
      across,
      (v, u) => {
        const lower = skin.lowerAt(z);
        const y = lower + (skin.topPoint(z, u)[1] - lower) * v;
        const width = skin.sidePoint(z, lower + (skin.topPoint(z, 1)[1] - lower) * v)[0];
        return skin.finish([u * width, y, z]);
      },
      ctx.materials.paint,
    );
  }
  return skin;
}
