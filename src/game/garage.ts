import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { styles, type Settings } from '../config';
import { buildVehicle, type CarVisual } from './vehicles';
import { softBox } from './art';

export type GarageAngle = 'hero' | 'front' | 'side' | 'rear';

/** A stationary model workbench. No route, driving simulation, or tire effects. */
export class GarageScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 140);
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  private room = new THREE.Group();
  private vehicle!: CarVisual;
  private settings: Settings;
  private observer: ResizeObserver;
  private center = new THREE.Vector3();
  private radius = 3;
  private fitDistance = 10;
  private wireframe = false;

  constructor(
    private element: HTMLElement,
    settings: Settings,
  ) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    canvas.setAttribute(
      'aria-label',
      'Garage car preview. Drag to orbit; scroll or pinch to zoom. View buttons are also available.',
    );
    element.prepend(canvas);
    this.scene.background = new THREE.Color('#dfe2d9');
    this.scene.fog = new THREE.Fog('#dfe2d9', 18, 50);
    this.scene.add(this.room, new THREE.HemisphereLight('#fff9e9', '#748173', 2.1));
    const key = new THREE.DirectionalLight('#fff3d9', 2.9);
    key.position.set(-5, 9, -5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, {
      left: -7,
      right: 7,
      top: 7,
      bottom: -7,
      near: 0.5,
      far: 28,
    });
    key.shadow.normalBias = 0.035;
    key.shadow.bias = -0.0002;
    const fill = new THREE.DirectionalLight('#e4efff', 1.5);
    fill.position.set(5, 5, 4);
    this.scene.add(key, fill);
    this.buildRoom();
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.minPolarAngle = 0.2;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.08;
    this.controls.autoRotateSpeed = 0.65;
    this.applySettings(settings);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(element);
    this.resize();
    this.setView('hero');
  }

  private buildRoom() {
    const floor = new THREE.MeshStandardMaterial({ color: '#c6ccc0', roughness: 0.95 });
    const stone = new THREE.MeshStandardMaterial({ color: '#e9e7dc', roughness: 0.85 });
    const olive = new THREE.MeshStandardMaterial({ color: '#7d8d7b', roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: '#526057', roughness: 0.9 });
    const wood = new THREE.MeshStandardMaterial({ color: '#b7a68b', roughness: 0.8 });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      this.room.add(mesh);
      return mesh;
    };
    const slab = add(new THREE.PlaneGeometry(160, 160), floor);
    slab.rotation.x = -Math.PI / 2;
    add(new THREE.CylinderGeometry(3.65, 3.72, 0.12, 80), stone, 0, 0.04, 0);
    const rim = add(new THREE.TorusGeometry(3.6, 0.012, 5, 100), olive, 0, 0.108, 0);
    rim.rotation.x = -Math.PI / 2;
    const grid = new THREE.GridHelper(28, 14, '#b2bcae', '#b2bcae');
    grid.position.y = 0.006;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.4;
    this.room.add(grid);
    // Sparse workshop furniture sits outside the car's turntable and orbit.
    const cabinet = add(softBox(3.5, 1.05, 0.85, 0.35), olive, -6, 0.53, 5);
    cabinet.castShadow = true;
    add(softBox(3.65, 0.12, 1, 0.25), wood, -6, 1.12, 5);
    for (const x of [-7, -6, -5]) {
      add(softBox(0.82, 0.035, 0.035, 0.5), dark, x, 0.81, 4.56);
      add(softBox(0.82, 0.035, 0.035, 0.5), dark, x, 0.43, 4.56);
    }
    for (const x of [-6.8, -6.4, -6])
      add(new THREE.CylinderGeometry(0.12, 0.12, 0.24, 12), stone, x, 1.3, 5);
    for (let i = 0; i < 3; i++) {
      const tire = add(new THREE.TorusGeometry(0.34, 0.13, 8, 16), dark, 5.3, 0.15 + i * 0.25, 5);
      tire.rotation.x = Math.PI / 2;
    }
    add(softBox(2.3, 0.06, 0.06, 0.2), wood, 5.3, 0.91, 5);
  }

  private resize() {
    const width = Math.max(1, this.element.clientWidth),
      height = Math.max(1, this.element.clientHeight);
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.fit();
  }

  private fit() {
    const vertical = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect);
    this.fitDistance = (this.radius / Math.sin(Math.min(vertical, horizontal))) * 1.12;
    this.controls.minDistance = this.fitDistance;
    this.controls.maxDistance = this.fitDistance * 2;
    this.controls.target.copy(this.center);
    this.controls.update();
  }

  applySettings(settings: Settings) {
    const rebuild =
      !this.vehicle ||
      settings.car !== this.settings.car ||
      settings.roundness !== this.settings.roundness;
    this.settings = { ...settings, paint: { ...settings.paint } };
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, settings.pixelRatio));
    if (rebuild) {
      this.vehicle?.dispose();
      this.vehicle = buildVehicle(settings.car, settings.roundness, styles[settings.style].car);
      this.vehicle.root.position.y = 0.1;
      this.scene.add(this.vehicle.root);
      const bounds = new THREE.Box3().setFromObject(this.vehicle.root).expandByScalar(0.12);
      bounds.getCenter(this.center);
      this.radius = bounds.getSize(new THREE.Vector3()).length() / 2;
      this.setWireframe(this.wireframe);
      this.fit();
    }
    this.vehicle.setPaint(styles[settings.style].car, settings.paint[settings.car]);
  }

  setView(view: GarageAngle) {
    const direction = {
      hero: new THREE.Vector3(1, 0.56, -1.2),
      front: new THREE.Vector3(0, 0.26, -1),
      side: new THREE.Vector3(1, 0.22, 0),
      rear: new THREE.Vector3(0.65, 0.35, 1),
    }[view].normalize();
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update();
    this.camera.position.copy(this.center).addScaledVector(direction, this.fitDistance * 1.06);
    this.controls.target.copy(this.center);
    this.controls.update();
    this.controls.enableDamping = damping;
  }

  setWireframe(enabled: boolean) {
    this.wireframe = enabled;
    this.vehicle.root.traverse((item) => {
      if (!(item instanceof THREE.Mesh)) return;
      for (const mat of Array.isArray(item.material) ? item.material : [item.material])
        if (mat instanceof THREE.MeshStandardMaterial) mat.wireframe = enabled;
    });
  }

  render(dt: number) {
    this.controls.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
  get paintColor(): string {
    return this.vehicle.root.userData.paint;
  }
  get carId(): string {
    return this.vehicle.root.userData.carId;
  }

  dispose() {
    this.observer.disconnect();
    this.controls.dispose();
    this.vehicle.dispose();
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    this.scene.traverse((item) => {
      if (item instanceof THREE.Mesh || item instanceof THREE.LineSegments) {
        geometries.add(item.geometry);
        for (const mat of Array.isArray(item.material) ? item.material : [item.material])
          materials.add(mat);
      }
      if (item instanceof THREE.DirectionalLight) item.shadow.dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
