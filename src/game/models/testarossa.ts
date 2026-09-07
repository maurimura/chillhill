import * as THREE from 'three';
import type { Point, VehicleBuilder } from '../vehicle-builder';

/** Early Testarossa body with custom twin mirrors, wide hips and horizontal side strakes. */
export function buildTestarossa(ctx: VehicleBuilder) {
  const { spec, axles, roundness, box, add, panel, surface, sample, roundedSections, badge } = ctx;
  const { paint, dark, glass, alloy, light, brakeLights, clearLens, gold } = ctx.materials;
  const front = -spec.length / 2,
    rear = spec.length / 2;
  const amber = ctx.material('#d3882f', 0.35);
  const belt = roundedSections(
    [
      { z: front, width: 0.78, y: 0.43 },
      { z: -2.08, width: 0.86, y: 0.49 },
      { z: -1.57, width: 0.887, y: 0.68 },
      { z: -1.19, width: 0.89, y: 0.705 },
      { z: -0.79, width: 0.873, y: 0.71 },
      { z: -0.15, width: 0.875, y: 0.73 },
      { z: 0.77, width: 0.985, y: 0.765 },
      { z: 1.33, width: 0.988, y: 0.785 },
      { z: 1.92, width: 0.972, y: 0.77 },
      { z: rear, width: 0.948, y: 0.745 },
    ],
    roundness * 0.5,
  );
  const zs = belt.map((p) => p.z);
  const topPoint = (z: number, u: number): Point => {
    const p = sample(belt, z);
    const dip = z < -0.8 ? 0.035 : z > 0.7 ? 0.025 : 0;
    return [u * p.width, p.y - dip * (1 - Math.abs(u)), z];
  };
  surface(zs, [-1, -0.8, 0, 0.8, 1], topPoint, paint);
  for (const side of [-1, 1]) {
    // Narrow longitudinal strips follow the concave waist. A single triangulated
    // outline bridges that concavity and incorrectly buries the door strakes.
    const sideRows = [
      ...new Set([
        ...zs,
        ...Array.from({ length: 121 }, (_, i) => front + (spec.length * i) / 120),
      ]),
    ].sort((a, b) => a - b);
    surface(
      sideRows,
      [0, 1],
      (z, u) => {
        let bottom = 0.19;
        for (const [axle, radius] of [
          [-axles.front, spec.tireRadius],
          [axles.rear, spec.rearTireRadius ?? spec.tireRadius],
        ]) {
          const arch = radius + 0.032,
            distance = Math.abs(z - axle);
          if (distance < arch)
            bottom = radius + 0.01 + Math.sqrt(arch * arch - distance * distance);
        }
        const p = sample(belt, z);
        return [side * p.width, THREE.MathUtils.lerp(bottom, p.y, u), z];
      },
      paint,
    );
    const intakeRows = [-0.77, ...zs.filter((z) => z > -0.77 && z < 0.94), 0.94];
    // Full-length ribbed intakes; a recessed dark opening behind paint-colored blades.
    surface(
      intakeRows,
      [0, 1],
      (z, u) => [side * (sample(belt, z).width + 0.004), THREE.MathUtils.lerp(0.27, 0.655, u), z],
      dark,
    );
    for (let rib = 0; rib < 5; rib++) {
      const y = 0.305 + rib * 0.071;
      surface(
        intakeRows,
        [0, 1],
        (z, u) => [side * (sample(belt, z).width + 0.012), y + u * 0.025, z],
        paint,
      );
    }
    box(0.035, 0.085, 1.75, side * 0.872, 0.215, 0.04, dark);
    box(0.022, 0.025, 0.13, side * 0.914, 0.7, 0.24, alloy);
    // Shut line at the rear of the door, visibly separate from the air intake.
    box(0.016, 0.445, 0.009, side * 0.932, 0.47, 0.46, dark);
    box(0.025, 0.045, 0.11, side * 0.88, 0.56, -1.73, amber);
  }
  for (const z of [front, rear]) {
    const p = sample(belt, z);
    panel(
      [
        [-p.width, 0.19, z],
        [p.width, 0.19, z],
        [p.width, p.y, z],
        [-p.width, p.y, z],
      ],
      paint,
    );
  }
  // Thin black belt line and squared, low chin; not a 512 TR's later rounded nose.
  box(1.56, 0.045, 0.055, 0, 0.195, front + 0.01, dark);
  box(1.15, 0.092, 0.018, 0, 0.29, front - 0.008, dark);
  for (const side of [-1, 1]) {
    box(0.36, 0.075, 0.025, side * 0.57, 0.38, front - 0.013, clearLens);
    box(0.075, 0.075, 0.028, side * 0.744, 0.38, front - 0.015, amber);
    // Flush pop-up headlamp covers preserve the unbroken wedge in the garage.
    const lid = surface(
      [-1.96, -1.56],
      [0, 1],
      (z, u) => {
        const x = side * THREE.MathUtils.lerp(0.43, 0.79, u);
        return [x, topPoint(z, x / sample(belt, z).width)[1] + 0.005, z];
      },
      dark,
    );
    lid.name = 'popup-headlamp-outline';
    surface(
      [-1.945, -1.575],
      [0, 1],
      (z, u) => {
        const x = side * THREE.MathUtils.lerp(0.446, 0.775, u);
        return [x, topPoint(z, x / sample(belt, z).width)[1] + 0.009, z];
      },
      paint,
    );
    box(0.29, 0.044, 0.03, side * 0.55, 0.28, front - 0.019, light);
  }
  const crest = box(0.046, 0.008, 0.066, 0, topPoint(-2.02, 0)[1] + 0.008, -2.02, gold);
  crest.name = 'nose-crest';

  const cabin = roundedSections(
    [
      { z: -0.88, width: 0.716, y: 0.713 },
      { z: -0.11, width: 0.588, y: 1.108 },
      { z: 0.19, width: 0.593, y: 1.13 },
      { z: 0.58, width: 0.61, y: 1.115 },
      { z: 0.98, width: 0.694, y: 0.83 },
    ],
    roundness * 0.45,
  );
  const rows = cabin.map((p) => p.z);
  const roof = (z: number, u: number): Point => {
    const p = sample(cabin, z);
    return [u * p.width, p.y - 0.022 * u * u, z];
  };
  surface(rows, [-1, -0.7, 0, 0.7, 1], roof, paint);
  surface(
    [-0.81, -0.4, -0.16],
    [-0.93, 0, 0.93],
    (z, u) => {
      const p = roof(z, u);
      p[1] += 0.007;
      return p;
    },
    glass,
  );
  for (const side of [-1, 1]) {
    const sidePoint = (z: number, u: number, out = 0): Point => {
      const p = sample(cabin, z);
      return [
        side * (THREE.MathUtils.lerp(0.747, p.width, u) + out),
        THREE.MathUtils.lerp(0.742, p.y - 0.022, u),
        z,
      ];
    };
    surface(rows, [0, 1], (z, u) => sidePoint(z, u), paint);
    for (const [a, b] of [
      [-0.73, -0.43],
      [-0.395, 0.47],
      [0.53, 0.8],
    ]) {
      surface(
        [a, ...rows.filter((z) => z > a && z < b), b],
        [0.065, 0.91],
        (z, u) => sidePoint(z, u, 0.007),
        glass,
      );
    }
    // Broad flying buttresses frame a nearly upright rear window and louvred deck.
    panel(
      [
        [side * 0.61, 1.106, 0.56],
        [side * 0.93, 0.767, 2.12],
        [side * 0.74, 0.768, 1.01],
      ],
      paint,
    );
    panel(
      [
        [side * 0.61, 1.106, 0.56],
        [side * 0.71, 0.769, 0.98],
        [side * 0.93, 0.767, 2.12],
      ],
      paint,
    );
  }
  surface(
    [0.66, ...rows.filter((z) => z > 0.66 && z < 0.94), 0.94],
    [-0.86, 0, 0.86],
    (z, u) => {
      const p = roof(z, u);
      p[1] += 0.009;
      return p;
    },
    glass,
  );
  // Louvres across the long engine cover; keep the rear window visually separate.
  box(1.28, 0.016, 1.12, 0, 0.762, 1.58, dark);
  for (let i = 0; i < 12; i++) box(1.27, 0.013, 0.031, 0, 0.776, 1.085 + i * 0.088, paint);
  // Keep the early high housing, mirrored on both sides by request.
  for (const side of [-1, 1]) {
    const name = `mirror-${side < 0 ? 'driver' : 'passenger'}`;
    const arm = box(0.24, 0.038, 0.035, side * 0.81, 0.91, -0.4, paint);
    arm.name = `${name}-arm`;
    arm.rotation.z = side * 0.25;
    box(0.2, 0.092, 0.145, side * 0.93, 0.945, -0.4, paint).name = name;
    box(0.15, 0.058, 0.011, side * 0.947, 0.945, -0.321, alloy).name = `${name}-glass`;
  }

  // The original Testarossa has rectangular lamps behind a full-width black grille.
  box(1.835, 0.246, 0.018, 0, 0.568, rear + 0.004, dark);
  for (const side of [-1, 1]) {
    box(0.46, 0.177, 0.018, side * 0.603, 0.577, rear + 0.016, brakeLights);
    box(0.115, 0.177, 0.02, side * 0.795, 0.577, rear + 0.021, amber);
    for (const x of [0.62, 0.75]) {
      const exhaust = add(new THREE.CylinderGeometry(0.034, 0.034, 0.17, 12), alloy);
      exhaust.rotation.x = Math.PI / 2;
      exhaust.position.set(side * x, 0.224, rear - 0.014);
      const end = add(new THREE.CircleGeometry(0.026, 12), dark);
      end.position.set(side * x, 0.224, rear + 0.073);
    }
  }
  for (let i = 0; i < 6; i++) box(1.84, 0.018, 0.025, 0, 0.459 + i * 0.043, rear + 0.035, dark);
  box(1.87, 0.085, 0.076, 0, 0.33, rear - 0.006, dark);
  badge('testarossa', 0.31, 0.045, -0.56, 0.724, rear + 0.015);
  badge('chillhill', 0.33, 0.075, 0, 0.337, rear + 0.035, true);
}
