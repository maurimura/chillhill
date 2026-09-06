import * as THREE from 'three';
import { styles, type Settings } from '../config';
import { type DrivingState } from './driving';
import { carAxles } from '../config/cars';
import { buildVehicle, type CarVisual } from './vehicles';
import { random, roadAt, roadElevation, terrainAt } from './route';
import { softBox, softCrown, softRock, softenNormals, terrainGeometry } from './art';
import { TireSmoke } from './smoke';
import { followDistance, framingPullback } from './camera';
import { CoastalWater, seaGeometry } from './coast';
import { Weather } from './weather';
import { atmosphere, worldPalette } from './atmosphere';

const CHUNK = 180;
const UP = new THREE.Vector3(0, 1, 0);
const dummy = new THREE.Object3D();

function ribbon(
  start: number,
  length: number,
  left: number,
  right: number,
  settings: Settings,
  height = 0.025,
  originDistance = start,
) {
  const positions: number[] = [];
  const indices: number[] = [];
  const count = Math.max(1, Math.ceil(length / 3));
  for (let i = 0; i <= count; i++) {
    const s = start + (i / count) * length;
    const p = roadAt(s, settings);
    const y = p.y - roadElevation(originDistance, settings) + height;
    positions.push(p.x + left, y, originDistance - s, p.x + right, y, originDistance - s);
    if (i < count) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function combine(geometries: THREE.BufferGeometry[]) {
  const positions: number[] = [];
  for (const geometry of geometries) {
    const plain = geometry.toNonIndexed();
    positions.push(...plain.getAttribute('position').array);
    plain.dispose();
    geometry.dispose();
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.computeVertexNormals();
  return result;
}

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(53, 1, 0.1, 1400);
  private world = new THREE.Group();
  private car = new THREE.Group();
  private driftPivot = new THREE.Group();
  private model = new THREE.Group();
  private vehicle!: CarVisual;
  private smoke = new TireSmoke();
  private weather = new Weather();
  private water = new CoastalWater();
  private headlight = new THREE.SpotLight('#fff0ce', 0, 65, 0.65, 0.55, 1.5);
  private lighting!: ReturnType<typeof atmosphere>;
  private skyTarget = new THREE.Color();
  private fogTarget = new THREE.Color();
  private lightTarget = new THREE.Color();
  private fillTarget = new THREE.Color();
  private sunTarget = new THREE.Color();
  private lightHeight = 70;
  private gravel = { value: 0 };
  private rearLeft = new THREE.Vector3();
  private rearRight = new THREE.Vector3();
  private lastDistance = 20;
  private originDistance = 0;
  private originHeight = 0;
  private sunLight = new THREE.DirectionalLight('#fff0cf', 2.6);
  private ambient = new THREE.HemisphereLight('#e6efea', '#74745e', 2.5);
  private sun: THREE.Mesh;
  private chunks = new Map<number, THREE.Group>();
  private materials: Record<string, THREE.MeshStandardMaterial> = {};
  private treeGeometry: THREE.BufferGeometry = softCrown(0);
  private roundTreeGeometry: THREE.BufferGeometry = softRock(0);
  private trunkGeometry: THREE.BufferGeometry = new THREE.CylinderGeometry(0.15, 0.23, 1, 5);
  private rockGeometry: THREE.BufferGeometry = softRock(0);
  private mountainGeometry: THREE.BufferGeometry = softCrown(0);
  private lookTarget = new THREE.Vector3();
  private targetPosition = new THREE.Vector3();
  private desiredLook = new THREE.Vector3();
  private cameraOffset = new THREE.Vector3();
  private lookOffset = new THREE.Vector3();
  private viewDirection = new THREE.Vector3();
  private modelCenter = new THREE.Vector3();
  private modelCorners = Array.from({ length: 8 }, () => new THREE.Vector3());
  private cameraCorners = Array.from({ length: 8 }, () => new THREE.Vector3());
  private observer: ResizeObserver;
  private firstFrame = true;
  private frontView = false;
  private settings: Settings;
  private element: HTMLElement;

  constructor(element: HTMLElement, settings: Settings) {
    this.element = element;
    this.settings = { ...settings };
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, settings.pixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute(
      'aria-label',
      'A mountain road, viewed from behind your drifting car',
    );
    element.prepend(this.renderer.domElement);
    this.scene.add(
      this.world,
      this.car,
      this.sunLight,
      this.sunLight.target,
      this.ambient,
      this.smoke.mesh,
      this.weather.group,
    );
    this.car.name = 'car-route-root';
    this.world.name = 'streamed-world';
    this.driftPivot.name = 'front-axle-pivot';
    this.model.name = 'car-model';
    this.car.add(this.driftPivot);
    this.driftPivot.add(this.model);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sunLight.shadow.camera, {
      left: -28,
      right: 28,
      top: 35,
      bottom: -30,
      near: 1,
      far: 160,
    });
    this.sunLight.shadow.bias = -0.001;
    this.sunLight.shadow.normalBias = 0.12;
    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(23, 24, 16),
      new THREE.MeshBasicMaterial({ color: '#fff3ce', fog: false }),
    );
    this.scene.add(this.sun);
    this.applySettings(settings);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(element);
    this.resize();
  }

  private resize() {
    const { clientWidth: width, clientHeight: height } = this.element;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  applySettings(settings: Settings) {
    const shapeChanged = !this.vehicle || settings.roundness !== this.settings.roundness;
    const carChanged = !this.vehicle || settings.car !== this.settings.car;
    const worldKeys: (keyof Settings)[] = [
      'style',
      'seed',
      'curves',
      'roadWidth',
      'grade',
      'terrainHeight',
      'treeDensity',
      'roundness',
      'landscape',
      'season',
      'roadSurface',
      'roadMarkings',
      'roadside',
    ];
    const worldChanged =
      shapeChanged || worldKeys.some((key) => settings[key] !== this.settings[key]);
    if (worldChanged) {
      for (const [id, chunk] of this.chunks) this.removeChunk(id, chunk);
      this.smoke.reset();
    }
    if (carChanged) this.smoke.reset();
    if (settings.grade !== this.settings.grade)
      this.originHeight = roadElevation(this.originDistance, settings);
    this.settings = { ...settings };
    const palette = worldPalette(settings);
    this.lighting = atmosphere(settings);
    this.skyTarget.set(this.lighting.sky);
    this.fogTarget.set(this.lighting.fog);
    this.lightTarget.set(this.lighting.light);
    this.fillTarget.set(this.lighting.ambient);
    this.sunTarget.set(this.lighting.sun);
    if (!this.scene.background) this.scene.background = this.skyTarget.clone();
    if (!this.scene.fog) this.scene.fog = new THREE.Fog(this.fogTarget);
    this.weather.configure(settings.weather, settings.weatherIntensity);
    this.ambient.groundColor.set(palette.ground);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, settings.pixelRatio));
    for (const [name, color] of Object.entries({
      road: settings.roadSurface === 'gravel' ? palette.shoulder : palette.road,
      shoulder: palette.shoulder,
      marking: palette.marking,
      tree: palette.tree,
      treeLight: palette.treeLight,
      trunk: palette.trunk,
      rock: palette.rock,
      mountain: palette.mountain,
    })) {
      if (this.materials[name]) this.materials[name].color.set(color);
      else
        this.materials[name] = new THREE.MeshStandardMaterial({
          color,
          roughness: 1,
          flatShading: false,
        });
    }
    this.materials.road.roughness =
      settings.roadSurface === 'gravel' ? 1 : 1 - this.lighting.wetness * 0.7;
    this.materials.road.metalness = this.lighting.wetness * 0.1;
    this.gravel.value = settings.roadSurface === 'gravel' ? 1 : 0;
    this.materials.road.onBeforeCompile = (shader) => {
      shader.uniforms.gravel = this.gravel;
      shader.vertexShader = 'varying vec2 roadUV;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n roadUV = position.xz;',
      );
      shader.fragmentShader =
        'uniform float gravel; varying vec2 roadUV;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        float grain = fract(sin(dot(floor(roadUV * 10.0), vec2(127.1, 311.7))) * 43758.5453);
        diffuseColor.rgb *= mix(1.0, 0.84 + grain * 0.24, gravel);
      `,
      );
    };
    if (!this.materials.terrain)
      this.materials.terrain = new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: false,
        roughness: 1,
      });
    if (shapeChanged) {
      for (const geometry of [
        this.treeGeometry,
        this.roundTreeGeometry,
        this.trunkGeometry,
        this.rockGeometry,
        this.mountainGeometry,
      ])
        geometry.dispose();
      this.treeGeometry = softCrown(settings.roundness);
      this.roundTreeGeometry = softRock(settings.roundness);
      this.rockGeometry = softRock(settings.roundness);
      this.mountainGeometry = softCrown(settings.roundness, 32, 18);
      this.trunkGeometry = softenNormals(
        new THREE.CylinderGeometry(0.15, 0.23, 1, settings.roundness === 0 ? 5 : 12),
        settings.roundness,
      );
    }
    if (shapeChanged || carChanged) this.buildCar();
    this.vehicle.setPaint(palette.car, settings.paint[settings.car]);
  }

  private buildCar() {
    this.vehicle?.dispose();
    this.model.removeFromParent();
    this.vehicle = buildVehicle(
      this.settings.car,
      this.settings.roundness,
      styles[this.settings.style].car,
    );
    this.model = this.vehicle.root;
    // Cache actual geometry bounds before attaching the model to its drift pivot.
    // Padding covers suspension roll and the animated wheels between frames.
    const bounds = new THREE.Box3().setFromObject(this.model).expandByScalar(0.15);
    bounds.getCenter(this.modelCenter);
    this.modelCorners.forEach((corner, i) =>
      corner.set(
        i & 1 ? bounds.max.x : bounds.min.x,
        i & 2 ? bounds.max.y : bounds.min.y,
        i & 4 ? bounds.max.z : bounds.min.z,
      ),
    );
    const axles = carAxles(this.vehicle.spec);
    this.driftPivot.position.z = -axles.front;
    this.model.position.z = axles.front;
    this.driftPivot.add(this.model);
    this.headlight.position.set(0, 0.72, -this.vehicle.spec.length / 2);
    this.headlight.target.position.set(0, -0.15, -24);
    this.model.add(this.headlight, this.headlight.target);
  }

  private buildChunk(id: number) {
    const group = new THREE.Group();
    const geometries: THREE.BufferGeometry[] = [];
    group.userData.geometries = geometries;
    const start = id * CHUNK;
    const settings = this.settings;
    const palette = worldPalette(settings);
    const coastal = settings.landscape === 'coast';
    const pine = !coastal && palette.vegetation === 'pine';
    const half = settings.roadWidth / 2;
    const chunkHeight = roadElevation(start, settings);
    group.userData.distance = start;
    group.userData.height = chunkHeight;
    group.position.set(0, chunkHeight - this.originHeight, this.originDistance - start);
    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
      geometries.push(geometry);
      const item = new THREE.Mesh(geometry, material);
      item.receiveShadow = true;
      group.add(item);
      return item;
    };
    mesh(
      terrainGeometry(start, CHUNK, settings, palette.ground, palette.groundLight),
      this.materials.terrain,
    );
    if (coastal) {
      const water = mesh(seaGeometry(start, CHUNK, settings), this.water.material);
      water.name = 'coastal-water';
    }
    mesh(ribbon(start, CHUNK, -half - 1.25, half + 1.25, settings, 0), this.materials.shoulder);
    mesh(ribbon(start, CHUNK, -half, half, settings, 0.025), this.materials.road);
    const markings: THREE.BufferGeometry[] = [];
    if (settings.roadMarkings === 'dashed')
      for (let s = start; s < start + CHUNK; s += 12)
        markings.push(ribbon(s + 1, 4.5, -0.07, 0.07, settings, 0.041, start));
    if (settings.roadMarkings === 'double')
      for (const side of [-1, 1])
        markings.push(
          ribbon(start, CHUNK, side * 0.15 - 0.045, side * 0.15 + 0.045, settings, 0.041),
        );
    if (settings.roadMarkings !== 'none')
      for (const side of [-1, 1])
        markings.push(
          ribbon(
            start,
            CHUNK,
            side * (half - 0.35) - 0.05,
            side * (half - 0.35) + 0.05,
            settings,
            0.04,
          ),
        );
    if (markings.length) mesh(combine(markings), this.materials.marking).name = 'road-markings';

    const rng = random(settings.seed + id * 1009);
    const count = Math.round((coastal ? 30 : 60) * settings.treeDensity);
    const trunks = new THREE.InstancedMesh(this.trunkGeometry, this.materials.trunk, count);
    const crowns = new THREE.InstancedMesh(
      pine ? this.treeGeometry : this.roundTreeGeometry,
      this.materials.tree,
      count,
    );
    const tops = new THREE.InstancedMesh(
      pine ? this.treeGeometry : this.roundTreeGeometry,
      this.materials.treeLight,
      count,
    );
    crowns.castShadow = true;
    tops.castShadow = true;
    const instance = (
      target: THREE.InstancedMesh,
      index: number,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      rotation: number,
    ) => {
      dummy.position.set(x, y - chunkHeight, z + start);
      dummy.scale.set(sx, sy, sz);
      dummy.rotation.set(0, rotation, 0);
      dummy.updateMatrix();
      target.setMatrixAt(index, dummy.matrix);
    };
    for (let i = 0; i < count; i++) {
      const s = start + rng() * CHUNK;
      const side = coastal || rng() < 0.5 ? -1 : 1;
      const offset = side * (half + 4.5 + Math.pow(rng(), 1.7) * 120);
      const x = roadAt(s, settings).x + offset;
      const y = terrainAt(s, offset, settings);
      const height = (4.5 + rng() * 5.5) * (coastal ? 0.65 : 1);
      const rotation = rng() * Math.PI;
      instance(trunks, i, x, y + height * 0.25, -s, 1, height * 0.5, 1, rotation);
      if (pine) {
        instance(
          crowns,
          i,
          x,
          y + height * 0.53,
          -s,
          height * 0.3,
          height * 0.72,
          height * 0.3,
          rotation,
        );
        instance(
          tops,
          i,
          x,
          y + height * 0.77,
          -s,
          height * 0.22,
          height * 0.65,
          height * 0.22,
          rotation + 0.3,
        );
      } else {
        instance(
          crowns,
          i,
          x,
          y + height * 0.65,
          -s,
          height * 0.4,
          height * 0.47,
          height * 0.37,
          rotation,
        );
        instance(
          tops,
          i,
          x + height * 0.12,
          y + height * 0.85,
          -s,
          height * 0.3,
          height * 0.29,
          height * 0.28,
          rotation,
        );
      }
    }
    group.add(trunks, crowns, tops);
    const rocks = new THREE.InstancedMesh(this.rockGeometry, this.materials.rock, 24);
    for (let i = 0; i < 24; i++) {
      const s = start + rng() * CHUNK;
      const offset = (coastal || rng() < 0.5 ? -1 : 1) * (half + 3 + rng() * 52);
      const size = 0.5 + rng() * 1.9;
      instance(
        rocks,
        i,
        roadAt(s, settings).x + offset,
        terrainAt(s, offset, settings) + size * 0.3,
        -s,
        size * 1.3,
        size * 0.8,
        size,
        rng() * 6,
      );
    }
    group.add(rocks);
    for (let i = 0; i < (coastal ? 2 : 4); i++) {
      const s = start + rng() * CHUNK;
      const offset = (coastal ? -1 : i % 2 ? 1 : -1) * (190 + rng() * 180);
      const height = (60 + rng() * 110) * settings.terrainHeight;
      const mountain = new THREE.Mesh(this.mountainGeometry, this.materials.mountain);
      mountain.position.set(
        roadAt(s, settings).x + offset,
        terrainAt(s, offset, settings) + height * 0.24 - 10 - chunkHeight,
        start - s,
      );
      mountain.scale.set(80 + rng() * 80, height, 100 + rng() * 90);
      mountain.rotation.y = rng() * 3;
      group.add(mountain);
    }
    // Small cream roadside posts make motion and the edges easier to read.
    const postGeometry = softBox(0.14, 0.8, 0.14, settings.roundness);
    geometries.push(postGeometry);
    const posts = new THREE.InstancedMesh(postGeometry, this.materials.marking, 16);
    for (let i = 0; i < 16; i++) {
      const s = start + Math.floor(i / 2) * 24;
      const offset = (i % 2 ? 1 : -1) * (half + 0.8);
      const p = roadAt(s, settings);
      instance(posts, i, p.x + offset, p.y + 0.4, -s, 1, 1, 1, 0);
    }
    group.add(posts);
    if (settings.roadside === 'barriers') {
      const geometry = softBox(0.16, 0.22, 1, settings.roundness);
      geometries.push(geometry);
      const rails = new THREE.InstancedMesh(geometry, this.materials.marking, 60);
      rails.name = 'guardrails';
      const end = new THREE.Vector3();
      for (let i = 0; i < 60; i++) {
        const s = start + Math.floor(i / 2) * 6;
        const offset = (i % 2 ? 1 : -1) * (half + 0.8);
        const a = roadAt(s, settings),
          b = roadAt(s + 6, settings);
        dummy.position.set(
          (a.x + b.x) / 2 + offset,
          (a.y + b.y) / 2 - chunkHeight + 0.65,
          start - s - 3,
        );
        end.set(b.x + offset, b.y - chunkHeight + 0.65, start - s - 6);
        dummy.scale.set(1, 1, Math.hypot(b.x - a.x, b.y - a.y, 6) + 0.04);
        dummy.lookAt(end);
        dummy.updateMatrix();
        rails.setMatrixAt(i, dummy.matrix);
      }
      rails.castShadow = true;
      group.add(rails);
    }
    this.world.add(group);
    this.chunks.set(id, group);
  }

  private removeChunk(id: number, chunk: THREE.Group) {
    this.world.remove(chunk);
    for (const geometry of chunk.userData.geometries as THREE.BufferGeometry[]) geometry.dispose();
    chunk.traverse((item) => {
      if (item instanceof THREE.InstancedMesh) item.dispose();
    });
    this.chunks.delete(id);
  }

  render(
    state: DrivingState,
    dt: number,
    driving: boolean,
    braking: boolean,
    moving = true,
    frontView = false,
  ) {
    const cameraChanged = frontView !== this.frontView;
    this.frontView = frontView;
    if (
      state.distance < this.lastDistance - 1 ||
      Math.abs(state.distance - this.lastDistance) > Math.max(10, state.speed * dt * 2)
    ) {
      this.firstFrame = true;
      this.smoke.reset();
    }
    const id = Math.floor(state.distance / CHUNK);
    const nextOrigin = id * CHUNK;
    const nextHeight = roadElevation(nextOrigin, this.settings);
    if (nextOrigin !== this.originDistance || nextHeight !== this.originHeight) {
      const dy = this.originHeight - nextHeight,
        dz = nextOrigin - this.originDistance;
      // Camera/look offsets are car-relative and do not need rebasing.
      this.smoke.rebase(dy, dz);
      this.weather.rebase(dy, dz);
      this.originDistance = nextOrigin;
      this.originHeight = nextHeight;
      for (const chunk of this.chunks.values())
        chunk.position.set(
          0,
          chunk.userData.height - nextHeight,
          nextOrigin - chunk.userData.distance,
        );
    }
    // Keep the same seven-chunk budget, extending scenery in the viewing direction.
    const firstChunk = id - (frontView ? 5 : 1);
    const lastChunk = id + (frontView ? 1 : 5);
    for (let i = firstChunk; i <= lastChunk; i++) if (!this.chunks.has(i)) this.buildChunk(i);
    for (const [key, chunk] of this.chunks)
      if (key < firstChunk || key > lastChunk) this.removeChunk(key, chunk);
    const road = roadAt(state.distance, this.settings);
    this.car.position.set(
      road.x + state.offset,
      road.y - this.originHeight + 0.08,
      this.originDistance - state.distance,
    );
    this.car.rotation.set(Math.atan(road.dy), -road.heading, 0, 'YXZ');
    this.driftPivot.rotation.y = state.slide;
    this.vehicle.body.rotation.z = -state.steering * Math.min(state.speed / 20, 1) * 0.045;
    for (const wheel of this.vehicle.frontWheels)
      wheel.rotation.y =
        (-state.steering * 0.3 - state.slide * 0.65) * Math.min(state.speed / 5, 1);
    if (moving)
      for (const wheel of this.vehicle.wheels)
        wheel.rotation.x -= (state.speed * dt) / this.vehicle.spec.tireRadius;
    this.vehicle.brakeLights.emissiveIntensity = braking ? 2 : 0.15;
    this.car.updateMatrixWorld(true);
    const portrait = this.camera.aspect < 0.85;
    const distance = followDistance(frontView, driving, portrait, state.speed, state.slide);
    const lookAhead = driving ? (portrait ? 9 : 19) : portrait ? 18 : 34;
    const cameraHeight = driving ? (portrait ? 7.5 : 6.1) : 9.6;
    const follow = roadAt(state.distance + (frontView ? distance : -distance), this.settings);
    const ahead = roadAt(state.distance + lookAhead, this.settings);
    this.targetPosition.set(
      follow.x + state.offset * 0.65 + (driving ? 0 : portrait ? 1.8 : 7),
      frontView
        ? road.y - this.originHeight + (portrait ? 5.2 : 4.1) + state.speed * 0.025
        : follow.y - this.originHeight + cameraHeight,
      this.originDistance - state.distance + (frontView ? -distance : distance),
    );
    if (frontView) this.desiredLook.copy(this.modelCenter).applyMatrix4(this.model.matrixWorld);
    else
      this.desiredLook.set(
        ahead.x + state.offset * 0.35,
        road.y - this.originHeight + (driving ? 0.2 : 0.5),
        this.originDistance - state.distance - lookAhead,
      );
    // Switch sides immediately instead of sweeping the camera through the car.
    // Once on a side, retain the normal gentle follow smoothing.
    const smoothing = this.firstFrame || cameraChanged ? 1 : 1 - Math.exp(-3.7 * dt);
    // Smooth composition relative to the car, not its world-space translation.
    // Otherwise the car catches up to a front camera by roughly speed / 3.7 m.
    this.cameraOffset.lerp(this.targetPosition.sub(this.car.position), smoothing);
    this.lookOffset.lerp(this.desiredLook.sub(this.car.position), smoothing);
    this.camera.position.copy(this.car.position).add(this.cameraOffset);
    this.lookTarget.copy(this.car.position).add(this.lookOffset);
    this.camera.up.copy(UP);
    this.camera.lookAt(this.lookTarget);
    this.camera.fov += ((driving ? 53 + state.speed * 0.11 : 51) - this.camera.fov) * smoothing;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    this.cameraCorners.forEach((corner, i) =>
      corner
        .copy(this.modelCorners[i])
        .applyMatrix4(this.model.matrixWorld)
        .applyMatrix4(this.camera.matrixWorldInverse),
    );
    const pullback = framingPullback(this.cameraCorners, this.camera.fov, this.camera.aspect);
    if (pullback > 0) {
      this.camera.getWorldDirection(this.viewDirection);
      this.camera.position.addScaledVector(this.viewDirection, -pullback);
      this.camera.updateMatrixWorld(true);
      // Pull out immediately for safety; ease inward on subsequent frames.
      this.cameraOffset.copy(this.camera.position).sub(this.car.position);
    }
    const blend = this.firstFrame ? 1 : 1 - Math.exp(-2.5 * dt);
    (this.scene.background as THREE.Color).lerp(this.skyTarget, blend);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.lerp(this.fogTarget, blend);
    const haze = Math.min(1, this.settings.fog + this.lighting.cover * 0.35);
    fog.near = THREE.MathUtils.lerp(fog.near, 100 + (1 - haze) * 140, blend);
    fog.far = THREE.MathUtils.lerp(
      fog.far,
      (this.settings.landscape === 'coast' ? 520 : 440) +
        (1 - haze) * (this.settings.landscape === 'coast' ? 200 : 620),
      blend,
    );
    this.sunLight.color.lerp(this.lightTarget, blend);
    this.ambient.color.lerp(this.fillTarget, blend);
    this.sunLight.intensity = THREE.MathUtils.lerp(
      this.sunLight.intensity,
      this.lighting.power,
      blend,
    );
    this.ambient.intensity = THREE.MathUtils.lerp(
      this.ambient.intensity,
      this.lighting.fill,
      blend,
    );
    this.lightHeight = THREE.MathUtils.lerp(this.lightHeight, this.lighting.elevation, blend);
    const sunMaterial = this.sun.material as THREE.MeshBasicMaterial;
    sunMaterial.color.lerp(this.sunTarget, blend);
    sunMaterial.transparent = true;
    sunMaterial.opacity = THREE.MathUtils.lerp(
      sunMaterial.opacity,
      1 - this.lighting.cover * 0.95,
      blend,
    );
    this.headlight.intensity = THREE.MathUtils.lerp(
      this.headlight.intensity,
      this.lighting.night ? 140 : this.settings.timeOfDay === 'dusk' ? 45 : 0,
      blend,
    );
    this.vehicle.headlights.emissiveIntensity = this.headlight.intensity / 100;
    this.sunLight.position.set(
      road.x - 35,
      road.y - this.originHeight + this.lightHeight,
      this.originDistance - state.distance + 20,
    );
    this.sunLight.target.position.set(
      road.x,
      road.y - this.originHeight,
      this.originDistance - state.distance - 15,
    );
    this.sun.position.set(
      road.x + 240,
      road.y - this.originHeight + this.lightHeight * 2.2,
      this.originDistance - state.distance - 850,
    );
    this.model.localToWorld(this.rearLeft.copy(this.vehicle.rearLeft));
    this.model.localToWorld(this.rearRight.copy(this.vehicle.rearRight));
    this.smoke.update(
      moving ? dt : 0,
      state.speed > 2 ? state.driftAmount * this.settings.smoke : 0,
      this.rearLeft,
      this.rearRight,
    );
    this.weather.update(moving ? dt : 0, this.car.position, this.settings.wind);
    this.water.update(moving ? dt : 0, this.settings.wind);
    this.lastDistance = state.distance;
    this.renderer.render(this.scene, this.camera);
    this.firstFrame = false;
  }

  get smokeCount() {
    return this.smoke.activeCount;
  }

  get cameraMode() {
    return this.frontView ? 'front' : 'chase';
  }

  get paintColor() {
    return this.model.userData.paint as string;
  }

  get environment() {
    return {
      landscape: this.settings.landscape,
      weather: this.settings.weather,
      particles: this.weather.activeCount,
      weatherTime: this.weather.elapsed,
      headlight: this.headlight.intensity,
      chunks: this.chunks.size,
      geometries: this.renderer.info.memory.geometries,
    };
  }

  dispose() {
    this.observer.disconnect();
    this.vehicle.dispose();
    this.smoke.mesh.removeFromParent();
    this.smoke.dispose();
    this.weather.dispose();
    this.water.dispose();
    this.headlight.dispose();
    for (const [id, chunk] of this.chunks) this.removeChunk(id, chunk);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((item) => {
      if (item instanceof THREE.Mesh) {
        geometries.add(item.geometry);
        for (const material of Array.isArray(item.material) ? item.material : [item.material])
          materials.add(material);
      }
    });
    for (const geometry of [
      this.treeGeometry,
      this.roundTreeGeometry,
      this.trunkGeometry,
      this.rockGeometry,
      this.mountainGeometry,
      ...geometries,
    ])
      geometry.dispose();
    for (const material of [...Object.values(this.materials), ...materials]) material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
