import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cars, carAxles, type CarId, type CarSpec } from '../config/cars';
import { softBox, softenNormals } from './art';

export interface CarVisual {
  root: THREE.Group;
  body: THREE.Group;
  wheels: THREE.Group[];
  frontWheels: THREE.Group[];
  spec: CarSpec;
  rearLeft: THREE.Vector3;
  rearRight: THREE.Vector3;
  brakeLights: THREE.MeshStandardMaterial;
  headlights: THREE.MeshStandardMaterial;
  setPaint: (themeColor: string, customColor?: string | null) => void;
  dispose: () => void;
}

type Point = [number, number, number];
interface Section {
  z: number;
  width: number;
  y: number;
}

/** Round profile corners without overshooting the measured body envelope. */
function roundedSections(points: Section[], amount: number): Section[] {
  if (amount === 0) return points;
  const result = [points[0]];
  const blend = (a: Section, b: Section, t: number): Section => ({
    z: THREE.MathUtils.lerp(a.z, b.z, t),
    width: THREE.MathUtils.lerp(a.width, b.width, t),
    y: THREE.MathUtils.lerp(a.y, b.y, t),
  });
  for (let i = 1; i < points.length - 1; i++) {
    const a = blend(points[i], points[i - 1], amount * 0.3);
    const b = blend(points[i], points[i + 1], amount * 0.3);
    for (let step = 0; step <= 5; step++) {
      const t = step / 5;
      result.push(blend(blend(a, points[i], t), blend(points[i], b, t), t));
    }
  }
  result.push(points.at(-1)!);
  return result;
}

