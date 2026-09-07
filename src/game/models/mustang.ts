import * as THREE from 'three';
import type { Point, VehicleBuilder } from '../vehicle-builder';
import { muscleBody } from './muscle-common';

/** 1967 2+2 fastback: long falling roof, quarter louvers and three vertical lamps per side. */
export function buildMustang(ctx: VehicleBuilder) {
  const { spec, add, box, panel, surface } = ctx;
  const { paint, alloy, dark, light, brakeLights, clearLens } = ctx.materials;
  const front = -spec.length / 2 + 0.06,
    rear = spec.length / 2 - 0.06,
    half = spec.width / 2;
  const { skin, sidePoint, trim, disc } = muscleBody(
    ctx,
    [
      { z: front, width: half * 0.948, y: 0.903 },
      { z: -1.95, width: half * 0.987, y: 0.956 },
      { z: -1.5, width: half, y: 0.983 },
      { z: -0.72, width: half * 0.964, y: 0.952 },
      { z: 0.43, width: half * 0.958, y: 0.938 },
      { z: 1.11, width: half, y: 0.974 },
      { z: 1.67, width: half * 0.983, y: 0.978 },
      { z: rear, width: half * 0.943, y: 0.906 },
    ],
    [
      { z: -0.79, width: 0.804, y: 0.946 },
      { z: -0.31, width: 0.671, y: spec.height - 0.027 },
      { z: -0.055, width: 0.678, y: spec.height },
      { z: 0.49, width: 0.677, y: spec.height - 0.016 },
      { z: 0.86, width: 0.707, y: 1.236 },
      { z: 1.39, width: 0.748, y: 1.102 },
      { z: 1.94, width: 0.795, y: 0.959 },
    ],
    [-0.735, -0.328],
    [0.94, 1.856],
    [[-0.665, 0.55]],
  );

  // Chrome trapezoid around a dark recessed grille; lamps remain in painted buckets.
  const grille = (w: number, lo: number, hi: number, z: number, mat: THREE.Material) =>
    panel(
      [
        [-w, lo, z],
        [w, lo, z],
        [w * 1.065, hi, z],
        [-w * 1.065, hi, z],
      ],
      mat,
    );
  grille(0.548, 0.571, 0.864, front - 0.022, alloy);
  grille(0.531, 0.586, 0.848, front - 0.026, dark);
  for (const side of [-1, 1]) {
    disc(side * 0.718, 0.726, front - 0.022, 0.115, alloy);
    disc(side * 0.718, 0.726, front - 0.026, 0.097, light);
    const turnZ = skin.finish([side * 0.583, 0.38, front])[2];
    disc(side * 0.583, 0.38, turnZ - 0.013, 0.055, dark);
    disc(side * 0.583, 0.38, turnZ - 0.016, 0.041, clearLens);
    // Twin simulated body-side scoops, unique to this 1967 body rather than Shelby intakes.
    for (const [lo, hi] of [
      [0.403, 0.503],
      [0.55, 0.654],
    ]) {
      surface(
        [0.624, 0.676, 0.805, 0.843],
        [lo, (lo + hi) / 2, hi],
        (z, y) => {
          const p = skin.sidePoint(z, y, side);
          p[0] += side * 0.012;
          return p;
        },
        dark,
      );
      for (let y = lo + 0.019; y < hi; y += 0.024)
        trim(
          [0.637, 0.83].map((z) => {
            const p = skin.sidePoint(z, y, side);
            p[0] += side * 0.018;
            return p;
          }),
          0.006,
          paint,
        );
    }
    // Roof-quarter louver ribs on the solid sail panel (not a second side window).
    for (let i = 0; i < 10; i++) {
      const z = 0.663 + i * 0.048;
      const top = 0.88 - i * 0.021;
      surface([z, z + 0.019], [0.235, top], (z, v) => sidePoint(z, v, side, 0.015), dark);
      trim(
        [sidePoint(z + 0.024, 0.225, side, 0.019), sidePoint(z + 0.024, top + 0.02, side, 0.019)],
        0.006,
        paint,
      );
    }
    // Door vent-window divider and the hood's two small turn-indicator recesses.
    surface([-0.477, -0.46], [0.065, 0.937], (z, v) => sidePoint(z, v, side, 0.018), alloy);
    surface(
      [-1.78, -1.65, -1.51],
      [side * 0.32, side * 0.455],
      (z, u) => {
        const p = skin.topPoint(z, u);
        p[1] += 0.012;
        return p;
      },
      paint,
    );
    surface(
      [-1.617, -1.579],
      [side * 0.352, side * 0.43],
      (z, u) => {
        const p = skin.topPoint(z, u);
        p[1] += 0.016;
        return p;
      },
      dark,
    );
  }
  box(1.776, 0.06, 0.107, 0, 0.525, front - 0.006, alloy);
  box(1.744, 0.071, 0.109, 0, 0.475, rear + 0.005, alloy);
  // Concave rear panel and six individual upright lamps. No later-model full-width bar.
  const tailZ = (x: number) => rear + 0.012 + (x / half) ** 2 * 0.035;
  surface(
    [0.545, 0.59, 0.8, 0.855],
    [-1, -0.85, -0.6, -0.3, 0, 0.3, 0.6, 0.85, 1],
    (y, u): Point => [u * 0.839, y, tailZ(u * 0.839)],
    paint,
  );
  for (const side of [-1, 1]) {
    for (const xx of [0.441, 0.578, 0.715]) {
      const x = side * xx;
      box(0.104, 0.239, 0.024, x, 0.704, tailZ(x) + 0.018, alloy);
      box(0.077, 0.211, 0.022, x, 0.704, tailZ(x) + 0.035, brakeLights);
    }
    const reverseZ = skin.finish([side * 0.505, 0.358, rear])[2];
    disc(side * 0.505, 0.358, reverseZ + 0.014, 0.044, alloy);
    disc(side * 0.505, 0.358, reverseZ + 0.018, 0.034, clearLens);
  }
  disc(0, 0.713, rear + 0.03, 0.082, alloy);
  disc(0, 0.713, rear + 0.034, 0.065, dark);
  // Original simplified running-horse silhouette inside the grille corral.
  box(0.245, 0.133, 0.009, 0, 0.719, front - 0.034, alloy);
  box(0.228, 0.117, 0.011, 0, 0.719, front - 0.042, dark);
  box(1.032, 0.007, 0.006, 0, 0.714, front - 0.034, alloy);
  const horse = new THREE.Shape();
  horse.moveTo(-0.087, 0.023);
  horse.lineTo(-0.068, 0.039);
  horse.lineTo(-0.027, 0.032);
  horse.lineTo(0.026, 0.035);
  horse.lineTo(0.047, 0.06);
  horse.lineTo(0.064, 0.06);
  horse.lineTo(0.089, 0.036);
  horse.lineTo(0.067, 0.032);
  horse.lineTo(0.044, 0.012);
  horse.lineTo(0.075, -0.014);
  horse.lineTo(0.099, -0.023);
  horse.lineTo(0.094, -0.031);
  horse.lineTo(0.058, -0.02);
  horse.lineTo(0.023, 0);
  horse.lineTo(-0.011, -0.002);
  horse.lineTo(-0.045, -0.035);
  horse.lineTo(-0.071, -0.037);
  horse.lineTo(-0.068, -0.03);
  horse.lineTo(-0.052, -0.024);
  horse.lineTo(-0.038, 0.001);
  horse.lineTo(-0.061, 0.014);
  horse.lineTo(-0.097, 0.012);
  horse.closePath();
  const emblem = add(new THREE.ShapeGeometry(horse), alloy);
  emblem.position.set(0, 0.714, front - 0.052);
  emblem.rotation.y = Math.PI;
  ctx.badge('chillhill', 0.29, 0.134, 0, 0.364, skin.finish([0, 0.364, rear])[2] + 0.024, true);
  ctx.badge('F O R D', 0.272, 0.035, 0, 0.902, front - 0.005);
}
