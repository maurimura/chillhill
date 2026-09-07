import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyContour, buildBodyContour } from '../src/game/vehicle-surfaces.ts';
import type { Point, VehicleBuilder } from '../src/game/vehicle-builder.ts';

function captureBodySurfaces() {
  const surfaces: {
    zs: number[];
    us: number[];
    point: (z: number, u: number) => Point;
    normal?: (z: number, u: number) => Point;
  }[] = [];
  const ctx = {
    axles: { front: 1.2, rear: 1.25 },
    spec: { tireRadius: 0.3 },
    materials: { paint: {} },
    surface(
      zs: number[],
      us: number[],
      point: (z: number, u: number) => Point,
      _material: unknown,
      normal?: (z: number, u: number) => Point,
    ) {
      surfaces.push({ zs, us, point, normal });
    },
  } as unknown as VehicleBuilder;
  buildBodyContour(ctx, belt, options);
  return surfaces;
}

const belt = [
  { z: -2, width: 0.73, y: 0.78 },
  { z: -1.4, width: 0.82, y: 0.88 },
  { z: 1.4, width: 0.82, y: 0.97 },
  { z: 2, width: 0.76, y: 0.93 },
];
const options = {
  crown: 0.03,
  shoulder: 0.065,
  shoulderStart: 0.85,
  sill: 0.23,
  tuck: 0.04,
  archRadius: 0.34,
};
const skin = bodyContour(belt, [-1.2, 1.25], 0.3, options);

test('sculpted body panels stay symmetric, finite, and inside the original envelope', () => {
  assert.ok(skin.rows.length < 150);
  for (let i = 0; i < skin.rows.length; i++) {
    const z = skin.rows[i];
    assert.ok(i === 0 || z > skin.rows[i - 1]);
    for (const u of [0, 0.4, 0.85, 0.93, 0.99, 1]) {
      const a = skin.topPoint(z, u),
        b = skin.topPoint(z, -u);
      assert.ok(a.every(Number.isFinite));
      assert.ok(Math.abs(a[0]) <= 0.82 && a[1] <= 0.97);
      assert.equal(a[0], -b[0]);
      assert.equal(a[1], b[1]);
    }
    const top = skin.topPoint(z, 1);
    assert.deepEqual(
      skin.sidePoint(z, top[1]),
      top,
      'top and side share their entire shoulder edge',
    );
    assert.ok(skin.sidePoint(z, 0.23)[0] < top[0], 'sill tucks in instead of a flat slab');
  }
});

test('rolled shoulders have a curved silhouette and meet the side tangentially', () => {
  const shoulder = skin.topPoint(0, 1);
  const near = skin.topPoint(0, 1 - 1e-7);
  assert.ok(Math.abs((shoulder[0] - near[0]) / (shoulder[1] - near[1])) < 0.01);
  const middle = skin.topPoint(0, 0.925);
  const inner = skin.topPoint(0, 0.85);
  assert.ok(middle[1] > (inner[1] + shoulder[1]) / 2, 'rounded shoulder, not a straight chamfer');
});

test('side-panel rows preserve both open wheel arches and their upright boundaries', () => {
  for (const axle of [-1.2, 1.25]) {
    assert.equal(skin.lowerAt(axle), 0.64);
    assert.equal(skin.lowerAt(axle - 0.34001), 0.23);
    for (let i = 0; i <= 24; i++) {
      const z = axle - Math.cos((i * Math.PI) / 24) * 0.34;
      assert.ok(skin.rows.some((row) => Math.abs(z - row) < 1e-10));
      const point = skin.sidePoint(z, skin.lowerAt(z));
      assert.ok(Math.hypot(z - axle, point[1] - 0.3) >= 0.34 - 1e-7);
      assert.ok(point[1] < skin.topPoint(z, 1)[1]);
    }
  }
  assert.equal(skin.lowerAt(0), 0.23);
});

test('rounded tail corners join across top and side without changing the center length or axles', () => {
  const rounded = bodyContour(belt, [-1.2, 1.25], 0.3, { ...options, tailRound: 0.12 });
  assert.equal(rounded.topPoint(2, 0)[2], 2);
  assert.equal(rounded.topPoint(2, 1)[2], 1.88);
  const top = rounded.topPoint(2, 1);
  assert.deepEqual(rounded.sidePoint(2, top[1]), top);
  assert.deepEqual(rounded.topPoint(1.25, 0.8), skin.topPoint(1.25, 0.8));
  assert.deepEqual(rounded.topPoint(-2, 0.8), skin.topPoint(-2, 0.8));
});

