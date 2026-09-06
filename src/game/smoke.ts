import * as THREE from 'three';

const CAPACITY = 80;
interface Puff {
  age: number;
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  size: number;
}

/** World-space rear-tire puffs, pooled and drawn together in one draw call. */
export class TireSmoke {
  readonly mesh: THREE.Mesh;
  private geometry: THREE.InstancedBufferGeometry;
  private material: THREE.ShaderMaterial;
  private centers = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  private sizes = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1).setUsage(
    THREE.DynamicDrawUsage,
  );
  private opacity = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1).setUsage(
    THREE.DynamicDrawUsage,
  );
  private puffs: Puff[] = Array.from({ length: CAPACITY }, () => ({
    age: 10,
    life: 1,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vz: 0,
    size: 0,
  }));
  private cursor = 0;
  private emission = 0;
  private previous = [new THREE.Vector3(), new THREE.Vector3()];
  private havePrevious = false;
  activeCount = 0;

  constructor() {
    const plane = new THREE.PlaneGeometry(1, 1);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = plane.index;
    this.geometry.attributes = { ...plane.attributes };
    this.geometry.instanceCount = CAPACITY;
    this.geometry.setAttribute('puffCenter', this.centers);
    this.geometry.setAttribute('puffSize', this.sizes);
    this.geometry.setAttribute('puffOpacity', this.opacity);
    plane.dispose();
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { puffColor: { value: new THREE.Color('#f0eddf') } },
      ]),
      vertexShader: `
        attribute vec3 puffCenter;
        attribute float puffSize;
        attribute float puffOpacity;
        varying vec2 vPuffUv;
        varying float vPuffOpacity;
        #include <fog_pars_vertex>
        void main() {
          vPuffUv = uv;
          vPuffOpacity = puffOpacity;
          vec4 mvPosition = modelViewMatrix * vec4(puffCenter, 1.0);
          mvPosition.xy += position.xy * puffSize;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        uniform vec3 puffColor;
        varying vec2 vPuffUv;
        varying float vPuffOpacity;
        #include <fog_pars_fragment>
        void main() {
          vec2 p = vPuffUv * 2.0 - 1.0;
          float ripple = 0.06 * sin(p.x * 9.0 + p.y * 3.0) * sin(p.y * 8.0);
          float edge = 1.0 - smoothstep(0.15, 0.98, length(p) + ripple);
          float alpha = edge * vPuffOpacity;
          if (alpha < 0.002) discard;
          gl_FragColor = vec4(puffColor, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'rear-tire-smoke';
    this.mesh.visible = false;
  }

  update(dt: number, intensity: number, left: THREE.Vector3, right: THREE.Vector3) {
    const wheels = [left, right];
    if (dt > 0) {
      for (const puff of this.puffs) {
        puff.age += dt;
        if (puff.age >= puff.life) continue;
        puff.x += puff.vx * dt;
        puff.y += 0.5 * dt;
        puff.z += puff.vz * dt;
      }
      this.emission += Math.min(1, Math.max(0, intensity)) * 24 * dt;
      const pairs = Math.floor(this.emission);
      this.emission -= pairs;
      for (let pair = 0; pair < pairs; pair++)
        for (let side = 0; side < 2; side++) {
          const point = wheels[side];
          const previous = this.havePrevious ? this.previous[side] : point;
          const t = (pair + 1) / Math.max(pairs, 1);
          const puff = this.puffs[this.cursor];
          this.cursor = (this.cursor + 1) % CAPACITY;
          Object.assign(puff, {
            age: 0,
            life: 1.1 + Math.random() * 0.5,
            x: THREE.MathUtils.lerp(previous.x, point.x, t),
            y: THREE.MathUtils.lerp(previous.y, point.y, t),
            z: THREE.MathUtils.lerp(previous.z, point.z, t),
            vx: (Math.random() - 0.5) * 0.8,
            vz: 0.15 + Math.random() * 0.45,
            size: 0.5 + Math.random() * 0.3,
          });
        }
    }
    this.activeCount = 0;
    for (let i = 0; i < CAPACITY; i++) {
      const puff = this.puffs[i];
      const alive = puff.age < puff.life;
      const progress = puff.age / puff.life;
      this.centers.setXYZ(i, puff.x, puff.y, puff.z);
      this.sizes.setX(i, alive ? puff.size + progress * 1.9 : 0);
      this.opacity.setX(
        i,
        alive ? Math.min(1, puff.age / 0.08) * Math.pow(1 - progress, 1.5) * 0.48 : 0,
      );
      if (alive) this.activeCount++;
    }
    this.centers.needsUpdate = this.sizes.needsUpdate = this.opacity.needsUpdate = true;
    this.mesh.visible = this.activeCount > 0;
    this.previous[0].copy(left);
    this.previous[1].copy(right);
    this.havePrevious = true;
  }

  reset() {
    for (const puff of this.puffs) puff.age = puff.life;
    this.emission = 0;
    this.activeCount = 0;
    this.havePrevious = false;
    this.mesh.visible = false;
  }

  rebase(dy: number, dz: number) {
    for (const puff of this.puffs) {
      puff.y += dy;
      puff.z += dz;
    }
    for (const point of this.previous) {
      point.y += dy;
      point.z += dz;
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
