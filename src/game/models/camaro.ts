import * as THREE from 'three';
import type { Point, VehicleBuilder } from '../vehicle-builder';
import { muscleBody } from './muscle-common';

/** 1969 SS non-RS: exposed round headlights, pinched waist, separate rear deck. */
export function buildCamaro(ctx: VehicleBuilder) {
  const { spec, box, surface } = ctx;
  const { paint, alloy, dark, light, brakeLights, clearLens } = ctx.materials;
  const amber = ctx.material('#d49543', 0.35);
  const front = -spec.length / 2 + 0.065,
    rear = spec.length / 2 - 0.075,
    half = spec.width / 2;
  const { skin, trim, disc } = muscleBody(
    ctx,
    [
      { z: front, width: half * 0.94, y: 0.875 },
      { z: -1.85, width: half * 0.986, y: 0.944 },
      { z: -1.43, width: half * 0.995, y: 0.972 },
      { z: -0.76, width: half * 0.958, y: 0.945 },
      { z: 0.45, width: half * 0.961, y: 0.948 },
      { z: 1.18, width: half, y: 1.01 },
      { z: 1.75, width: half * 0.998, y: 1.005 },
      { z: rear, width: half * 0.951, y: 0.917 },
    ],
    [
      { z: -0.8, width: 0.831, y: 0.942 },
      { z: -0.3, width: 0.692, y: spec.height - 0.025 },
      { z: -0.06, width: 0.699, y: spec.height },
      { z: 0.6, width: 0.694, y: spec.height - 0.006 },
      { z: 0.77, width: 0.711, y: spec.height - 0.043 },
      { z: 1.48, width: 0.824, y: 1.005 },
    ],
    [-0.745, -0.318],
    [0.824, 1.405],
    [
      [-0.676, 0.33],
      [0.361, 0.973],
    ],
  );

  // Full-width inset grille, bright surround and two exposed sealed beams (not RS doors).
  box(1.749, 0.281, 0.029, 0, 0.719, front - 0.013, alloy);
  box(1.717, 0.252, 0.036, 0, 0.72, front - 0.028, dark);
  for (let y = 0.625; y < 0.824; y += 0.028) box(1.26, 0.004, 0.006, 0, y, front - 0.049, alloy);
  for (let x = -0.58; x <= 0.59; x += 0.055) box(0.004, 0.216, 0.005, x, 0.72, front - 0.05, dark);
  for (const side of [-1, 1]) {
    disc(side * 0.701, 0.722, front - 0.049, 0.111, alloy);
    disc(side * 0.701, 0.722, front - 0.053, 0.094, light);
    box(
      0.118,
      0.046,
      0.025,
      side * 0.68,
      0.437,
      skin.finish([side * 0.68, 0.437, front])[2] - 0.012,
      amber,
    );
    // SS hood's two decorative raised vent panels; no Z/28 racing stripes.
    surface(
      [-1.49, -1.46, -1.17, -1.13],
      [side * 0.31, side * 0.45],
      (z, u) => {
        const p = skin.topPoint(z, u);
        p[1] += 0.016;
        return p;
      },
      alloy,
    );
    for (let z = -1.435; z < -1.16; z += 0.043)
      surface(
        [z, z + 0.017],
        [side * 0.325, side * 0.435],
        (z, u) => {
          const p = skin.topPoint(z, u);
          p[1] += 0.019;
          return p;
        },
        dark,
      );
    // Three stamped rear-quarter gills ahead of the rear wheel.
    for (const z of [0.72, 0.8, 0.88])
      trim(
        [0.39, 0.52, 0.65].map((y) => {
          const p = skin.sidePoint(z + (0.65 - y) * 0.22, y, side);
          p[0] += side * 0.009;
          return p;
        }),
        0.014,
        dark,
      );
    // The SS hockey-stick stripe follows the fender shoulder and turns down near the nose.
    surface(
      [front + 0.085, -1.98, -1.45, -0.75, 0.4],
      [0, 1],
      (z, v) => {
        const p = skin.sidePoint(z, skin.topPoint(z, 1)[1] - 0.035 - v * 0.017, side);
        p[0] += side * 0.006;
        return p;
      },
      dark,
    );
    surface(
      [front + 0.083, front + 0.145],
      [0.49, 0.55, 0.62, 0.69, 0.75, 0.785],
      (z, y) => {
        const p = skin.sidePoint(z, y, side);
        p[0] += side * 0.007;
        return p;
      },
      dark,
    );
    for (const [z, mat] of [
      [-2.16, amber],
      [2.11, brakeLights],
    ] as const) {
      const p = skin.sidePoint(z, 0.514, side);
      box(0.019, 0.029, 0.109, p[0] + side * 0.007, p[1], z, alloy);
      box(0.022, 0.018, 0.085, p[0] + side * 0.008, p[1], z, mat);
    }
  }
  box(1.795, 0.067, 0.109, 0, 0.56, front - 0.009, alloy);
  box(1.76, 0.058, 0.125, 0, 0.499, rear + 0.012, alloy);
  box(1.715, 0.261, 0.035, 0, 0.711, rear + 0.004, dark);
  for (const side of [-1, 1]) {
    box(0.527, 0.148, 0.023, side * 0.552, 0.718, rear + 0.027, alloy);
    box(0.503, 0.123, 0.025, side * 0.552, 0.718, rear + 0.035, dark);
    for (const offset of [-0.169, 0, 0.169]) {
      box(0.157, 0.107, 0.025, side * 0.552 + offset, 0.718, rear + 0.04, brakeLights);
      if (offset === 0) box(0.061, 0.037, 0.007, side * 0.552, 0.724, rear + 0.056, clearLens);
    }
    box(0.048, 0.146, 0.034, side * 0.339, 0.462, rear + 0.041, alloy);
  }
  // A small, integrated deck spoiler, never the tall wing of a modern race car.
  surface(
    [rear - 0.23, rear - 0.065, rear - 0.03],
    [-1, -0.7, 0, 0.7, 1],
    (z, u): Point => {
      const t = (z - (rear - 0.23)) / 0.2;
      return [u * (0.87 - 0.02 * t), 0.974 + t * 0.055 - Math.abs(u) * 0.012, z];
    },
    paint,
  );
  box(1.692, 0.025, 0.032, 0, 1.017, rear - 0.026, paint);
  // The badge canvas includes transparent side margins; size the visible lettering.
  ctx.badge('SS', 0.44, 0.105, 0, 0.721, front - 0.058);
  ctx.badge('SS', 0.44, 0.105, 0, 0.716, rear + 0.027);
  ctx.badge('chillhill', 0.292, 0.137, 0, 0.385, skin.finish([0, 0.385, rear])[2] + 0.023, true);
  // A quiet center hood crease catches the garage light.
  surface(
    [front + 0.13, -1.8, -1.2, -0.88],
    [-0.008, 0.008],
    (z, u) => {
      const p = skin.topPoint(z, u);
      p[1] += 0.005;
      return p;
    },
    paint,
  );
}
