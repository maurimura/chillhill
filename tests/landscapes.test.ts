import test from 'node:test';
import { roadSupportWidth } from '../src/config/road.ts';
import assert from 'node:assert/strict';
import {
  lakeAt,
  lakeBasinScale,
  lakeSpacing,
  nearbyLakes,
  roadAt,
  roadElevation,
  terrainAt,
  type RouteSettings,
} from '../src/game/route.ts';

const base: RouteSettings = {
  curves: 1,
  grade: 0.09,
  roadWidth: 10,
  terrainHeight: 1,
  seed: 42,
  landscape: 'lakes',
};
const landscapes = ['highlands', 'coast', 'city', 'desert', 'lakes', 'forest'] as const;

test('every landscape preserves exact road support and the unchanged driving route', () => {
  for (const landscape of landscapes)
    for (const grade of [0.03, 0.16])
      for (const roadWidth of [7, 16])
        for (const curves of [0.2, 1.7]) {
          const settings = { ...base, landscape, grade, roadWidth, curves };
          for (const distance of [-180, 0, 20, 180, 700, 10000000]) {
            assert.deepEqual(
              roadAt(distance, settings),
              roadAt(distance, { ...settings, landscape: 'highlands' }),
            );
            for (const offset of [
              -roadWidth / 2 - roadSupportWidth,
              -roadWidth / 2,
              0,
              roadWidth / 2,
              roadWidth / 2 + roadSupportWidth,
            ]) {
              assert.ok(
                Math.abs(
                  terrainAt(distance, offset, settings) - roadElevation(distance, settings) + 0.08,
                ) < 1e-8,
              );
            }
          }
        }
});

test('all landscape profiles stay finite and continuous across chunk boundaries at large origins', () => {
  for (const landscape of landscapes)
    for (const terrainHeight of [0.25, 2])
      for (const seed of [1, 42, 99999]) {
        const settings = { ...base, landscape, terrainHeight, seed, curves: 1.7, grade: 0.16 };
        for (const boundary of [-360, 0, 180, 360, 720, 10000080])
          for (const offset of [-420, -120, -8, 0, 8, 50, 160, 260, 420]) {
            const a = terrainAt(boundary - 0.0001, offset, settings);
            const b = terrainAt(boundary + 0.0001, offset, settings);
            assert.ok(Number.isFinite(a) && Number.isFinite(b));
            assert.ok(Math.abs(a - b) < 0.02, `${landscape} seam at ${boundary}, ${offset}`);
          }
      }
});

test('city overlooks, desert dunes and forest banks have distinct terrain profiles', () => {
  const sample = (landscape: RouteSettings['landscape'], offset: number) =>
    terrainAt(240, offset, { ...base, landscape }) - roadElevation(240, base);
  assert.ok(sample('city', 170) < -16, 'city buildings sit in a lower valley');
  assert.ok(sample('city', 250) < -40, 'the nearest city blocks are below a mountain overlook');
  assert.ok(sample('city', 800) < -73, 'the far valley deepens rather than rising into a wall');
  assert.ok(sample('city', -170) > 45, 'wooded mountains remain on the left');
  assert.ok(Math.abs(sample('desert', 170)) < 15, 'dunes have a gentler profile');
  assert.ok(Math.abs(sample('forest', -70)) < 17, 'forest road banks remain calm');
  const profiles = landscapes.map((landscape) =>
    JSON.stringify([-150, 100, 250].map((offset) => sample(landscape, offset))),
  );
  assert.equal(new Set(profiles).size, landscapes.length);
});

test('lake descriptors are deterministic, finite, seeded and visible near the starting road', () => {
  const lake = lakeAt(0, base);
  assert.deepEqual(lakeAt(0, { ...base }), lake);
  assert.notDeepEqual(lakeAt(0, { ...base, seed: 43 }), lake);
  assert.ok(Object.isFrozen(lake));
  assert.ok(lake.centerDistance >= 152 && lake.centerDistance <= 188);
  assert.ok(lake.radiusX >= 65 && lake.radiusX <= 88);
  assert.ok(lake.radiusZ >= 105 && lake.radiusZ <= 128);
  assert.ok(nearbyLakes(0, 180, base).some((item) => item.index === 0));
  for (const index of [-20, -1, 0, 1, 100, 14285]) {
    const a = lakeAt(index, base),
      b = lakeAt(index + 1, base);
    assert.ok(Math.abs(b.centerDistance - a.centerDistance - lakeSpacing) <= 36);
    assert.ok(
      a.centerDistance + a.radiusZ * lakeBasinScale < b.centerDistance - b.radiusZ * lakeBasinScale,
      'finite basins never overlap',
    );
    assert.ok(Object.values(a).every(Number.isFinite));
  }
  assert.deepEqual(nearbyLakes(0, 1000, { ...base, landscape: 'coast' }), []);
  assert.deepEqual(nearbyLakes(Infinity, 180, base), []);
});

