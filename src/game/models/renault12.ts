import * as THREE from 'three';
import type { Point, VehicleBuilder } from '../vehicle-builder';
import { buildBodyContour } from '../vehicle-surfaces';

/** Early R12: tall glasshouse, long hood and gently falling arrow-line tail. */
export function buildRenault12(ctx: VehicleBuilder): void {
  const { spec, axles, roundness, add, box, panel, surface, sample, roundedSections } = ctx;
  const { paint, dark, glass, rubber, alloy, light, brakeLights, clearLens } = ctx.materials;
  const amber = ctx.material('#d79c47', 0.35);
  const seam = ctx.material('#646058');
  const front = -spec.length / 2 + 0.09;
  const rear = spec.length / 2 - 0.085;
  const half = spec.width / 2;
  const belt = roundedSections(
    [
      { z: front, width: half * 0.94, y: 0.8 },
      { z: front + 0.22, width: half * 0.99, y: 0.84 },
      { z: -1.22, width: half, y: 0.905 },
      { z: -0.8, width: half, y: 0.935 },
      { z: 0.92, width: half, y: 0.945 },
      { z: 1.44, width: half * 0.995, y: 0.945 },
      { z: rear, width: half * 0.935, y: 0.825 },
    ],
    0.18 + roundness * 0.65,
  );

  // A restrained rolled shoulder keeps the period straight waistline, without slab sides.
  const skin = buildBodyContour(ctx, belt, {
    crown: 0.005 + roundness * 0.009,
    shoulder: 0.035 + roundness * 0.022,
    shoulderStart: 0.89,
    sill: 0.225,
    tuck: 0.012 + roundness * 0.02,
    archRadius: spec.tireRadius + 0.042,
  });
  for (const side of [-1, 1]) {
    for (const z of [-axles.front, axles.rear]) {
      const radius = spec.tireRadius + 0.042;
      const curve = new THREE.CatmullRomCurve3(
        Array.from({ length: 25 }, (_, i) => {
          const angle = (i * Math.PI) / 24;
          const point = skin.sidePoint(
            z - Math.cos(angle) * radius,
            spec.tireRadius + Math.sin(angle) * radius,
            side,
          );
          point[0] += side * 0.003;
          return new THREE.Vector3(...point);
        }),
      );
      const arch = add(new THREE.TubeGeometry(curve, 24, 0.012, 4, false), paint);
      arch.name = 'rounded-fender-lip';
    }
    box(0.02, 0.055, 1.67, side * (half - 0.009), 0.254, -0.095, paint);
    // Thin chrome strip and very quiet door shut lines keep the simple four-door read.
    surface(
      belt.map((s) => s.z),
      [0, 1],
      (z, u) => [side * (sample(belt, z).width + 0.006), sample(belt, z).y - 0.17 + u * 0.014, z],
      alloy,
    );
    for (const z of [-0.82, 0.2]) box(0.009, 0.62, 0.008, side * (half + 0.006), 0.568, z, seam);
    panel(
      [
        [side * (half + 0.007), 0.921, 1.015],
        [side * (half + 0.007), 0.921, 1.023],
        [side * (half + 0.007), 0.665, 0.925],
        [side * (half + 0.007), 0.665, 0.917],
      ],
      seam,
    );
    for (const z of [0.065, 0.88]) {
      box(0.03, 0.029, 0.145, side * (half + 0.015), 0.868, z, alloy);
      box(0.035, 0.022, 0.025, side * (half + 0.016), 0.855, z + 0.065, dark);
    }
  }
  // A narrow underfloor stays inboard of the tires rather than filling the arches.
  box(1.1, 0.09, 3.7, 0, 0.23, 0, dark);

  const cabin = roundedSections(
    [
      { z: -0.86, width: 0.746, y: 0.932 },
      { z: -0.35, width: 0.655, y: spec.height - 0.026 },
      { z: -0.12, width: 0.655, y: spec.height },
      { z: 0.66, width: 0.651, y: spec.height - 0.005 },
      { z: 0.79, width: 0.66, y: spec.height - 0.046 },
      { z: 1.4, width: 0.745, y: 0.947 },
    ],
    0.2 + roundness * 0.65,
  );
  const rows = cabin.map((s) => s.z);
  const rowsBetween = (start: number, end: number) => [
    start,
    ...rows.filter((z) => z > start && z < end),
    end,
  ];
  const roofCrown = 0.025 + roundness * 0.025;
  const roofPoint = (z: number, u: number): Point => {
    const s = sample(cabin, z);
    return [u * s.width, s.y - u * u * roofCrown, z];
  };
  surface(rows, [-1, -0.88, -0.65, -0.35, 0, 0.35, 0.65, 0.88, 1], roofPoint, paint);
  const roofGlass = (
    start: number,
    end: number,
    inset: number,
    mat: THREE.Material,
    lift: number,
  ) => {
    surface(
      rowsBetween(start, end),
      [-inset, -0.6, 0, 0.6, inset],
      (z, u) => {
        const point = roofPoint(z, u);
        point[1] += lift;
        return point;
      },
      mat,
    );
  };
  // Chrome surrounds outside black rubber gaskets, with thin period A/C pillars.
  for (const [start, end] of [
    [-0.815, -0.375],
    [0.825, 1.33],
  ]) {
    roofGlass(start, end, 0.955, alloy, 0.007);
    roofGlass(start + 0.012, end - 0.012, 0.943, rubber, 0.01);
    roofGlass(start + 0.026, end - 0.026, 0.916, glass, 0.014);
  }
  for (const side of [-1, 1]) {
    const sidePoint = (z: number, y: number, lift = 0): Point => {
      const c = sample(cabin, z);
      const base = sample(belt, z).y - 0.007;
      const t = THREE.MathUtils.clamp((y - base) / Math.max(0.005, c.y - roofCrown - base), 0, 1);
      return [
        side *
          (THREE.MathUtils.lerp(0.765, c.width, t) +
            Math.sin(t * Math.PI) * 0.008 * roundness +
            lift),
        y,
        z,
      ];
    };
    surface(
      rows,
      [0, 0.25, 0.5, 0.75, 1],
      (z, u) =>
        sidePoint(
          z,
          THREE.MathUtils.lerp(sample(belt, z).y - 0.007, sample(cabin, z).y - roofCrown, u),
        ),
      paint,
    );
    const sideWindow = (start: number, end: number) => {
      const window = (
        a: number,
        b: number,
        bottom: number,
        top: number,
        mat: THREE.Material,
        lift: number,
      ) => {
        surface(
          rowsBetween(a, b),
          [0, 0.25, 0.5, 0.75, 1],
          (z, u) => {
            const base = sample(belt, z).y + bottom;
            return sidePoint(
              z,
              THREE.MathUtils.lerp(
                base,
                Math.max(base + 0.008, sample(cabin, z).y - top - (roofCrown - 0.02)),
                u,
              ),
              lift,
            );
          },
          mat,
        );
      };
      window(start, end, 0.018, 0.041, alloy, 0.006);
      window(start + 0.011, end - 0.011, 0.029, 0.051, rubber, 0.009);
      window(start + 0.022, end - 0.022, 0.041, 0.062, glass, 0.012);
    };
    sideWindow(-0.73, 0.165);
    sideWindow(0.232, 0.95);
    // Fixed quarterlight and the original vertical rear-pillar ventilation slot.
    surface(
      [-0.59, -0.58],
      [0, 1],
      (z, u) =>
        sidePoint(
          z,
          THREE.MathUtils.lerp(sample(belt, z).y + 0.04, sample(cabin, z).y - 0.06, u),
          0.016,
        ),
      alloy,
    );
    panel(
      [
        sidePoint(1.0, 1.225, 0.037),
        sidePoint(1.06, 1.19, 0.037),
        sidePoint(1.22, 1.0, 0.037),
        sidePoint(1.16, 1.035, 0.037),
      ],
      alloy,
    );
    panel(
      [
        sidePoint(1.018, 1.2, 0.04),
        sidePoint(1.05, 1.183, 0.04),
        sidePoint(1.201, 1.024, 0.04),
        sidePoint(1.17, 1.042, 0.04),
      ],
      dark,
    );
    // Chrome drip rail follows the roof; paired mirrors are a visibility-friendly game choice.
    surface(
      rowsBetween(-0.34, 0.8),
      [0, 1],
      (z, u) => sidePoint(z, sample(cabin, z).y - roofCrown - 0.003 + u * 0.008, 0.013),
      alloy,
    );
    box(0.08, 0.019, 0.033, side * 0.805, 1.013, -0.66, alloy);
    box(0.1, 0.068, 0.065, side * (spec.mirrorWidth / 2 - 0.05), 1.045, -0.64, alloy);
    box(0.076, 0.045, 0.006, side * (spec.mirrorWidth / 2 - 0.05), 1.045, -0.604, clearLens);
  }

  // Long, nearly flat bonnet with two pressed creases.
  for (const side of [-1, 1]) {
    surface(
      [front + 0.08, -0.98],
      [0, 1],
      (z, u) => [side * (0.575 + u * 0.009), sample(belt, z).y + 0.004, z],
      paint,
    );
    surface(
      [-0.776, -0.763],
      [side * 0.2, side * 0.72],
      (z, u) => {
        const point = roofPoint(z, u);
        point[1] += 0.019;
        return point;
      },
      dark,
    );
    box(0.23, 0.007, 0.028, side * 0.36, sample(belt, -0.925).y + 0.007, -0.925, dark);
  }
  box(1.47, 0.267, 0.015, 0, 0.678, front - 0.009, alloy);
  box(1.43, 0.231, 0.02, 0, 0.678, front - 0.019, dark);
  for (const y of [0.598, 0.631, 0.664, 0.697, 0.73, 0.763])
    box(0.82, 0.008, 0.013, 0, y, front - 0.032, alloy);
  for (const side of [-1, 1]) {
    // The real lamps are rounded rectangles, even at the faceted end of the art slider.
    const lampFace = (w: number, h: number, z: number, mat: THREE.Material) => {
      const r = 0.025 + roundness * 0.01;
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2 + r, -h / 2);
      shape.lineTo(w / 2 - r, -h / 2);
      shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      shape.lineTo(w / 2, h / 2 - r);
      shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
      shape.lineTo(-w / 2 + r, h / 2);
      shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
      shape.lineTo(-w / 2, -h / 2 + r);
      shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
      shape.closePath();
      const mesh = add(new THREE.ShapeGeometry(shape, roundness ? 4 : 1), mat);
      mesh.position.set(side * 0.558, 0.68, z);
    };
    lampFace(0.3, 0.21, front - 0.049, alloy);
    lampFace(0.28, 0.19, front - 0.052, dark);
    lampFace(0.264, 0.174, front - 0.056, light);
    // Slight optical ribs read as glass without requiring image textures.
    for (const x of [-0.07, 0, 0.07])
      box(0.005, 0.148, 0.005, side * 0.558 + x, 0.68, front - 0.063, clearLens);
    box(0.155, 0.057, 0.018, side * 0.584, 0.492, front - 0.052, amber);
  }
  // Renault lozenge, modelled as chrome geometry rather than a downloaded decal.
  const diamond = new THREE.Shape();
  diamond.moveTo(0, 0.067);
  diamond.lineTo(0.043, 0);
  diamond.lineTo(0, -0.067);
  diamond.lineTo(-0.043, 0);
  diamond.closePath();
  const inner = new THREE.Path();
  inner.moveTo(0, 0.046);
  inner.lineTo(-0.025, 0);
  inner.lineTo(0, -0.046);
  inner.lineTo(0.025, 0);
  inner.closePath();
  diamond.holes.push(inner);
  const emblem = add(new THREE.ShapeGeometry(diamond), alloy);
  emblem.position.set(0, 0.68, front - 0.049);
  box(0.67, 0.055, 0.012, 0, 0.458, front - 0.012, dark);
  for (const z of [-spec.length / 2 + 0.045, spec.length / 2 - 0.045]) {
    const frontBumper = z < 0;
    box(spec.width * 0.98, 0.086, 0.09, 0, 0.393, z, alloy);
    for (const side of [-1, 1]) {
      box(0.077, 0.19, 0.1, side * 0.432, 0.438, z, rubber);
      box(
        0.032,
        0.082,
        0.235,
        side * half * 0.972,
        0.393,
        z + (frontBumper ? 0.095 : -0.095),
        alloy,
      );
    }
  }
  // Broad, short early tail lamps and the separate boot leave no hatchback ambiguity.
  for (const side of [-1, 1]) {
    box(0.325, 0.155, 0.018, side * 0.575, 0.677, rear + 0.012, alloy);
    box(0.295, 0.123, 0.022, side * 0.575, 0.677, rear + 0.026, brakeLights);
    box(0.068, 0.107, 0.007, side * 0.682, 0.677, rear + 0.04, amber);
    box(0.075, 0.026, 0.009, side * 0.535, 0.652, rear + 0.041, clearLens);
  }
  box(0.012, 0.03, 0.012, 0, 0.777, rear + 0.011, alloy);
  ctx.badge('RENAULT 12', 0.35, 0.047, -0.36, 0.798, rear + 0.014);
  ctx.badge('chillhill', 0.38, 0.108, 0, 0.653, rear + 0.028, true);
  const fuelCap = add(new THREE.CylinderGeometry(0.036, 0.036, 0.01, 12), alloy);
  fuelCap.rotation.x = Math.PI / 2;
  fuelCap.position.set(0.256, 0.662, rear + 0.022);
}
