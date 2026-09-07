import * as THREE from 'three';
import type { Point, Section, VehicleBuilder } from '../vehicle-builder';

/** Original long-hood 911: separate raised fenders, narrow body and continuous fastback. */
export function buildPorsche911(ctx: VehicleBuilder): void {
  const { spec, axles, add, box, surface, sample, materials, material } = ctx;
  const { paint, glass, alloy, dark, rubber, light, brakeLights, clearLens, gold } = materials;
  const amber = material('#da8c30', 0.35);
  const front = -spec.length / 2;
  const rear = spec.length / 2;
  const half = spec.width / 2;
  // More than four profile points even in faceted mode: a 911 is never a boxy sedan.
  const belt: Section[] = [
    { z: front, width: 0.65, y: 0.55 },
    { z: -1.98, width: 0.72, y: 0.66 },
    { z: -1.85, width: 0.76, y: 0.81 },
    { z: -1.65, width: 0.785, y: 0.875 },
    { z: -1.32, width: half, y: 0.875 },
    { z: -0.91, width: 0.786, y: 0.85 },
    { z: -0.59, width: 0.767, y: 0.824 },
    { z: 0, width: 0.756, y: 0.818 },
    { z: 0.48, width: 0.776, y: 0.834 },
    { z: 0.93, width: half, y: 0.847 },
    { z: 1.3, width: 0.791, y: 0.841 },
    { z: 1.67, width: 0.76, y: 0.77 },
    { z: 1.94, width: 0.71, y: 0.665 },
    { z: rear, width: 0.651, y: 0.565 },
  ];
  const center: Section[] = [
    { z: front, width: 0, y: 0.55 },
    { z: -1.95, width: 0, y: 0.6 },
    { z: -1.67, width: 0, y: 0.655 },
    { z: -1.2, width: 0, y: 0.733 },
    { z: -0.67, width: 0, y: 0.812 },
    { z: 0.45, width: 0, y: 0.825 },
    { z: 1.24, width: 0, y: 0.902 },
    { z: 1.48, width: 0, y: 0.845 },
    { z: 1.79, width: 0, y: 0.754 },
    { z: rear, width: 0, y: 0.598 },
  ];
  const rows = Array.from({ length: 65 }, (_, i) => THREE.MathUtils.lerp(front, rear, i / 64));
  const cross = [-1, -0.93, -0.81, -0.64, -0.4, 0, 0.4, 0.64, 0.81, 0.93, 1];
  const topPoint = (z: number, u: number, lift = 0): Point => {
    const edge = sample(belt, z);
    const middle = sample(center, z).y;
    const crown = Math.sin(Math.abs(u) * Math.PI * 0.62) ** 4;
    return [
      u * edge.width,
      middle + (edge.y - middle) * crown - Math.max(0, Math.abs(u) - 0.84) * 0.16 + lift,
      z,
    ];
  };
  surface(rows, cross, topPoint, paint);

  const trim = (points: Point[], radius = 0.008, mat: THREE.Material = alloy) => {
    const path = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...p)),
      false,
      'centripetal',
    );
    return add(new THREE.TubeGeometry(path, Math.max(8, points.length * 3), radius, 5, false), mat);
  };

  // Side skins terminate at actual semicircular wheel openings. The tops of
  // the tires are visible inside the arches rather than intersecting a box.
  const arch = spec.tireRadius + 0.037;
  const axleZs = [-axles.front, axles.rear];
  const lowerEdge = (z: number) => {
    let y = 0.235 + Math.max(0, Math.abs(z) - 1.5) * 0.16;
    for (const axleZ of axleZs) {
      const distance = Math.abs(z - axleZ);
      if (distance < arch)
        y = Math.max(y, spec.tireRadius + Math.sqrt(arch * arch - distance * distance));
    }
    return y;
  };
  const sideRows = [
    ...new Set([
      ...rows,
      ...axleZs.flatMap((z) => [z - arch - 0.001, z - arch, z + arch, z + arch + 0.001]),
    ]),
  ].sort((a, b) => a - b);
  for (const side of [-1, 1]) {
    surface(
      sideRows,
      [0, 0.3, 0.65, 1],
      (z, u) => {
        const top = topPoint(z, 1);
        return [
          side * (sample(belt, z).width - 0.033 * (1 - u) + Math.sin(u * Math.PI) * 0.003),
          THREE.MathUtils.lerp(lowerEdge(z), top[1], u),
          z,
        ];
      },
      paint,
    );
    for (const axleZ of axleZs) {
      trim(
        Array.from({ length: 25 }, (_, i): Point => {
          const angle = (Math.PI * i) / 24;
          const z = axleZ - Math.cos(angle) * arch;
          return [
            side * (sample(belt, z).width + 0.001),
            spec.tireRadius + Math.sin(angle) * arch,
            z,
          ];
        }),
        0.012,
        paint,
      );
    }
    // Wide period sill strip; only between the wheels, not across the openings.
    box(0.026, 0.038, 1.43, side * 0.753, 0.264, -0.15, alloy);
    box(0.027, 0.021, 1.43, side * 0.759, 0.287, -0.15, rubber);
    trim(
      [
        [side * 0.77, 0.79, -0.54],
        [side * 0.755, 0.4, -0.57],
        [side * 0.75, 0.31, -0.5],
        [side * 0.757, 0.31, 0.43],
        [side * 0.78, 0.43, 0.48],
        [side * 0.781, 0.806, 0.43],
      ],
      0.003,
      dark,
    );
    box(0.026, 0.026, 0.128, side * 0.786, 0.758, 0.27, alloy);
    box(0.024, 0.018, 0.052, side * 0.787, 0.744, 0.295, dark);
  }
  box(1.21, 0.045, 3.42, 0, 0.212, 0.03, dark);
  for (const z of [front, rear]) {
    surface(
      [0, 1],
      cross,
      (v, u) => {
        const top = topPoint(z, u);
        return [top[0] * (0.91 + v * 0.09), THREE.MathUtils.lerp(lowerEdge(z), top[1], v), z];
      },
      paint,
    );
  }

  const cabin: Section[] = [
    { z: -0.69, width: 0.704, y: 0.813 },
    { z: -0.55, width: 0.671, y: 0.98 },
    { z: -0.34, width: 0.594, y: 1.217 },
    { z: -0.15, width: 0.564, y: 1.296 },
    { z: 0.09, width: 0.56, y: spec.height },
    { z: 0.35, width: 0.575, y: 1.306 },
    { z: 0.57, width: 0.592, y: 1.266 },
    { z: 0.8, width: 0.615, y: 1.166 },
    { z: 1.02, width: 0.647, y: 1.065 },
    { z: 1.24, width: 0.666, y: 0.952 },
    { z: 1.45, width: 0.682, y: 0.85 },
    { z: 1.59, width: 0.693, y: 0.799 },
  ];
  const cabinRows = cabin.map((section) => section.z);
  const roofPoint = (z: number, u: number, lift = 0): Point => {
    const section = sample(cabin, z);
    return [u * section.width, section.y - u * u * 0.036 + lift, z];
  };
  surface(cabinRows, [-1, -0.75, -0.4, 0, 0.4, 0.75, 1], roofPoint, paint);
  const rowsBetween = (start: number, end: number) => [
    start,
    ...cabinRows.filter((z) => z > start && z < end),
    end,
  ];
  const roofGlass = (start: number, end: number) => {
    const zs = rowsBetween(start, end);
    surface(
      zs,
      [-0.91, -0.65, -0.35, 0, 0.35, 0.65, 0.91],
      (z, u) => roofPoint(z, u, 0.009),
      glass,
    );
    trim(
      [
        ...zs.map((z) => roofPoint(z, -0.92, 0.014)),
        ...[-0.6, 0, 0.6, 0.92].map((u) => roofPoint(end, u, 0.014)),
        ...[...zs].reverse().map((z) => roofPoint(z, 0.92, 0.014)),
        ...[0.6, 0, -0.6, -0.92].map((u) => roofPoint(start, u, 0.014)),
      ],
      0.007,
    );
  };
  roofGlass(-0.61, -0.26);
  roofGlass(0.6, 1.355);
  for (const side of [-1, 1]) {
    const sidePoint = (z: number, y: number, outset = 0): Point => {
      const section = sample(cabin, z);
      const base = sample(belt, z).y - 0.026;
      const fraction = THREE.MathUtils.clamp(
        (y - base) / Math.max(0.01, section.y - 0.036 - base),
        0,
        1,
      );
      return [side * (THREE.MathUtils.lerp(0.726, section.width, fraction) + outset), y, z];
    };
    surface(
      cabinRows,
      [0, 1],
      (z, u) =>
        sidePoint(
          z,
          THREE.MathUtils.lerp(sample(belt, z).y - 0.026, sample(cabin, z).y - 0.036, u),
        ),
      paint,
    );
    const sideWindow = (start: number, end: number) => {
      const zs = rowsBetween(start, end);
      const bottom = (z: number) => 0.862 + Math.max(0, z - 0.5) * 0.012;
      const top = (z: number) => Math.max(bottom(z) + 0.012, sample(cabin, z).y - 0.068);
      surface(
        zs,
        [0, 1],
        (z, u) => sidePoint(z, THREE.MathUtils.lerp(bottom(z), top(z), u), 0.007),
        glass,
      );
      trim(
        [
          ...zs.map((z) => sidePoint(z, bottom(z), 0.015)),
          ...[...zs].reverse().map((z) => sidePoint(z, top(z), 0.015)),
          sidePoint(start, bottom(start), 0.015),
        ],
        0.007,
      );
    };
    sideWindow(-0.565, 0.337);
    sideWindow(0.401, 1.218);
    // Opening front quarter-light divider, plus the slender chrome B-pillar.
    trim([sidePoint(-0.414, 0.864, 0.016), sidePoint(-0.354, 1.125, 0.016)], 0.007);
    trim([sidePoint(0.367, 0.852, 0.017), sidePoint(0.367, 1.25, 0.017)], 0.009);
  }

  // Upright fender peaks with round, slightly rearward-leaning headlamp lenses.
  for (const side of [-1, 1]) {
    // The lamp rim is the leading edge of a painted teardrop fairing, not a
    // freestanding disc. The upper half loft clears the front wheel opening.
    const fairing: Section[] = [
      { z: -1.89, width: 0.135, y: 0.879 },
      { z: -1.72, width: 0.165, y: 0.892 },
      { z: -1.43, width: 0.166, y: 0.89 },
      { z: -1.1, width: 0.159, y: 0.869 },
      { z: -0.88, width: 0.147, y: 0.854 },
      { z: -0.64, width: 0.133, y: 0.823 },
    ];
    surface(
      fairing.map((section) => section.z),
      Array.from({ length: 15 }, (_, i) => -Math.PI / 2 + (i * Math.PI) / 14),
      (z, angle) => {
        const section = sample(fairing, z);
        const t = (z + 1.89) / 1.25;
        const base = THREE.MathUtils.lerp(0.745, 0.735, t);
        return [
          side * (0.613 + Math.sin(angle) * section.width),
          base + Math.cos(angle) * (section.y - base),
          z + Math.cos(angle) * 0.046 * (1 - t),
        ];
      },
      paint,
    );
    const lamp = new THREE.Group();
    lamp.position.set(side * 0.613, 0.745, -1.904);
    lamp.rotation.x = Math.PI + 0.35;
    ctx.body.add(lamp);
    add(new THREE.TorusGeometry(0.123, 0.013, 6, 28), alloy, lamp);
    const lens = add(new THREE.SphereGeometry(1, 24, 10), light, lamp);
    lens.scale.set(0.112, 0.118, 0.027);
    const innerRing = add(new THREE.TorusGeometry(0.088, 0.003, 4, 24), clearLens, lamp);
    innerRing.position.z = 0.027;
    // Short amber indicators and chrome horizontal horn grilles below each lamp.
    box(0.205, 0.067, 0.027, side * 0.58, 0.548, front - 0.009, amber);
    box(0.159, 0.068, 0.027, side * 0.399, 0.552, front - 0.009, dark);
    for (let i = 0; i < 4; i++)
      box(0.154, 0.006, 0.011, side * 0.399, 0.527 + i * 0.016, front - 0.027, alloy);
  }
  // The long bonnet's inner edges dip below the separate headlamp fenders.
  for (const side of [-1, 1]) {
    trim(
      [-1.996, -1.8, -1.6, -1.3, -1.0, -0.725].map((z) => topPoint(z, side * 0.555, 0.004)),
      0.003,
      dark,
    );
  }
  const crest = add(new THREE.CircleGeometry(0.028, 5), gold);
  crest.position.set(0, 0.626, -1.857);
  crest.rotation.x = -Math.PI / 2 - 0.15;
  crest.scale.y = 1.3;
  // Two small, non-reflective wipers on the cowl.
  trim(
    [
      [-0.43, 0.853, -0.665],
      [-0.08, 0.91, -0.599],
    ],
    0.008,
    rubber,
  );
  trim(
    [
      [0.08, 0.855, -0.665],
      [0.4, 0.915, -0.594],
    ],
    0.008,
    rubber,
  );

  // Slim chrome bumper blades follow the ends; no later impact bumper bellows.
  for (const end of [-1, 1]) {
    const z = end < 0 ? front : rear;
    const points: Point[] = [
      [-0.766, 0.425, z - end * 0.245],
      [-0.738, 0.426, z - end * 0.074],
      [-0.56, 0.426, z],
      [0, 0.426, z + end * 0.004],
      [0.56, 0.426, z],
      [0.738, 0.426, z - end * 0.074],
      [0.766, 0.425, z - end * 0.245],
    ];
    trim(points, 0.041, alloy);
    trim(
      points.map(([x, y, pz]) => [x, y + 0.034, pz + end * 0.014]),
      0.012,
      rubber,
    );
    for (const x of [-0.385, 0.385]) {
      box(0.063, 0.197, 0.074, x, 0.437, z + end * 0.021, alloy);
      box(0.041, 0.14, 0.026, x, 0.453, z + end * 0.057, rubber);
    }
  }

  // Separate rear clusters: amber outside, a small clear segment, red inside.
  for (const side of [-1, 1]) {
    box(0.376, 0.114, 0.022, side * 0.541, 0.553, rear + 0.006, alloy);
    box(0.35, 0.092, 0.024, side * 0.541, 0.553, rear + 0.022, dark);
    box(0.155, 0.079, 0.015, side * 0.626, 0.553, rear + 0.038, amber);
    box(0.056, 0.079, 0.015, side * 0.515, 0.553, rear + 0.038, clearLens);
    box(0.105, 0.079, 0.015, side * 0.431, 0.553, rear + 0.038, brakeLights);
  }
  // Engine cover grille is a conforming surface on the descending rear lid.
  surface([1.443, 1.52, 1.62, 1.725], [-0.56, 0, 0.56], (z, u) => topPoint(z, u, 0.012), dark);
  for (let i = 0; i < 9; i++) {
    const z = 1.446 + i * 0.034;
    trim(
      [-0.55, -0.3, 0, 0.3, 0.55].map((u) => topPoint(z, u, 0.02)),
      0.007,
      alloy,
    );
  }
  for (const u of [-0.53, 0, 0.53])
    trim(
      [1.442, 1.55, 1.73].map((z) => topPoint(z, u, 0.023)),
      0.006,
      alloy,
    );
  ctx.badge('P O R S C H E', 0.62, 0.045, 0, 0.644, 2.046);
  ctx.badge('911 S', 0.135, 0.037, 0, 0.718, 1.86);
  ctx.badge('chillhill', 0.303, 0.1, 0, 0.447, rear + 0.047, true);
  const exhaust = add(new THREE.CylinderGeometry(0.034, 0.032, 0.23, 12), alloy);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(-0.525, 0.248, 1.989);
  const exhaustOpening = add(new THREE.CircleGeometry(0.027, 12), dark);
  exhaustOpening.position.set(-0.525, 0.248, 2.106);

  // Matching round period-style mirrors on both sides, a requested game customization.
  for (const side of [-1, 1]) {
    trim(
      [
        [side * 0.713, 0.873, -0.541],
        [side * 0.817, 0.94, -0.541],
      ],
      0.017,
      alloy,
    );
    const mirror = add(new THREE.SphereGeometry(1, 16, 8), alloy);
    mirror.name = `mirror-${side < 0 ? 'driver' : 'passenger'}`;
    mirror.scale.set(0.061, 0.063, 0.024);
    mirror.position.set(side * 0.814, 0.967, -0.525);
    const reflection = add(new THREE.CircleGeometry(0.053, 16), clearLens);
    reflection.name = `${mirror.name}-glass`;
    reflection.position.set(side * 0.814, 0.967, -0.498);
  }
}
