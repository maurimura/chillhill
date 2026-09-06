import * as THREE from 'three';
import type { Settings } from '../config';
import { random } from './route';

const CAPACITY = 600;
/** A bounded, world-relative precipitation field shared by both driving cameras. */
export class Weather {
  readonly group = new THREE.Group();
  private positions = new Float32Array(CAPACITY * 3);
  private rainPositions = new Float32Array(CAPACITY * 6);
  private snowGeometry = new THREE.BufferGeometry();
  private rainGeometry = new THREE.BufferGeometry();
  private snowMaterial = new THREE.PointsMaterial({
    color: '#f3f5ee',
    size: 0.14,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  private rainMaterial = new THREE.LineBasicMaterial({
    color: '#d9e8eb',
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  private snow = new THREE.Points(this.snowGeometry, this.snowMaterial);
  private rain = new THREE.LineSegments(this.rainGeometry, this.rainMaterial);
  private previous = new THREE.Vector3();
  private delta = new THREE.Vector3();
  private initialized = false;
  private rng = random(781);
  private count = 0;
  private mode = 'clear';
  elapsed = 0;

  constructor() {
    this.group.name = 'weather';
    this.snowGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.rainGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.rainPositions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.snow.frustumCulled = this.rain.frustumCulled = false;
    this.group.add(this.snow, this.rain);
    this.configure('clear', 0);
    for (let i = 0; i < CAPACITY; i++) this.spawn(i, false);
  }
  private spawn(index: number, top: boolean) {
    this.positions.set(
      [(this.rng() - 0.5) * 110, top ? 35 : this.rng() * 42 - 7, (this.rng() - 0.5) * 150],
      index * 3,
    );
  }
  configure(mode: Settings['weather'], intensity: number) {
    this.count = mode === 'rain' || mode === 'snow' ? Math.round(CAPACITY * intensity) : 0;
    this.snow.visible = mode === 'snow' && this.count > 0;
    this.rain.visible = mode === 'rain' && this.count > 0;
    this.snowGeometry.setDrawRange(0, this.count);
    this.rainGeometry.setDrawRange(0, this.count * 2);
    if (mode !== this.mode) this.initialized = false;
    this.mode = mode;
  }
  rebase(dy: number, dz: number) {
    this.previous.y += dy;
    this.previous.z += dz;
  }
  update(dt: number, center: THREE.Vector3, wind: number) {
    this.delta.copy(center).sub(this.previous);
    if (!this.initialized || this.delta.lengthSq() > 10000) this.delta.set(0, 0, 0);
    this.previous.copy(center);
    this.group.position.copy(center);
    this.initialized = true;
    if (!this.count) return;
    this.elapsed += dt;
    for (let i = 0; i < this.count; i++) {
      const index = i * 3;
      this.positions[index] += dt * wind * 4 - this.delta.x;
      this.positions[index + 1] -=
        dt * (this.mode === 'rain' ? 25 : 2 + (i % 4) * 0.3) + this.delta.y;
      this.positions[index + 2] -= this.delta.z;
      if (
        this.positions[index + 1] < -7 ||
        Math.abs(this.positions[index]) > 55 ||
        Math.abs(this.positions[index + 2]) > 75
      )
        this.spawn(i, this.positions[index + 1] < -7);
      this.rainPositions.set(this.positions.subarray(index, index + 3), i * 6);
      this.rainPositions[i * 6 + 3] = this.positions[index] - wind * 0.15;
      this.rainPositions[i * 6 + 4] = this.positions[index + 1] + 0.7;
      this.rainPositions[i * 6 + 5] = this.positions[index + 2];
    }
    this.snowGeometry.getAttribute('position').needsUpdate = true;
    this.rainGeometry.getAttribute('position').needsUpdate = true;
  }
  get activeCount() {
    return this.count;
  }
  dispose() {
    this.group.removeFromParent();
    this.snowGeometry.dispose();
    this.rainGeometry.dispose();
    this.snowMaterial.dispose();
    this.rainMaterial.dispose();
  }
}