test('the first alpine lake is not hidden behind the foreground road bank', () => {
  const settings = { ...base, curves: 0.8, grade: 0.06, roadWidth: 9, terrainHeight: 1.3 };
  const lake = lakeAt(0, settings);
  const targetX = lake.centerX - lake.radiusX * 0.35;
  const targetDistance = lake.centerDistance - lake.radiusZ * 0.1;
  // Follow a sightline from a typical chase-camera height to the near half of
  // the water. Safety alone previously passed while a high meadow hid it all.
  for (const start of [20, 60, 100]) {
    const eye = roadAt(start, settings);
    for (let part = 2; part <= 30; part++) {
      const t = part / 30;
      const distance = start + (targetDistance - start) * t;
      const worldX = eye.x + (targetX - eye.x) * t;
      const sightHeight = eye.y + 4 + (lake.elevation - eye.y - 4) * t;
      const ground = terrainAt(distance, worldX - roadAt(distance, settings).x, settings);
      assert.ok(ground < sightHeight - 0.3, 'foreground terrain must not occlude the water');
    }
  }
});

test('level water and its entire basin are separated from every allowed road envelope', () => {
  for (const grade of [0.03, 0.16])
    for (const curves of [0.2, 1.7])
      for (const roadWidth of [7, 16])
        for (const terrainHeight of [0.25, 2])
          for (const seed of [1, 42, 99999]) {
            const settings = { ...base, grade, curves, roadWidth, terrainHeight, seed };
            for (const index of [0, 1, 14285]) {
              const lake = lakeAt(index, settings);
              const extent = lake.radiusZ * lakeBasinScale;
              for (let step = 0; step <= 80; step++) {
                const s = lake.centerDistance - extent + (extent * 2 * step) / 80;
                const road = roadAt(s, settings);
                const closestBasinX = lake.centerX - lake.radiusX * lakeBasinScale;
                assert.ok(
                  closestBasinX - road.x > roadWidth / 2 + roadSupportWidth + 19.99,
                  'even the dry collar cannot intersect a sharp bend',
                );
                assert.ok(
                  lake.elevation < road.y - 7.99,
                  'one level plane stays below the lowest road section',
                );
              }
            }
          }
});

test('lakes carve true world-coordinate depressions with level, continuous shorelines', () => {
  for (const index of [0, 4, 14285])
    for (const curves of [0.2, 1.7])
      for (const grade of [0.03, 0.16]) {
        const settings = { ...base, curves, grade };
        const lake = lakeAt(index, settings);
        const at = (rho: number, angle: number) => {
          const s = lake.centerDistance + Math.sin(angle) * lake.radiusZ * rho;
          const worldX = lake.centerX + Math.cos(angle) * lake.radiusX * rho;
          return terrainAt(s, worldX - roadAt(s, settings).x, settings);
        };
        assert.ok(Math.abs(at(0, 0) - lake.elevation + 6) < 1e-8);
        for (let point = 0; point < 32; point++) {
          const angle = (point / 32) * Math.PI * 2;
          assert.ok(at(0.9, angle) < lake.elevation, 'lake interior is below its flat surface');
          assert.ok(
            Math.abs(at(1, angle) - lake.elevation) < 1e-7,
            'all shore points share one elevation',
          );
          assert.ok(at(1.05, angle) > lake.elevation, 'the immediate shore is dry');
          for (const boundary of [1, 1.22, lakeBasinScale]) {
            assert.ok(
              Math.abs(at(boundary - 0.00001, angle) - at(boundary + 0.00001, angle)) < 0.02,
              'no abrupt basin wall or outer collar seam',
            );
          }
        }
      }
});

test('adjacent chunks query identical lake data without shifting its water level', () => {
  for (const boundary of [180, 720, 10000080]) {
    const shared = nearbyLakes(boundary, 0, base);
    const previous = nearbyLakes(boundary - 180, 180, base);
    const next = nearbyLakes(boundary, 180, base);
    for (const lake of shared) {
      assert.deepEqual(
        previous.find((item) => item.index === lake.index),
        lake,
      );
      assert.deepEqual(
        next.find((item) => item.index === lake.index),
        lake,
      );
      const prevOrigin = roadElevation(boundary - 180, base);
      const nextOrigin = roadElevation(boundary, base);
      assert.ok(
        Math.abs(
          lake.elevation - prevOrigin + prevOrigin - (lake.elevation - nextOrigin + nextOrigin),
        ) < 1e-8,
      );
    }
  }
});