test('muscle-car valances roll inward without moving the axles or extending the body envelope', () => {
  const rolled = bodyContour(belt, [-1.2, 1.25], 0.3, {
    ...options,
    noseRound: 0.12,
    tailRound: 0.1,
    endLift: 0.085,
    valanceTuck: 0.26,
  });
  assert.equal(rolled.topPoint(-2, 0)[2], -2);
  assert.equal(rolled.topPoint(-2, 1)[2], -1.88);
  assert.ok(rolled.lowerAt(-2) > options.sill);
  assert.ok(rolled.sidePoint(-2, rolled.lowerAt(-2))[2] > -1.8);
  for (const axle of [-1.2, 1.25])
    assert.deepEqual(rolled.topPoint(axle, 1), skin.topPoint(axle, 1));
  for (const z of rolled.rows) {
    const top = rolled.topPoint(z, 1);
    assert.deepEqual(rolled.sidePoint(z, top[1]), top);
    assert.ok(top[2] >= -2 && top[2] <= 2);
  }
});

test('both body sides wind outward and agree with their smooth normals at every softness', () => {
  const surfaces = captureBodySurfaces();
  for (const [index, side] of [
    [1, -1],
    [2, 1],
  ]) {
    const { zs, us, point, normal } = surfaces[index];
    for (const z of zs)
      for (const u of us) {
        const n = normal!(z, u);
        assert.ok(n.every(Number.isFinite));
        assert.ok(n[0] * side > 0.9, 'smooth normals point away from the body');
        assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-8);
      }
    for (let row = 0; row < zs.length - 1; row++)
      for (let col = 0; col < us.length - 1; col++) {
        // Same two triangles as the production surface builder, including arch edges.
        const a = [zs[row], us[col]],
          b = [zs[row + 1], us[col]],
          c = [zs[row], us[col + 1]],
          d = [zs[row + 1], us[col + 1]];
        for (const triangle of [
          [a, b, c],
          [c, b, d],
        ]) {
          const [p, q, r] = triangle.map(([z, u]) => point(z, u));
          const ab = q.map((v, i) => v - p[i]),
            ac = r.map((v, i) => v - p[i]);
          const face = [
            ab[1] * ac[2] - ab[2] * ac[1],
            ab[2] * ac[0] - ab[0] * ac[2],
            ab[0] * ac[1] - ab[1] * ac[0],
          ];
          const length = Math.hypot(...face);
          if (length < 1e-12) continue;
          face.forEach((v, i) => {
            face[i] = v / length;
          });
          assert.ok(face[0] * side > 0, 'triangle winding points outward on both sides');
          for (const [z, u] of triangle) {
            const smooth = normal!(z, u);
            const dot = face.reduce((sum, v, i) => sum + v * smooth[i], 0);
            assert.ok(
              dot >= 0,
              `facet and smooth normal disagree: side=${side}, z=${z}, dot=${dot}`,
            );
            for (const softness of [0, 0.25, 0.49, 0.5, 0.51, 0.65, 1]) {
              const blended = face.map((v, i) => v * (1 - softness) + smooth[i] * softness);
              assert.ok(
                Math.hypot(...blended) >= Math.SQRT1_2 - 1e-8,
                'normals cannot cancel at 50% softness',
              );
            }
          }
        }
      }
  }
});

test('wheel-arch clipping does not change the smooth normals of the door sheet metal', () => {
  const surfaces = captureBodySurfaces();
  for (const [index, side] of [
    [1, -1],
    [2, 1],
  ]) {
    const { normal } = surfaces[index];
    for (const axle of [-1.2, 1.25])
      for (const edge of [-1, 1]) {
        const z = axle + edge * options.archRadius;
        const before = normal!(z - 0.00001, 0.7),
          after = normal!(z + 0.00001, 0.7);
        assert.ok(before[0] * side > 0.9 && after[0] * side > 0.9);
        assert.ok(
          Math.abs(before[2] - after[2]) < 0.02,
          'no flipped tangent at the upright arch cutout',
        );
      }
  }
});
