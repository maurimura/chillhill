import * as THREE from 'three';
import type { Settings } from '../config';
import { nearbyLakes, roadElevation } from './route';

/** Clip finite lake ellipses into resident chunks. Every piece shares its basin's level. */
export function lakeGeometries(start: number, length: number, settings: Settings) {
  return nearbyLakes(start, length, settings).flatMap((lake) => {
    const from = Math.max(start, lake.centerDistance - lake.radiusZ);
    const to = Math.min(start + length, lake.centerDistance + lake.radiusZ);
    if (to <= from) return [];
    const positions: number[] = [],
      uvs: number[] = [],
      indices: number[] = [];
    const steps = Math.max(2, Math.ceil((to - from) / 4));
    for (let i = 0; i <= steps; i++) {
      const distance = from + ((to - from) * i) / steps;
      const relative = (distance - lake.centerDistance) / lake.radiusZ;
      const width = lake.radiusX * Math.sqrt(Math.max(0, 1 - relative * relative));
      for (const side of [-1, 1]) {
        positions.push(
          lake.centerX + side * width,
          lake.elevation - roadElevation(start, settings),
          start - distance,
        );
        uvs.push(side * width, lake.centerDistance - distance);
      }
      if (i < steps) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return [geometry];
  });
}

/** Only color glints move. The water surface stays horizontal at every slope and seed. */
export class LakeWater {
  readonly material = new THREE.MeshStandardMaterial({
    color: '#459d9c',
    roughness: 0.3,
    metalness: 0.16,
  });
  private time = { value: 0 };
  private wind = { value: 0.15 };
  constructor() {
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.lakeTime = this.time;
      shader.uniforms.lakeWind = this.wind;
      shader.vertexShader = 'varying vec2 lakeUV;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n lakeUV = uv;',
      );
      shader.fragmentShader =
        'uniform float lakeTime; uniform float lakeWind; varying vec2 lakeUV;\n' +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        float ripple = sin(lakeUV.x * 0.24 + sin(lakeUV.y * 0.13) + lakeTime);
        float shine = pow(max(0.0, ripple), 24.0) * (0.04 + lakeWind * 0.1);
        diffuseColor.rgb += vec3(shine);
      `,
      );
    };
  }
  update(dt: number, settings: Settings) {
    this.time.value = (this.time.value + dt * 0.45) % (Math.PI * 200);
    this.wind.value = settings.wind;
    this.material.color.set(settings.season === 'winter' ? '#96c8c7' : '#459d9c');
  }
  dispose() {
    this.material.dispose();
  }
}
