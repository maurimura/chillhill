import * as THREE from 'three';
import type { Point, Section, VehicleBuilder } from '../vehicle-builder';
import { buildBodyContour } from '../vehicle-surfaces';
import {
  peugeot206Cabin,
  peugeot206FrontWindow,
  peugeot206RearWindow,
  peugeot206Headlamp,
  peugeot206TailLamp,
} from './peugeot206-profile';

/** Rounded original 206 five-door, deliberately not the later 207 Compact nose. */
export function buildPeugeot206(ctx: VehicleBuilder): void {
  const { spec, axles, roundness, add, box, panel, surface, sample, roundedSections } = ctx;
  const { paint, dark, glass, rubber, alloy, light, brakeLights, clearLens } = ctx.materials;
  const seam = ctx.material('#506169', 0.85);
  const front = -spec.length / 2;
  const rear = spec.length / 2;
  const half = spec.width / 2;
  const belt = roundedSections(
    [
      { z: front, width: 0.722, y: 0.739 },
      { z: front + 0.12, width: 0.784, y: 0.796 },
      { z: front + 0.34, width: 0.814, y: 0.856 },
      { z: -1.17, width: half, y: 0.898 },
      { z: -0.78, width: 0.816, y: 0.935 },
      { z: -0.16, width: 0.812, y: 0.938 },
      { z: 0.5, width: 0.816, y: 0.956 },
      { z: 1.1, width: half, y: 0.99 },
      { z: 1.5, width: 0.813, y: 1.041 },
      { z: 1.75, width: 0.8, y: 1.05 },
      { z: rear, width: 0.771, y: 1.04 },
    ],
    0.28 + roundness * 0.72,
  );
  const across = [-1, -0.92, -0.73, -0.4, 0, 0.4, 0.73, 0.92, 1];
  const skin = buildBodyContour(ctx, belt, {
    crown: 0.026 + roundness * 0.015,
    shoulder: 0.04 + roundness * 0.035,
    shoulderStart: 0.84,
    sill: 0.225,
    tuck: 0.047 + roundness * 0.02,
    archRadius: spec.tireRadius + 0.036,
    tailRound: 0.11 + roundness * 0.02,
    noseRound: 0.04 + roundness * 0.035,
    endLift: 0.015,
    valanceTuck: 0.05,
  });
  const topPoint = (z: number, u: number, lift = 0): Point => {
    const point = skin.topPoint(z, u);
    point[1] += lift;
    return point;
  };
  const trim = (points: Point[], radius = 0.006, material: THREE.Material = rubber) => {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...p)),
      false,
      'centripetal',
    );
    return add(
      new THREE.TubeGeometry(curve, Math.max(8, points.length * 3), radius, 4, false),
      material,
    );
  };

  // Open wheel arches and subtly bulging door skins, with a narrow inset sill.
  const arch = spec.tireRadius + 0.036;
  for (const side of [-1, 1]) {
    for (const axle of [-axles.front, axles.rear]) {
      trim(
        Array.from({ length: 25 }, (_, i): Point => {
          const angle = (i * Math.PI) / 24;
          const z = axle - Math.cos(angle) * arch;
          return skin.sidePoint(z, spec.tireRadius + Math.sin(angle) * arch, side);
        }),
        0.016,
        paint,
      );
    }
    // Period protective strip, sweeping gently upward toward the rear wheel.
    trim(
      [
        [-0.74, 0.536],
        [-0.25, 0.557],
        [0.29, 0.59],
        [0.83, 0.626],
      ].map(([z, y]): Point => [side * (sample(belt, z).width + 0.004), y, z]),
      0.028,
      rubber,
    );
    box(0.06, 0.062, 1.76, side * 0.783, 0.246, 0.05, paint);
    // Door cut lines and four visible, oval pull handles distinguish the 5-door.
    const doorSeam = (outline: number[][]) => {
      const curve = new THREE.CatmullRomCurve3(outline.map(([z, y]) => new THREE.Vector3(0, y, z)));
      trim(
        curve.getPoints(64).map(({ y, z }) => {
          const point = skin.sidePoint(z, Math.max(0.302, y), side);
          point[0] += side * 0.004;
          return point;
        }),
        0.0025,
        seam,
      );
    };
    // Project the seams onto the rounded door skin, with no spline dipping below the sill.
    doorSeam([
      [-0.82, 0.889],
      [-0.8, 0.65],
      [-0.76, 0.4],
      [-0.63, 0.307],
      [0.33, 0.307],
      [0.42, 0.4],
      [0.434, 0.939],
    ]);
    doorSeam([
      [0.43, 0.307],
      [0.67, 0.319],
      [0.87, 0.51],
      [1.1, 0.83],
      [1.236, 0.96],
    ]);
    for (const [z, y] of [
      [0.275, 0.823],
      [1.024, 0.874],
    ]) {
      const handle = add(new THREE.SphereGeometry(1, 16, 8), dark);
      handle.scale.set(0.017, 0.041, 0.059);
      handle.position.set(side * (sample(belt, z).width + 0.017), y, z);
      trim(
        [
          [side * (sample(belt, z).width + 0.028), y - 0.005, z - 0.044],
          [side * (sample(belt, z).width + 0.03), y - 0.005, z + 0.044],
        ],
        0.017,
        paint,
      );
    }
    const repeater = add(new THREE.SphereGeometry(1, 12, 6), clearLens);
    repeater.scale.set(0.014, 0.018, 0.035);
    repeater.position.set(side * 0.819, 0.761, -0.91);
  }
  box(1.23, 0.046, 3.36, 0, 0.217, 0.015, dark);

  // Large swept windshield, domed roof, then a short steep hatch (no trunk).
  const cabin = roundedSections(peugeot206Cabin, 0.28 + roundness * 0.65);
  const cabinRows = cabin.map((section) => section.z);
  const roofCrown = 0.047 + roundness * 0.025;
  const roofPoint = (z: number, u: number, lift = 0): Point => {
    const section = sample(cabin, z);
    return skin.finish([u * section.width, section.y - roofCrown * u * u + lift, z]);
  };
  surface(cabinRows, across, roofPoint, paint);
  const rowsBetween = (start: number, end: number) => [
    start,
    ...cabinRows.filter((z) => z > start && z < end),
    end,
  ];
  const roofGlass = (start: number, end: number, width: number) => {
    const zs = [...new Set([...rowsBetween(start, end), start + 0.025, end - 0.025])].sort(
      (a, b) => a - b,
    );
    const glassPoint = (z: number, u: number, lift: number) => {
      const corner = Math.min(1, Math.max(0, Math.min(z - start, end - z) / 0.025));
      return roofPoint(z, u * (0.94 + 0.06 * Math.sin((corner * Math.PI) / 2)), lift);
    };
    surface(
      zs,
      [-width, -width * 0.65, 0, width * 0.65, width],
      (z, u) => glassPoint(z, u, 0.01),
      glass,
    );
    trim(
      [
        ...zs.map((z) => glassPoint(z, -width, 0.014)),
        ...[-width * 0.5, 0, width * 0.5, width].map((u) => glassPoint(end, u, 0.014)),
        ...[...zs].reverse().map((z) => glassPoint(z, width, 0.014)),
        ...[width * 0.5, 0, -width * 0.5, -width].map((u) => glassPoint(start, u, 0.014)),
      ],
      0.009,
    );
  };
  roofGlass(-0.832, -0.204, 0.929);
  roofGlass(1.265, 1.799, 0.945);
  for (const side of [-1, 1]) {
    const sidePoint = (z: number, y: number, lift = 0): Point => {
      const roof = sample(cabin, z);
      const base = sample(belt, z).y - 0.039;
      const fraction = THREE.MathUtils.clamp(
        (y - base) / Math.max(0.015, roof.y - roofCrown - base),
        0,
        1,
      );
      return skin.finish([
        side *
          (THREE.MathUtils.lerp(sample(belt, z).width - 0.034, roof.width, fraction) +
            Math.sin(fraction * Math.PI) * (0.008 + roundness * 0.01) +
            lift),
        y,
        z,
      ]);
    };
    surface(
      cabinRows,
      [0, 0.25, 0.5, 0.75, 1],
      (z, u) =>
        sidePoint(
          z,
          THREE.MathUtils.lerp(sample(belt, z).y - 0.039, sample(cabin, z).y - roofCrown, u),
        ),
      paint,
    );
    const window = (outline: Section[]) => {
      const bounds = roundedSections(outline, 0.7);
      const zs = bounds.map((p) => p.z);
      const bottom = (z: number) => sample(bounds, z).width;
      const top = (z: number) =>
        Math.min(sample(bounds, z).y, sample(cabin, z).y - roofCrown - 0.016);
      surface(
        zs,
        [0, 0.25, 0.5, 0.75, 1],
        (z, u) => sidePoint(z, THREE.MathUtils.lerp(bottom(z), top(z), u), 0.008),
        glass,
      );
      trim(
        [
          ...zs.map((z) => sidePoint(z, bottom(z), 0.013)),
          ...[...zs].reverse().map((z) => sidePoint(z, top(z), 0.013)),
          sidePoint(zs[0], bottom(zs[0]), 0.013),
        ],
        0.007,
      );
    };
    window(peugeot206FrontWindow);
    window(peugeot206RearWindow);
    surface(
      [0.375, 0.474],
      [0, 0.25, 0.5, 0.75, 1],
      (z, u) =>
        sidePoint(
          z,
          THREE.MathUtils.lerp(sample(belt, z).y + 0.01, sample(cabin, z).y - roofCrown - 0.007, u),
          0.014,
        ),
      rubber,
    );
    // Rear door has one rounded pane; no invented triangular fixed quarterlight.
    // Squat, rounded black mirrors rather than sharp modern winglets.
    const mirror = add(new THREE.SphereGeometry(1, 16, 8), rubber);
    mirror.scale.set(0.101, 0.067, 0.118);
    mirror.position.set(side * 0.842, 0.99, -0.718);
    box(0.1, 0.05, 0.074, side * 0.78, 0.947, -0.713, rubber);
    const reflection = add(new THREE.SphereGeometry(1, 12, 6), alloy);
    reflection.scale.set(0.073, 0.045, 0.012);
    reflection.position.set(side * 0.854, 0.996, -0.607);
  }

  // Find the frontmost skin at a projected (x,y). This lets each lamp wrap from
  // the frontal face onto the fender, instead of lying like a sticker on the hood.
  const nosePoint = (x: number, y: number, lift = 0.008): Point => {
    let lo = front,
      hi = -0.8;
    for (let i = 0; i < 24; i++) {
      const z = (lo + hi) / 2;
      const w = sample(belt, z).width;
      const inside = Math.abs(x) <= skin.sidePoint(z, y)[0] && y <= topPoint(z, x / w)[1];
      if (inside) hi = z;
      else lo = z;
    }
    const p = skin.finish([x, y, hi]);
    p[2] -= lift;
    return p;
  };
  // Tall outer tips, rounded lower edges and distinct reflectors: the original 206 eyes.
  const lampBounds = roundedSections(peugeot206Headlamp, 0.8);
  for (const side of [-1, 1]) {
    const lensPoint = (y: number, v: number, lift = 0.011): Point => {
      const bounds = sample(lampBounds, y);
      return nosePoint(side * THREE.MathUtils.lerp(bounds.width, bounds.y, v), y, lift);
    };
    const ys = lampBounds.map((row) => row.z);
    surface(ys, [0, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 1], lensPoint, alloy);
    const edge = [
      ...ys.map((y) => lensPoint(y, 0, 0.013)),
      ...[...ys].reverse().map((y) => lensPoint(y, 1, 0.013)),
      lensPoint(ys[0], 0, 0.013),
    ];
    trim(edge, 0.004, dark);
    for (const [cx, cy, rx, ry] of [
      [0.525, 0.699, 0.079, 0.022],
      [0.693, 0.756, 0.06, 0.046],
    ]) {
      surface(
        [0, 0.3, 0.65, 1],
        Array.from({ length: 25 }, (_, i) => (i * Math.PI) / 12),
        (r, a) => nosePoint(side * (cx + Math.cos(a) * rx * r), cy + Math.sin(a) * ry * r, 0.018),
        light,
      );
    }
    const fog = add(new THREE.SphereGeometry(1, 16, 8), clearLens);
    fog.scale.set(0.065, 0.048, 0.014);
    fog.position.set(...nosePoint(side * 0.617, 0.347, 0.013));
  }
  surface(
    [0.668, 0.684, 0.706],
    [-1, -0.6, 0, 0.6, 1],
    (y, u) => nosePoint(u * 0.295, y, 0.012),
    rubber,
  );
  // Flush molded bumper band, not a tube spanning across the nose like a bull bar.
  surface(
    [0, 0.2, 0.5, 0.8, 1],
    [-1, -0.96, -0.87, -0.73, -0.4, 0, 0.4, 0.73, 0.87, 0.96, 1],
    (v, u) => {
      const y = 0.505 + v * 0.102 + Math.abs(u) ** 4 * 0.02;
      return nosePoint(u * 0.782, y, 0.012 + Math.sin(v * Math.PI) * 0.016);
    },
    rubber,
  );
  surface(
    [0, 0.12, 0.35, 0.65, 0.88, 1],
    [-1, -0.8, -0.5, 0, 0.5, 0.8, 1],
    (v, u) => {
      const y = 0.308 + v * 0.172;
      const width = 0.36 + Math.sin((v * Math.PI) / 2) * 0.172;
      return nosePoint(u * width, y + Math.abs(u) ** 4 * 0.018, 0.009);
    },
    rubber,
  );
  for (let i = 0; i < 4; i++)
    surface(
      [0.331 + i * 0.034, 0.337 + i * 0.034],
      [-0.7, -0.35, 0, 0.35, 0.7],
      (y, u) => nosePoint(u * 0.54, y, 0.016),
      dark,
    );
  ctx.badge('chillhill', 0.34, 0.097, 0, 0.283, front - 0.013, true);
  for (const side of [-1, 1])
    trim(
      [-1.706, -1.46, -1.2, -0.97].map((z) => topPoint(z, side * 0.683, 0.006)),
      0.003,
      seam,
    );
  // Small hood vents/cowl and two wipers are characteristic of the original 206.
  for (const x of [-0.44, -0.28]) {
    surface(
      [-1.18, -1.15, -1.09, -1.02, -0.95, -0.9, -0.88],
      [-1, -0.7, 0, 0.7, 1],
      (z, u) => {
        const t = (z + 1.18) / 0.3;
        const w = 0.05 * Math.sin(Math.PI * Math.max(0.035, Math.min(0.965, t)));
        return topPoint(z, (x + u * w) / sample(belt, z).width, 0.006);
      },
      dark,
    );
  }
  trim(
    [
      [-0.46, 0.955, -0.841],
      [-0.13, 0.987, -0.79],
    ],
    0.008,
  );
  trim(
    [
      [0.04, 0.956, -0.843],
      [0.37, 0.99, -0.784],
    ],
    0.008,
  );

  // Each rear cluster is ONE continuous surface bending from rear face to flank.
  // A separate side "wing" makes a second lamp and is not the 206's construction.
  const amberLens = ctx.material('#b96537', 0.38);
  const tailBounds = roundedSections(peugeot206TailLamp, 0.75);
  for (const side of [-1, 1]) {
    const point = (t: number, v: number, lift = 0): Point => {
      const bounds = sample(tailBounds, t);
      const z = t <= 0.6 ? rear : rear - ((t - 0.6) / 0.4) * 0.445;
      const top = Math.min(bounds.y, skin.topPoint(z, 1)[1] - 0.003);
      const y = THREE.MathUtils.lerp(bounds.width, Math.max(bounds.width + 0.001, top), v);
      const p =
        t <= 0.6
          ? skin.finish([
              side * THREE.MathUtils.lerp(0.49, skin.sidePoint(rear, y)[0], t / 0.6),
              y,
              rear,
            ])
          : skin.sidePoint(z, y, side);
      p[0] += side * (0.008 + lift) * Math.min(1, t / 0.6);
      p[2] += (0.009 + lift) * (t < 0.6 ? 1 : (1 - t) / 0.4);
      return p;
    };
    const ts = [
      ...new Set([
        ...tailBounds.map((p) => p.z),
        0.6,
        ...Array.from({ length: 21 }, (_, i) => i / 20),
      ]),
    ].sort((a, b) => a - b);
    surface(ts, [0, 0.15, 0.35, 0.55, 0.75, 0.9, 1], point, brakeLights);
    trim(
      [
        ...ts.map((t) => point(t, 0, 0.002)),
        ...[...ts].reverse().map((t) => point(t, 1, 0.002)),
        point(0, 0, 0.002),
      ],
      0.0035,
      dark,
    );
    // A restrained amber upper band, still within the single red lens housing.
    surface(
      ts.filter((t) => t >= 0.13 && t <= 0.93),
      [0.49, 0.66, 0.82],
      (t, v) => point(t, v, 0.004),
      amberLens,
    );
  }
  surface(
    [0, 0.12, 0.35, 0.65, 0.88, 1],
    [-1, -0.97, -0.9, -0.7, -0.4, 0, 0.4, 0.7, 0.9, 0.97, 1],
    (v, u) => {
      const y = 0.425 + v * 0.155;
      const point = skin.finish([u * (skin.sidePoint(rear, y)[0] + 0.008), y, rear]);
      point[2] += 0.012 + Math.sin(Math.PI * v) * 0.035;
      return point;
    },
    rubber,
  );
  // The rear rubbing strip rounds the corners and tapers onto both quarter panels.
  for (const side of [-1, 1]) {
    surface(
      [0, 0.15, 0.4, 0.7, 0.9, 1],
      [0, 0.2, 0.5, 0.8, 1],
      (u, v) => {
        const z = rear - u * 0.39;
        const taper = Math.sqrt(Math.max(0.002, 1 - u ** 4));
        const y = 0.5025 + (v - 0.5) * 0.155 * taper;
        const point = skin.sidePoint(z, y, side);
        point[0] += side * (0.008 + Math.sin(Math.PI * v) * 0.022 * Math.min(1, u * 5));
        point[2] += (0.012 + Math.sin(Math.PI * v) * 0.035) * (1 - u);
        return point;
      },
      rubber,
    );
  }
  // Broad recessed number-plate dish and body-colored handle are signature 206 details.
  surface(
    [0.595, 0.61, 0.65, 0.745, 0.8, 0.825],
    [-1, -0.94, -0.82, -0.6, 0, 0.6, 0.82, 0.94, 1],
    (y, u) => {
      const rim = Math.max(Math.abs(u) ** 8, Math.max(0, Math.abs((y - 0.71) / 0.115)) ** 8);
      const width = 0.43 * (0.86 + 0.14 * Math.min(1, (y - 0.595) / 0.12));
      return [u * width, y, rear + 0.002 + rim * 0.028];
    },
    paint,
  );
  ctx.badge('chillhill', 0.37, 0.125, 0, 0.686, rear + 0.012, true);
  box(0.69, 0.022, 0.022, 0, 0.797, rear + 0.025, dark);
  const hatchHandle = add(new THREE.SphereGeometry(1, 24, 10), paint);
  hatchHandle.scale.set(0.367, 0.028, 0.025);
  hatchHandle.position.set(0, 0.82, rear + 0.027);
  const fogLens = add(new THREE.SphereGeometry(1, 16, 8), brakeLights);
  fogLens.scale.set(0.084, 0.04, 0.014);
  fogLens.position.set(0, 0.308, rear + 0.014);
  trim(
    [
      [-0.573, 0.536, rear + 0.012],
      [-0.507, 0.658, rear + 0.023],
      [-0.527, 0.823, rear + 0.023],
      [-0.586, 0.942, rear + 0.02],
    ],
    0.003,
    seam,
  );
  trim(
    [
      [0.573, 0.536, rear + 0.012],
      [0.507, 0.658, rear + 0.023],
      [0.527, 0.823, rear + 0.023],
      [0.586, 0.942, rear + 0.02],
    ],
    0.003,
    seam,
  );
  // Rear wiper lies on the glass, not floating behind the hatch.
  trim(
    [roofPoint(1.731, -0.25, 0.023), roofPoint(1.685, 0.1, 0.026), roofPoint(1.726, 0.51, 0.024)],
    0.012,
  );
  surface([1.238, 1.267], [-0.205, 0.205], (z, u) => roofPoint(z, u, 0.016), brakeLights);
  // Front roof aerial and right-side circular fuel flap appear in the five-door references.
  trim([roofPoint(-0.02, 0, 0.006), [0, 1.61, 0.37]], 0.005, rubber);
  const fuel = add(new THREE.CircleGeometry(0.066, 24), paint);
  fuel.rotation.y = Math.PI / 2;
  fuel.position.set(...skin.sidePoint(1.26, 0.895));
  fuel.position.x += 0.006;
  trim(
    Array.from({ length: 25 }, (_, i): Point => [
      fuel.position.x + 0.002,
      0.895 + Math.sin((i * Math.PI) / 12) * 0.066,
      1.26 + Math.cos((i * Math.PI) / 12) * 0.066,
    ]),
    0.002,
    seam,
  );
  const exhaust = add(new THREE.CylinderGeometry(0.028, 0.026, 0.15, 12), dark);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(-0.52, 0.233, rear - 0.027);

  // A small hand-drawn rearing-lion silhouette, not a borrowed raster logo.
  const lion = new THREE.Shape();
  lion.moveTo(0.07, -0.85);
  lion.lineTo(0.57, -0.85);
  lion.quadraticCurveTo(0.61, -0.76, 0.31, -0.68);
  lion.lineTo(0.08, -0.44);
  lion.lineTo(0.25, -0.1);
  lion.lineTo(0.44, 0.12);
  lion.lineTo(0.34, 0.42);
  lion.lineTo(0.55, 0.57);
  lion.lineTo(0.35, 0.73);
  lion.lineTo(0.06, 0.66);
  lion.lineTo(-0.07, 0.41);
  lion.lineTo(-0.31, 0.57);
  lion.lineTo(-0.52, 0.43);
  lion.lineTo(-0.2, 0.24);
  lion.lineTo(-0.11, 0.06);
  lion.lineTo(-0.38, -0.12);
  lion.quadraticCurveTo(-0.83, 0.22, -0.64, 0.68);
  lion.quadraticCurveTo(-0.97, 0.73, -0.91, 0.38);
  lion.quadraticCurveTo(-0.91, 0.03, -0.54, -0.35);
  lion.lineTo(-0.48, -0.48);
  lion.lineTo(-0.74, -0.84);
  lion.lineTo(-0.26, -0.84);
  lion.lineTo(-0.21, -0.56);
  lion.lineTo(-0.06, -0.44);
  lion.closePath();
  for (const end of [-1, 1]) {
    if (end < 0) {
      panel(
        [
          [-0.067, 0.728, front - 0.019],
          [0.067, 0.728, front - 0.019],
          [0.053, 0.609, front - 0.019],
          [0, 0.597, front - 0.019],
          [-0.053, 0.609, front - 0.019],
        ],
        rubber,
      );
      trim(
        [
          [-0.065, 0.729, front - 0.022],
          [0.065, 0.729, front - 0.022],
          [0.052, 0.612, front - 0.022],
          [0, 0.601, front - 0.022],
          [-0.052, 0.612, front - 0.022],
          [-0.065, 0.729, front - 0.022],
        ],
        0.003,
        alloy,
      );
    }
    const emblem = add(new THREE.ShapeGeometry(lion, 8), alloy);
    emblem.scale.setScalar(end < 0 ? 0.061 : 0.052);
    emblem.position.set(0, end < 0 ? 0.664 : 0.926, end < 0 ? front - 0.026 : rear + 0.018);
    if (end < 0) emblem.rotation.y = Math.PI;
  }
  ctx.badge('PEUGEOT', 0.185, 0.035, -0.43, 0.589, rear + 0.018);
  ctx.badge('206', 0.107, 0.042, 0.445, 0.59, rear + 0.018);
}
