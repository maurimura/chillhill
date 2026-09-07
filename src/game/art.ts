import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Settings } from '../config';
import { roadAt, roadElevation, terrainAt } from './route';
import { roadSupportWidth } from '../config/road';

/** Blend facet normals into the shape's smooth normals as softness increases. */
export function softenNormals(source: THREE.BufferGeometry, amount: number) {
  const geometry = source.index ? source.toNonIndexed() : source;
  if (geometry !== source) source.dispose();
  const smooth = Float32Array.from(geometry.getAttribute('normal').array);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  const normal = new THREE.Vector3();
  const target = new THREE.Vector3();
  for (let i = 0; i < normals.count; i++) {
    normal.fromBufferAttribute(normals, i);
    target.fromArray(smooth, i * 3);
    normal.lerp(target, amount).normalize();
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  return geometry;
}

export function softBox(w: number, h: number, d: number, amount: number) {
  if (amount === 0) return new THREE.BoxGeometry(w, h, d);
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.44 * amount);
}

/** Morph a conical silhouette toward a rounded, plump crown or hill. */
export function softCrown(amount: number, segments = 20, steps = 12) {
  if (amount === 0) return softenNormals(new THREE.ConeGeometry(1, 1, 6), 0);
  const points = [new THREE.Vector2(0, -0.5)];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI;
    const y = -Math.cos(angle) * 0.5;
    const radius = THREE.MathUtils.lerp(0.5 - y, Math.sin(angle), amount);
    points.push(new THREE.Vector2(Math.max(0, radius), y));
  }
  return softenNormals(new THREE.LatheGeometry(points, segments), amount);
}

export function softRock(amount: number) {
  return softenNormals(new THREE.IcosahedronGeometry(1, amount === 0 ? 0 : 2), amount);
}

/** A broad, stepped sandstone plateau; softness rounds its edges, not its identity. */
export function mesaGeometry(amount: number) {
  const profile = [
    [0, -0.5],
    [1, -0.5],
    [0.95, -0.32],
    [0.8, -0.23],
    [0.78, -0.03],
    [0.66, 0.05],
    [0.62, 0.37],
    [0.55, 0.5],
    [0, 0.5],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return softenNormals(new THREE.LatheGeometry(profile, amount === 0 ? 6 : 12), amount * 0.65);
}

export function terrainGeometry(
  start: number,
  length: number,
  settings: Settings,
  ground: string,
  light: string,
) {
  const originHeight = roadElevation(start, settings);
  const half = settings.roadWidth / 2;
  const baseOffsets = [
    -420,
    -280,
    -180,
    -120,
    -80,
    -50,
    -32,
    -21,
    -half - 5,
    -half - roadSupportWidth,
    0,
    half + roadSupportWidth,
    half + 5,
    21,
    32,
    50,
    80,
    120,
    180,
    280,
    420,
    ...(settings.landscape === 'city' ? [620, 900] : []),
  ];
  const subdivisions = settings.roundness === 0 ? 1 : 3;
  const offsets: number[] = [];
  for (let i = 0; i < baseOffsets.length - 1; i++) {
    for (let j = 0; j < subdivisions; j++)
      offsets.push(THREE.MathUtils.lerp(baseOffsets[i], baseOffsets[i + 1], j / subdivisions));
  }
  offsets.push(baseOffsets.at(-1)!);
  const rows = settings.roundness === 0 ? 20 : 40;
  const positions: number[] = [],
    colors: number[] = [],
    normals: number[] = [],
    indices: number[] = [];
  const darkColor = new THREE.Color(ground),
    lightColor = new THREE.Color(light);
  const color = new THREE.Color(),
    normal = new THREE.Vector3();
  const sand = new THREE.Color(settings.season === 'winter' ? '#d9e4e3' : '#d8c9a1');
  for (let row = 0; row <= rows; row++) {
    const s = start + (row / rows) * length;
    const road = roadAt(s, settings);
    for (const offset of offsets) {
      positions.push(road.x + offset, terrainAt(s, offset, settings) - originHeight, start - s);
      // Finite-difference normals use the same world coordinates on both sides
      // of a chunk boundary, preventing seams in the smooth terrain.
      const across = terrainAt(s, offset + 0.25, settings) - terrainAt(s, offset - 0.25, settings);
      const along = terrainAt(s + 0.25, offset, settings) - terrainAt(s - 0.25, offset, settings);
      normal.set(-across * 2, 1, (along - across * road.dx) * 2).normalize();
      normals.push(normal.x, normal.y, normal.z);
      const shade = 0.38 + 0.16 * Math.sin(s * 0.021 + offset * 0.031 + settings.seed);
      color.copy(darkColor).lerp(lightColor, shade);
      if (settings.landscape === 'coast' && offset > half + 3)
        color.lerp(sand, Math.min(1, (offset - half - 3) / 13));
      colors.push(color.r, color.g, color.b);
    }
    if (row < rows)
      for (let col = 0; col < offsets.length - 1; col++) {
        const a = row * offsets.length + col,
          b = a + offsets.length;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
  }
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  source.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  source.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  source.setIndex(indices);
  const geometry = softenNormals(source, settings.roundness);
  const vertexColors = geometry.getAttribute('color');
  for (let triangle = 0; triangle < indices.length / 3; triangle++) {
    const cell = Math.floor(triangle / 2);
    const row = Math.floor(cell / (offsets.length - 1));
    const col = cell % (offsets.length - 1);
    const shade =
      0.35 + 0.24 * Math.sin((start + (row / rows) * length) * 0.049 + col * 2.71 + settings.seed);
    const facet = darkColor.clone().lerp(lightColor, shade);
    for (let corner = 0; corner < 3; corner++) {
      const i = triangle * 3 + corner;
      const offset = offsets[indices[triangle * 3 + corner] % offsets.length];
      const coast = settings.landscape === 'coast' && offset > half + 3;
      color
        .fromBufferAttribute(vertexColors, i)
        .lerp(coast ? facet.clone().lerp(sand, 0.9) : facet, 1 - settings.roundness);
      vertexColors.setXYZ(i, color.r, color.g, color.b);
    }
  }
  return geometry;
}
