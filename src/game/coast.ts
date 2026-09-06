import * as THREE from 'three';
import type { Settings } from '../config';
import { roadAt, roadElevation, seaElevation } from './route';

export function seaGeometry(start: number, length: number, settings: Settings) {
  const edge = settings.roadWidth / 2 + 1.3;
  const offsets = [1, 20, 40, 65, 130, 300, 800, 2200];
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const rows = 30;
  for (let row = 0; row <= rows; row++) {
    const s = start + (row / rows) * length;
    for (const offset of offsets) {
      positions.push(
        roadAt(s, settings).x + edge + offset,
        seaElevation(s, settings) - roadElevation(start, settings),
        start - s,
      );
      uvs.push(offset, start - s);
    }
    if (row < rows)
      for (let col = 0; col < offsets.length - 1; col++) {
        const a = row * offsets.length + col,
          b = a + offsets.length;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** One shared material, no reflection render targets or per-chunk animation buffers. */
export class CoastalWater {
  readonly material = new THREE.MeshStandardMaterial({
    color: '#64aaa9',
    roughness: 0.36,
    metalness: 0.12,
  });
  private time = { value: 0 };
  private wind = { value: 0.25 };
  constructor() {
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.coastTime = this.time;
      shader.uniforms.coastWind = this.wind;
      shader.vertexShader =
        'uniform float coastTime; uniform float coastWind; varying vec2 coastUV;\n' +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        coastUV = uv;
        transformed.y += (0.04 + coastWind * 0.1) * sin(uv.x * 0.16 + uv.y * 0.104719755 + coastTime);
      `,
      );
      shader.fragmentShader =
        'uniform float coastTime; varying vec2 coastUV;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        float wave = sin(coastUV.x * 0.48 + sin(coastUV.y * 0.104719755) + coastTime * 0.7);
        float glint = pow(max(0.0, wave), 18.0) * 0.1 * smoothstep(-0.6, 0.5, sin(coastUV.y * 0.06981317 + coastUV.x * 0.1));
        float foam = (1.0 - smoothstep(0.6, 2.2, abs(coastUV.x - 41.0 + wave))) * 0.5;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.92, 0.86), foam + glint);
      `,
      );
    };
  }
  update(dt: number, wind: number) {
    this.time.value = (this.time.value + dt * 0.65) % (Math.PI * 200);
    this.wind.value = wind;
  }
  dispose() {
    this.material.dispose();
  }
}
