import * as THREE from 'three';
import { buildVehicle } from './vehicles';
import type { CarId } from '../config/cars';

/** One lazy, shared renderer; no per-card WebGL contexts or permanent animation loops. */
export class VehicleThumbnails {
  private renderer?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-4, 4, 2, -2, 0.1, 50);
  private cache = new Map<CarId, { key: string; image: string }>();
  private renders = 0;

  constructor() {
    this.scene.add(new THREE.HemisphereLight('#fff9e9', '#748173', 2.1));
    const key = new THREE.DirectionalLight('#fff3d9', 2.9);
    key.position.set(-5, 9, -5);
    const fill = new THREE.DirectionalLight('#e4efff', 1.5);
    fill.position.set(5, 5, 4);
    this.scene.add(key, fill);
  }

  render(id: CarId, softness: number, color: string) {
    const key = `${softness}:${color}`;
    const cached = this.cache.get(id);
    if (cached?.key === key) return cached.image;
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
      });
      this.renderer.setSize(360, 208);
      this.renderer.setPixelRatio(1);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.setClearColor(0x000000, 0);
    }
    const vehicle = buildVehicle(id, softness, color);
    try {
      vehicle.setPaint(color, color);
      this.scene.add(vehicle.root);
      vehicle.root.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(vehicle.body);
      for (const wheel of vehicle.wheels) bounds.union(new THREE.Box3().setFromObject(wheel));
      const center = bounds.getCenter(new THREE.Vector3());
      this.camera.position
        .copy(center)
        .add(new THREE.Vector3(6, 3.5, -7).normalize().multiplyScalar(15));
      this.camera.lookAt(center);
      this.camera.updateMatrixWorld(true);
      let x = 0,
        y = 0;
      for (const xx of [bounds.min.x, bounds.max.x])
        for (const yy of [bounds.min.y, bounds.max.y])
          for (const zz of [bounds.min.z, bounds.max.z]) {
            const p = new THREE.Vector3(xx, yy, zz).applyMatrix4(this.camera.matrixWorldInverse);
            x = Math.max(x, Math.abs(p.x));
            y = Math.max(y, Math.abs(p.y));
          }
      const aspect = 360 / 208;
      const height = Math.max(y, x / aspect) * 1.12;
      this.camera.left = -height * aspect;
      this.camera.right = height * aspect;
      this.camera.top = height;
      this.camera.bottom = -height;
      this.camera.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camera);
      this.renders++;
      const image = this.renderer.domElement.toDataURL('image/webp', 0.9);
      this.cache.set(id, { key, image }); // At most one snapshot for each catalog car.
      return image;
    } finally {
      vehicle.dispose();
      this.renderer.renderLists.dispose();
    }
  }

  get telemetry() {
    return {
      cached: this.cache.size,
      renders: this.renders,
      ready: !!this.renderer,
      geometries: this.renderer?.info.memory.geometries ?? 0,
      textures: this.renderer?.info.memory.textures ?? 0,
    };
  }

  dispose() {
    this.cache.clear();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = undefined;
    this.scene.clear();
  }
}