/** All car meshes live in meters; forward is -Z, origin is the body center. */
export function buildVehicle(id: CarId, roundness: number, themeColor: string): CarVisual {
  const spec = cars[id];
  const axles = carAxles(spec);
  const root = new THREE.Group();
  root.name = 'car-model';
  root.userData.carId = id;
  const body = new THREE.Group();
  body.name = 'car-body';
  root.add(body);
  const wheels: THREE.Group[] = [],
    frontWheels: THREE.Group[] = [];
  const ownedMaterials = new Set<THREE.Material>();
  const textures: THREE.Texture[] = [];
  const material = (color: string, roughness = 0.7, metalness = 0) => {
    const result = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      side: THREE.DoubleSide,
    });
    ownedMaterials.add(result);
    return result;
  };
  const paint = material('#a7b4b9', 0.52, 0.16);
  paint.name = 'car-paint';
  const dark = material('#263137');
  const glass = material('#39535c', 0.24, 0.12);
  const cream = material('#ecdfba');
  const rubber = material('#252b2d', 1);
  const alloy = material('#b7c0be', 0.4, 0.5);
  const light = material('#f1ecdb', 0.3);
  light.emissive.set('#fff1cc');
  light.emissiveIntensity = 0;
  const gold = material('#c6a65b', 0.45, 0.45);
  const brakeLights = material('#ad3935', 0.45);
  brakeLights.emissive.set('#fb553b');
  brakeLights.emissiveIntensity = 0.15;
  const clearLens = material('#d4d9d3', 0.35);

  const add = (
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    parent: THREE.Object3D = body,
  ) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.castShadow = true;
    // Small overlapping trim should not self-shadow into noisy stripes.
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  };
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat = paint,
    parent: THREE.Object3D = body,
  ) => {
    const mesh = add(softBox(w, h, d, roundness), mat, parent);
    mesh.position.set(x, y, z);
    return mesh;
  };
  const panel = (points: Point[], mat: THREE.Material) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    const indices: number[] = [];
    for (let i = 1; i < points.length - 1; i++) indices.push(0, i, i + 1);
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return add(geometry, mat);
  };
  const sample = (sections: Section[], z: number) => {
    for (let i = 0; i < sections.length - 1; i++)
      if (z <= sections[i + 1].z) {
        const t = THREE.MathUtils.clamp(
          (z - sections[i].z) / (sections[i + 1].z - sections[i].z),
          0,
          1,
        );
        return {
          width: THREE.MathUtils.lerp(sections[i].width, sections[i + 1].width, t),
          y: THREE.MathUtils.lerp(sections[i].y, sections[i + 1].y, t),
        };
      }
    return sections.at(-1)!;
  };
  const surface = (
    zs: number[],
    us: number[],
    point: (z: number, u: number) => Point,
    mat: THREE.Material,
  ) => {
    const positions: number[] = [],
      indices: number[] = [];
    zs.forEach((z, row) => {
      for (const u of us) positions.push(...point(z, u));
      if (row < zs.length - 1)
        for (let col = 0; col < us.length - 1; col++) {
          const i = row * us.length + col,
            j = i + us.length;
          indices.push(i, j, i + 1, i + 1, j, j + 1);
        }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return add(softenNormals(geometry, roundness), mat);
  };
  const bowtie = (z: number, y: number, front = false) => {
    const shape = new THREE.Shape();
    const points = [
      [-1, -0.18],
      [-0.35, -0.18],
      [-0.25, -0.45],
      [0.4, -0.45],
      [0.3, -0.18],
      [1, -0.18],
      [1, 0.18],
      [0.35, 0.18],
      [0.25, 0.45],
      [-0.4, 0.45],
      [-0.3, 0.18],
      [-1, 0.18],
    ];
    points.forEach(([x, y], i) =>
      i ? shape.lineTo(x * 0.11, y * 0.12) : shape.moveTo(x * 0.11, y * 0.12),
    );
    shape.closePath();
    const mesh = add(new THREE.ShapeGeometry(shape), gold);
    mesh.position.set(0, y, z);
    if (front) mesh.rotation.y = Math.PI;
  };
  const badge = (
    text: string,
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    plate = false,
  ) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext('2d')!;
    if (plate) {
      context.fillStyle = '#243033';
      context.fillRect(0, 0, 512, 128);
    }
    context.fillStyle = '#edf1e8';
    context.font = '600 76px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 256, 68);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: !plate,
      depthWrite: plate,
      side: THREE.DoubleSide,
    });
    ownedMaterials.add(mat);
    const mesh = add(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
  };

  if (spec.kind === 'wagon') {
    box(1.88, 0.56, 3.7, 0, 0.68, 0);
    box(1.78, 0.18, 3.4, 0, 0.93, 0);
    box(1.64, 0.59, 1.9, 0, 1.25, 0.22, glass);
    box(1.78, 0.13, 2.1, 0, 1.59, 0.22, cream);
    for (const x of [-0.83, 0.83]) {
      for (const z of [-0.71, 0.22, 1.15]) box(0.07, 0.67, 0.08, x, 1.26, z);
      box(0.12, 0.12, 0.32, x * 1.22, 1.03, -0.8);
      box(0.04, 0.06, 0.21, x * 1.1, 0.91, 0.4, alloy);
    }
    for (const z of [-1.86, 1.86]) box(1.93, 0.15, 0.17, 0, 0.49, z, alloy);
    box(0.74, 0.2, 0.02, 0, 0.73, -1.86, dark);
    box(0.49, 0.16, 0.035, 0, 0.59, 1.96, cream);
    for (const x of [-0.66, 0.66]) {
      box(0.38, 0.22, 0.045, x, 0.77, 1.86, brakeLights);
      box(0.4, 0.25, 0.045, x, 0.78, -1.86, light);
    }
    for (const x of [-0.65, 0.65]) box(0.06, 0.09, 1.6, x, 1.7, 0.22, dark);
  } else {
    const sedan = spec.kind === 'astra-sedan';
    const front = -spec.length / 2,
      rear = spec.length / 2,
      half = spec.width / 2;
    // Tapered hood/fender belt with open wheel arches, rather than a solid box.
    const belt = roundedSections(
      [
        { z: front, width: half * 0.91, y: 0.71 },
        { z: front + 0.2, width: half * 0.99, y: 0.79 },
        { z: -1.05, width: half, y: 0.86 },
        { z: -0.75, width: half, y: 0.9 },
        { z: 0.65, width: half, y: 0.92 },
        { z: rear - 0.35, width: half * 0.985, y: sedan ? 0.87 : 0.97 },
        { z: rear, width: half * 0.94, y: sedan ? 0.84 : 0.98 },
      ],
      roundness,
    );
    const topPositions: number[] = [],
      topIndices: number[] = [];
    const widths = [-1, -0.91, 0, 0.91, 1];
    belt.forEach((section, row) => {
      for (const u of widths)
        topPositions.push(
          u * section.width,
          section.y - Math.max(0, Math.abs(u) - 0.9) * 0.4,
          section.z,
        );
      if (row < belt.length - 1)
        for (let col = 0; col < widths.length - 1; col++) {
          const i = row * widths.length + col,
            j = i + widths.length;
          topIndices.push(i, j, i + 1, i + 1, j, j + 1);
        }
    });
    const top = new THREE.BufferGeometry();
    top.setAttribute('position', new THREE.Float32BufferAttribute(topPositions, 3));
    top.setIndex(topIndices);
    top.computeVertexNormals();
    add(softenNormals(top, roundness), paint);
    for (const side of [-1, 1]) {
      const outline = new THREE.Shape();
      outline.moveTo(front, 0.24);
      const arch = spec.tireRadius + 0.04;
      for (const z of [-axles.front, axles.rear]) {
        outline.lineTo(z - arch, 0.24);
        outline.lineTo(z - arch, spec.tireRadius);
        for (let i = 0; i <= 20; i++) {
          const angle = Math.PI * (1 - i / 20);
          outline.lineTo(z + Math.cos(angle) * arch, spec.tireRadius + Math.sin(angle) * arch);
        }
        outline.lineTo(z + arch, 0.24);
        const lip = add(
          new THREE.TorusGeometry(arch, 0.014, 4, roundness === 0 ? 12 : 24, Math.PI),
          paint,
        );
        lip.rotation.y = Math.PI / 2;
        lip.position.set(side * sample(belt, z).width, spec.tireRadius, z);
      }
      outline.lineTo(rear, 0.24);
      for (const section of [...belt].reverse()) outline.lineTo(section.z, section.y - 0.04);
      outline.closePath();
      const geometry = new THREE.ShapeGeometry(outline);
      const positions = geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        const z = positions.getX(i),
          y = positions.getY(i);
        positions.setXYZ(i, side * sample(belt, z).width, y, z);
      }
      geometry.computeVertexNormals();
      add(geometry, paint);
      // Door shut lines, protective side moldings and two handles per side.
      box(0.018, 0.045, 1.92, side * (half + 0.004), 0.57, 0.05, dark);
      box(0.022, 0.033, 0.16, side * (half + 0.007), 0.83, 0.33, dark);
      box(0.022, 0.033, 0.16, side * (half + 0.007), 0.85, 1.01, dark);
      box(0.012, 0.53, 0.009, side * (half + 0.003), 0.61, 0.46, dark);
    }
    panel(
      [
        [-belt[0].width, 0.25, front],
        [belt[0].width, 0.25, front],
        [belt[0].width, 0.71, front],
        [-belt[0].width, 0.71, front],
      ],
      paint,
    );
    const back = belt.at(-1)!;
    panel(
      [
        [-back.width, 0.25, rear],
        [back.width, 0.25, rear],
        [back.width, back.y, rear],
        [-back.width, back.y, rear],
      ],
      paint,
    );
    box(spec.width * 0.94, 0.24, 0.15, 0, 0.38, front + 0.065);
    box(spec.width * 0.97, 0.24, 0.15, 0, 0.39, rear - 0.065);

    // The hatch's long sloping rear glass and the sedan's separate trunk are
    // distinct silhouettes, based on the manual's side elevations.
    const roofEnd = sedan ? 0.66 : 0.84,
      cabinEnd = sedan ? 1.58 : 1.94;
    const cabin = roundedSections(
      [
        { z: -0.88, width: 0.78, y: 0.9 },
        { z: -0.2, width: 0.675, y: spec.height - 0.035 },
        { z: 0.18, width: 0.67, y: spec.height },
        { z: roofEnd, width: 0.68, y: spec.height - 0.018 },
        { z: roofEnd + 0.22, width: 0.7, y: spec.height - 0.085 },
        { z: cabinEnd, width: 0.78, y: sedan ? 0.96 : 1.02 },
      ],
      roundness,
    );
    const cabinRows = cabin.map((section) => section.z);
    const roofPoint = (z: number, u: number): Point => {
      const section = sample(cabin, z);
      return [u * section.width, section.y - u * u * 0.034 * roundness, z];
    };
    surface(cabinRows, [-1, -0.7, 0, 0.7, 1], roofPoint, paint);
    const rowsBetween = (start: number, end: number) => [
      start,
      ...cabinRows.filter((z) => z > start && z < end),
      end,
    ];
    const roofGlass = (start: number, end: number) => {
      surface(
        rowsBetween(start, end),
        [-0.9, -0.63, 0, 0.63, 0.9],
        (z, u) => {
          const point = roofPoint(z, u);
          point[1] += 0.008;
          return point;
        },
        glass,
      );
    };
    roofGlass(-0.79, -0.27);
    roofGlass(roofEnd + 0.09, cabinEnd - 0.13);
    for (const side of [-1, 1]) {
      const sidePoint = (z: number, y: number, inset = 0): Point => {
        const section = sample(cabin, z);
        const baseY = sample(belt, z).y - 0.015;
        const fraction = THREE.MathUtils.clamp(
          (y - baseY) / Math.max(0.01, section.y - 0.034 * roundness - baseY),
          0,
          1,
        );
        return [side * (THREE.MathUtils.lerp(0.795, section.width, fraction) + inset), y, z];
      };
      surface(
        cabinRows,
        [0, 1],
        (z, u) =>
          sidePoint(
            z,
            THREE.MathUtils.lerp(
              sample(belt, z).y - 0.015,
              sample(cabin, z).y - 0.034 * roundness,
              u,
            ),
          ),
        paint,
      );
      const sideGlass = (start: number, end: number) => {
        surface(
          rowsBetween(start, end),
          [0, 1],
          (z, u) => {
            const base = sample(belt, z).y + 0.05;
            const top = Math.max(base + 0.006, sample(cabin, z).y - 0.072);
            return sidePoint(z, THREE.MathUtils.lerp(base, top, u), 0.012);
          },
          glass,
        );
      };
      sideGlass(-0.7, 0.38);
      sideGlass(0.47, sedan ? 1.1 : 1.24);
      sideGlass(sedan ? 1.18 : 1.32, cabinEnd - 0.2);
      box(0.012, 0.16, 0.009, side * (half + 0.003), 0.83, 1.22, dark);
      // Mirrors span the documented mirror-to-mirror width.
      box(0.14, 0.105, 0.21, side * (spec.mirrorWidth / 2 - 0.07), 0.972, -0.69);
      box(0.105, 0.068, 0.012, side * (spec.mirrorWidth / 2 - 0.075), 0.975, -0.58, alloy);
    }
    // Facelift lamps, grille, bowties and rear hatch detailing.
    for (const side of [-1, 1]) {
      panel(
        [
          [side * 0.34, 0.715, front - 0.025],
          [side * 0.7, 0.745, front - 0.025],
          [side * 0.765, 0.71, front - 0.025],
          [side * 0.775, 0.61, front - 0.025],
          [side * 0.73, 0.588, front - 0.025],
          [side * 0.36, 0.59, front - 0.025],
        ],
        light,
      );
      box(0.19, 0.09, 0.018, side * 0.64, 0.38, front - 0.014, light);
      if (sedan) {
        panel(
          [
            [side * 0.38, 0.8, rear + 0.006],
            [side * 0.78, 0.82, rear + 0.006],
            [side * 0.79, 0.59, rear + 0.006],
            [side * 0.39, 0.62, rear + 0.006],
          ],
          brakeLights,
        );
        box(0.25, 0.045, 0.013, side * 0.58, 0.68, rear + 0.015, clearLens);
      } else {
        panel(
          [
            [side * 0.55, 0.91, rear + 0.006],
            [side * 0.77, 0.955, rear + 0.006],
            [side * 0.8, 0.56, rear + 0.006],
            [side * 0.56, 0.6, rear + 0.006],
          ],
          brakeLights,
        );
        box(0.19, 0.048, 0.013, side * 0.68, 0.71, rear + 0.015, clearLens);
      }
    }
    box(0.62, 0.135, 0.018, 0, 0.64, front - 0.013, dark);
    for (const y of [0.606, 0.65, 0.686]) box(0.6, 0.009, 0.023, 0, y, front - 0.018, alloy);
    box(0.9, 0.055, 0.018, 0, 0.38, front - 0.022, dark);
    bowtie(front - 0.034, 0.65, true);
    bowtie(rear + 0.012, sedan ? 0.78 : 0.85);
    badge('ASTRA', 0.26, 0.052, 0.31, sedan ? 0.76 : 0.835, rear + 0.014);
    badge('chillhill', 0.39, 0.115, 0, 0.58, rear + 0.024, true);
    if (!sedan) {
      const wiper = box(
        0.33,
        0.016,
        0.018,
        -0.09,
        sample(cabin, cabinEnd - 0.17).y + 0.025,
        cabinEnd - 0.17,
        dark,
      );
      wiper.rotation.y = -0.14;
      box(1.27, 0.034, 0.105, 0, 1.008, rear - 0.08);
    }
    const antenna = box(0.012, 0.18, 0.012, 0, spec.height + 0.035, roofEnd - 0.17, dark);
    antenna.rotation.x = 0.42;
    const exhaust = add(new THREE.CylinderGeometry(0.039, 0.039, 0.17, 10), dark);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(-0.52, 0.24, rear - 0.06);
  }

  // Shared wheel construction, with each car's actual axle locations/tracks.
  for (const side of [-1, 1])
    for (const isFront of [true, false]) {
      const track = isFront ? spec.frontTrack : spec.rearTrack;
      const z = isFront ? -axles.front : axles.rear;
      const assembly = new THREE.Group();
      assembly.name = `${isFront ? 'front' : 'rear'}-wheel-${side < 0 ? 'left' : 'right'}`;
      assembly.position.set(
        (side * track) / 2,
        spec.tireRadius + (spec.kind === 'wagon' ? 0.03 : 0.01),
        z,
      );
      root.add(assembly);
      if (isFront) frontWheels.push(assembly);
      const spin = new THREE.Group();
      assembly.add(spin);
      wheels.push(spin);
      const tire = add(
        new THREE.CylinderGeometry(
          spec.tireRadius,
          spec.tireRadius,
          spec.tireWidth,
          roundness === 0 ? 12 : 24,
        ),
        rubber,
        spin,
      );
      tire.rotation.z = Math.PI / 2;
      const hub = add(
        new THREE.CylinderGeometry(
          spec.tireRadius * 0.61,
          spec.tireRadius * 0.61,
          spec.tireWidth + 0.009,
          20,
        ),
        spec.kind === 'wagon' ? cream : dark,
        spin,
      );
      hub.rotation.z = Math.PI / 2;
      if (spec.kind !== 'wagon') {
        for (let i = 0; i < 5; i++) {
          const angle = (i / 5) * Math.PI * 2;
          const spoke = box(
            0.018,
            spec.tireRadius * 0.6,
            0.047,
            side * (spec.tireWidth / 2 + 0.011),
            Math.cos(angle) * spec.tireRadius * 0.27,
            Math.sin(angle) * spec.tireRadius * 0.27,
            alloy,
            spin,
          );
          spoke.rotation.x = angle;
        }
        const rim = add(new THREE.TorusGeometry(spec.tireRadius * 0.6, 0.017, 4, 24), alloy, spin);
        rim.rotation.y = Math.PI / 2;
        rim.position.x = side * (spec.tireWidth / 2 + 0.009);
        const center = add(
          new THREE.CylinderGeometry(0.048, 0.048, spec.tireWidth + 0.04, 12),
          alloy,
          spin,
        );
        center.rotation.z = Math.PI / 2;
      }
    }
  // Bake static pieces by material, while keeping the body roll and each wheel
  // spin/steering group independent. Small details do not each cost a draw call.
  for (const group of [body, ...wheels]) {
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const child of [...group.children]) {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) continue;
      const mat = child.material;
      if (mat instanceof THREE.MeshBasicMaterial && mat.map) continue;
      child.updateMatrix();
      const geometry = child.geometry.index
        ? child.geometry.toNonIndexed()
        : child.geometry.clone();
      geometry.applyMatrix4(child.matrix);
      geometry.deleteAttribute('uv');
      const batch = batches.get(mat) ?? [];
      batch.push(geometry);
      batches.set(mat, batch);
      child.geometry.dispose();
      child.removeFromParent();
    }
    for (const [mat, geometries] of batches) {
      const geometry = mergeGeometries(geometries)!;
      for (const part of geometries) part.dispose();
      add(geometry, mat, group);
    }
  }
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: '#29322b',
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  ownedMaterials.add(shadowMaterial);
  const shadow = add(new THREE.CircleGeometry(1, 24), shadowMaterial, root);
  shadow.castShadow = false;
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(spec.width * 0.61, spec.length * 0.56, 1);
  shadow.position.y = 0.02;
  const setPaint = (color: string, customColor?: string | null) => {
    paint.color.set(customColor ?? spec.paint ?? color);
    if (!customColor && spec.paint) paint.color.lerp(new THREE.Color(color), 0.12);
    root.userData.paint = `#${paint.color.getHexString()}`;
  };
  setPaint(themeColor);
  return {
    root,
    body,
    wheels,
    frontWheels,
    spec,
    brakeLights,
    headlights: light,
    rearLeft: new THREE.Vector3(-spec.rearTrack / 2, 0.15, axles.rear),
    rearRight: new THREE.Vector3(spec.rearTrack / 2, 0.15, axles.rear),
    setPaint,
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      root.traverse((item) => {
        if (item instanceof THREE.Mesh) geometries.add(item.geometry);
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
      for (const texture of textures) texture.dispose();
      root.removeFromParent();
    },
  };
}
