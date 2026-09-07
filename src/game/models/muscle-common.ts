import * as THREE from 'three';
import type { Point, Section, VehicleBuilder } from '../vehicle-builder';
import { buildBodyContour } from '../vehicle-surfaces';

/** Shared construction tools, not a shared silhouette: each car supplies its own sections. */
export function muscleBody(
  ctx: VehicleBuilder,
  waist: Section[],
  roof: Section[],
  windshield: [number, number],
  backlight: [number, number],
  sideWindows: [number, number][],
) {
  const { spec, axles, roundness, add, box, surface, roundedSections, sample } = ctx;
  const { paint, glass, alloy, rubber, dark, clearLens } = ctx.materials;
  const belt = roundedSections(waist, 0.16 + 0.65 * roundness);
  const cabin = roundedSections(roof, 0.2 + 0.6 * roundness);
  const skin = buildBodyContour(ctx, belt, {
    crown: 0.009 + 0.012 * roundness,
    shoulder: 0.049 + 0.034 * roundness,
    shoulderStart: 0.79,
    sill: 0.21,
    tuck: 0.105,
    archRadius: spec.tireRadius + 0.045,
    noseRound: 0.025 + 0.015 * roundness,
    tailRound: 0.018 + 0.012 * roundness,
    endLift: 0.045,
    valanceTuck: 0.12,
  });
  const trim = (points: Point[], radius = 0.006, mat: THREE.Material = alloy) => {
    const path = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    return add(
      new THREE.TubeGeometry(path, Math.max(12, points.length * 3), radius, 4, false),
      mat,
    );
  };
  const crown = 0.026 + 0.023 * roundness;
  const roofPoint = (z: number, u: number, lift = 0): Point => {
    const c = sample(cabin, z);
    return [c.width * u, c.y - u * u * crown + lift, z];
  };
  const rows = cabin.map((p) => p.z);
  const between = (a: number, b: number) => [a, ...rows.filter((z) => z > a && z < b), b];
  surface(rows, [-1, -0.85, -0.6, -0.3, 0, 0.3, 0.6, 0.85, 1], roofPoint, paint);
  for (const [a, b] of [windshield, backlight]) {
    for (const [inset, padding, lift, mat] of [
      [0.947, 0, 0.006, alloy],
      [0.93, 0.009, 0.009, rubber],
      [0.912, 0.019, 0.013, glass],
    ] as const)
      surface(
        between(a + padding, b - padding),
        [-inset, -0.6, 0, 0.6, inset],
        (z, u) => roofPoint(z, u, lift),
        mat,
      );
  }
  const sidePoint = (z: number, v: number, side: number, lift = 0): Point => {
    const c = sample(cabin, z),
      b = sample(belt, z);
    return [
      side * (THREE.MathUtils.lerp(b.width * 0.95, c.width, v) + lift),
      THREE.MathUtils.lerp(b.y - 0.012, c.y - crown, v),
      z,
    ];
  };
  for (const side of [-1, 1]) {
    surface(rows, [0, 0.25, 0.5, 0.75, 1], (z, v) => sidePoint(z, v, side), paint);
    for (const [a, b] of sideWindows) {
      for (const [pad, lo, hi, lift, mat] of [
        [0, 0.045, 0.96, 0.005, alloy],
        [0.009, 0.07, 0.935, 0.008, rubber],
        [0.02, 0.095, 0.91, 0.012, glass],
      ] as const)
        surface(
          between(a + pad, b - pad),
          [lo, 0.3, 0.6, hi],
          (z, v) => sidePoint(z, v, side, lift),
          mat,
        );
    }
    for (const z of [-axles.front, axles.rear]) {
      const radius = spec.tireRadius + 0.045;
      trim(
        Array.from({ length: 25 }, (_, i) => {
          const angle = (i * Math.PI) / 24;
          const p = skin.sidePoint(
            z - Math.cos(angle) * radius,
            spec.tireRadius + 0.01 + Math.sin(angle) * radius,
            side,
          );
          p[0] += side * 0.005;
          return p;
        }),
        0.009,
        paint,
      );
    }
    const a = -axles.front + spec.tireRadius + 0.06,
      b = axles.rear - spec.tireRadius - 0.05;
    surface(
      [a, 0, b],
      [0.235, 0.27],
      (z, y) => {
        const p = skin.sidePoint(z, y, side);
        p[0] += side * 0.009;
        return p;
      },
      alloy,
    );
    // Both mirrors are deliberate game equipment, not a claim about standard 1960s fitment.
    const mirrorX = side * (spec.mirrorWidth / 2 - 0.057);
    trim(
      [
        [side * (spec.width / 2 - 0.03), 0.958, -0.62],
        [mirrorX, 1.022, -0.64],
      ],
      0.015,
    );
    box(0.114, 0.073, 0.064, mirrorX, 1.034, -0.64, alloy);
    box(0.094, 0.052, 0.006, mirrorX, 1.034, -0.605, clearLens);
    const handle = skin.sidePoint(0.43, 0.875, side);
    box(0.03, 0.025, 0.143, handle[0] + side * 0.011, handle[1], handle[2], alloy);
    // Door cuts follow the tapered body surface instead of floating at maximum width.
    for (const z of [-0.72, 0.59])
      trim(
        [0.29, 0.52, 0.74, 0.9].map((y) => {
          const p = skin.sidePoint(z, y, side);
          p[0] += side * 0.004;
          return p;
        }),
        0.002,
        dark,
      );
  }
  box(1.18, 0.06, spec.length - 1.0, 0, 0.215, 0, dark);
  for (const side of [-1, 1]) {
    const [a, b] = windshield;
    const z = a + (b - a) * 0.085;
    trim([roofPoint(z, side * 0.64, 0.018), roofPoint(z + 0.018, side * 0.13, 0.02)], 0.006, dark);
    const exhaust = add(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 12), alloy);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(side * 0.57, 0.24, spec.length / 2 - 0.28);
    const opening = add(new THREE.CircleGeometry(0.029, 12), dark);
    opening.position.set(side * 0.57, 0.24, spec.length / 2 - 0.003);
  }
  const disc = (x: number, y: number, z: number, r: number, mat: THREE.Material) => {
    const mesh = add(new THREE.CircleGeometry(r, roundness === 0 ? 16 : 32), mat);
    mesh.position.set(x, y, z);
    return mesh;
  };
  return { skin, belt, cabin, roofPoint, sidePoint, trim, disc };
}
