import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Settings } from '../config';
import { random, roadAt, roadElevation, terrainAt } from './route';
import { roadShoulderWidth } from '../config/road';

interface Building {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  rotation: number;
  color: THREE.Color;
}

/** A distant, road-relative city: five draw calls per chunk, no individual lights.
 *
 * Instanced meshes belong to their returned chunk. Geometry and materials are
 * shared and owned here. Remove old chunks before changing shape roundness;
 * update() then replaces the one active bevel geometry, never an unbounded cache.
 */
export class CityScenery {
  private boxGeometry: THREE.BufferGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly poleGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
  private roundness = -1;
  private readonly windowGlow = { value: 0 };
  private readonly facade = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.91 });
  private readonly steel = new THREE.MeshStandardMaterial({ color: '#475451', roughness: 0.8 });
  private readonly housing = new THREE.MeshStandardMaterial({ color: '#394442', roughness: 0.7 });
  private readonly bulb = new THREE.MeshStandardMaterial({
    color: '#eee2bc',
    emissive: '#ffd699',
    emissiveIntensity: 0,
    roughness: 0.5,
  });
  private readonly dummy = new THREE.Object3D();
  private disposed = false;

  constructor() {
    this.facade.name = 'city-procedural-windows';
    this.bulb.name = 'city-streetlamp-lenses';
    // Physical-space facade coordinates keep the window pitch consistent on
    // differently scaled instances. Roofs and bevels do not acquire windows.
    this.facade.onBeforeCompile = (shader) => {
      shader.uniforms.cityWindowGlow = this.windowGlow;
      shader.vertexShader =
        `varying vec3 cityLocalPosition;
         varying vec3 cityLocalNormal;
         varying vec3 cityBuildingScale;
         varying float cityBuildingSeed;\n` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         cityBuildingScale = vec3(1.0);
         cityBuildingSeed = 0.0;
         #ifdef USE_INSTANCING
           cityBuildingScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
           cityBuildingSeed = dot(instanceMatrix[3].xz, vec2(0.0713, 0.1131));
         #endif
         cityLocalPosition = position * cityBuildingScale;
         cityLocalNormal = normal;`,
      );
      shader.fragmentShader =
        `uniform float cityWindowGlow;
         varying vec3 cityLocalPosition;
         varying vec3 cityLocalNormal;
         varying vec3 cityBuildingScale;
         varying float cityBuildingSeed;
         float cityHash(vec2 cell) { return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453); }\n` +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         vec3 faceNormal = abs(cityLocalNormal);
         float facadeX = faceNormal.x > faceNormal.z ? cityLocalPosition.z : cityLocalPosition.x;
         float facadeWidth = faceNormal.x > faceNormal.z ? cityBuildingScale.z : cityBuildingScale.x;
         vec2 facadePosition = vec2(facadeX, cityLocalPosition.y + cityBuildingScale.y * 0.5);
         vec2 windowGrid = facadePosition / vec2(3.15, 3.1);
         vec2 cell = floor(windowGrid);
         vec2 within = fract(windowGrid);
         vec2 aa = min(vec2(0.16), max(vec2(0.018), fwidth(windowGrid)));
         vec2 opening = smoothstep(vec2(0.23) - aa, vec2(0.23) + aa, within)
                       * (1.0 - smoothstep(vec2(0.77, 0.70) - aa, vec2(0.77, 0.70) + aa, within));
         float wall = 1.0 - smoothstep(0.08, 0.42, faceNormal.y);
         float trimMargin = smoothstep(0.4, 1.1, facadeWidth * 0.5 - abs(facadeX));
         float floors = smoothstep(1.25, 2.3, facadePosition.y)
                      * (1.0 - smoothstep(cityBuildingScale.y - 1.3, cityBuildingScale.y - 0.55, facadePosition.y));
         float windowMask = opening.x * opening.y * wall * trimMargin * floors;
         float occupied = step(0.39, cityHash(cell + vec2(cityBuildingSeed, cityBuildingSeed * 0.71)));
         float warmVariation = cityHash(cell + vec2(cityBuildingSeed + 12.7, 43.1));
         vec3 windowColor = mix(vec3(1.0, 0.52, 0.19), vec3(1.0, 0.83, 0.47), warmVariation);
         float cityWindowLight = windowMask * occupied * cityWindowGlow;
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.095, 0.16, 0.18), windowMask * 0.83);`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         totalEmissiveRadiance += windowColor * cityWindowLight * 1.7;`,
      );
    };
    this.facade.customProgramCacheKey = () => 'chillhill-city-windows-v1';
  }

  update(settings: Settings): void {
    if (this.disposed) return;
    const shape = THREE.MathUtils.clamp(settings.roundness, 0, 1);
    if (shape !== this.roundness) {
      this.boxGeometry.dispose();
      // Subtle architectural edge softening: no pill-shaped tower silhouettes.
      this.boxGeometry =
        shape === 0
          ? new THREE.BoxGeometry(1, 1, 1)
          : new RoundedBoxGeometry(1, 1, 1, 1, 0.018 * shape);
      this.roundness = shape;
    }
    const evening = { day: 0, sunset: 0.25, dusk: 0.72, night: 1, dawn: 0.3 }[settings.timeOfDay];
    const cover = settings.weather === 'clear' ? 0 : settings.weatherIntensity * 0.05;
    this.windowGlow.value = Math.min(1, evening + cover);
    this.bulb.emissiveIntensity = this.windowGlow.value * 2.2;
    this.bulb.color.set(evening > 0.5 ? '#ffdda2' : '#eee2bc');
    this.facade.color.set(settings.season === 'winter' ? '#d7dfe2' : '#ffffff');
  }

  buildChunk(start: number, length: number, settings: Settings): THREE.Group {
    const group = new THREE.Group();
    group.name = 'city-overlook-scenery';
    if (this.disposed || !Number.isFinite(start) || !Number.isFinite(length) || length <= 0)
      return group;
    this.update(settings);
    const originHeight = roadElevation(start, settings);
    const buildings: Building[] = [];
    // Global row indices make neighboring chunks and deterministic regeneration
    // agree; an interval owns each block exactly once, including negative starts.
    const firstRow = Math.ceil((start - 8) / 16);
    const endRow = Math.ceil((start + length - 8) / 16);
    for (let row = firstRow; row < endRow; row++) {
      for (let column = 0; column < 6; column++) {
        const rng = random(
          Math.imul(row, 73856093) ^
            Math.imul(column, 19349663) ^
            Math.imul(settings.seed, 83492791),
        );
        const s = row * 16 + 8 + (rng() - 0.5) * 3;
        // A broad empty/wooded foreground separates this overlook from the
        // city. Nearby rooftops remain low; taller towers sit deeper in valley.
        const offset = 250 + column * 80 + (rng() - 0.5) * 10;
        const width = 12 + rng() * 13;
        const depth = 8.5 + rng() * 4;
        const height = 12 + Math.pow(rng(), column < 2 ? 1.5 : 0.85) * (column < 2 ? 24 : 53);
        const road = roadAt(s, settings);
        // Sample the actual footprint, converting its world X back into each
        // nearby terrain row's offset; foundations sit into slopes, never float.
        const worldX = road.x + offset;
        let lowestGround = Infinity;
        for (const along of [-depth / 2, depth / 2]) {
          const sampleS = s + along;
          for (const across of [-width / 2, width / 2]) {
            lowestGround = Math.min(
              lowestGround,
              terrainAt(sampleS, worldX + across - roadAt(sampleS, settings).x, settings),
            );
          }
        }
        const base = lowestGround - 0.6;
        const shade = rng();
        const color = new THREE.Color('#687a7d').lerp(new THREE.Color('#b5ac99'), shade);
        buildings.push({
          x: worldX,
          y: base + height / 2 - originHeight,
          z: start - s,
          width,
          height,
          depth,
          rotation: (rng() - 0.5) * 0.075,
          color,
        });
      }
    }
    const skyline = new THREE.InstancedMesh(this.boxGeometry, this.facade, buildings.length);
    skyline.name = 'city-buildings';
    buildings.forEach((building, i) => {
      this.place(
        skyline,
        i,
        building.x,
        building.y,
        building.z,
        building.width,
        building.height,
        building.depth,
        building.rotation,
      );
      skyline.setColorAt(i, building.color);
    });
    skyline.instanceMatrix.needsUpdate = true;
    if (skyline.instanceColor) skyline.instanceColor.needsUpdate = true;
    skyline.computeBoundingSphere();
    group.add(skyline);

    const firstLamp = Math.ceil((start - 30) / 60);
    const endLamp = Math.ceil((start + length - 30) / 60);
    const lampCount = Math.max(0, endLamp - firstLamp);
    const poles = new THREE.InstancedMesh(this.poleGeometry, this.steel, lampCount);
    const arms = new THREE.InstancedMesh(this.boxGeometry, this.steel, lampCount);
    const housings = new THREE.InstancedMesh(this.boxGeometry, this.housing, lampCount);
    const lenses = new THREE.InstancedMesh(this.boxGeometry, this.bulb, lampCount);
    poles.name = 'city-lamp-poles';
    arms.name = 'city-lamp-arms';
    housings.name = 'city-lamp-housings';
    lenses.name = 'city-lamp-lenses';
    for (let index = 0; index < lampCount; index++) {
      const s = (firstLamp + index) * 60 + 30;
      const road = roadAt(s, settings);
      const offset = settings.roadWidth / 2 + roadShoulderWidth + 0.6;
      const x = road.x + offset;
      const y = terrainAt(s, offset, settings) - originHeight;
      const z = start - s;
      const acrossX = Math.cos(road.heading);
      const acrossZ = Math.sin(road.heading);
      this.place(poles, index, x, y + 3.9, z, 0.069, 7.8, 0.069);
      this.place(
        arms,
        index,
        x - acrossX * 0.9,
        y + 7.72,
        z - acrossZ * 0.9,
        1.94,
        0.1,
        0.12,
        -road.heading,
      );
      this.place(
        housings,
        index,
        x - acrossX * 1.8,
        y + 7.67,
        z - acrossZ * 1.8,
        0.7,
        0.17,
        0.36,
        -road.heading,
      );
      this.place(
        lenses,
        index,
        x - acrossX * 1.8,
        y + 7.565,
        z - acrossZ * 1.8,
        0.54,
        0.045,
        0.275,
        -road.heading,
      );
    }
    for (const mesh of [poles, arms, housings, lenses]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    group.userData.buildingCount = buildings.length;
    group.userData.streetlightCount = lampCount;
    return group;
  }

  private place(
    mesh: THREE.InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    rotation = 0,
  ) {
    this.dummy.position.set(x, y, z);
    this.dummy.scale.set(width, height, depth);
    this.dummy.rotation.set(0, rotation, 0);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.boxGeometry.dispose();
    this.poleGeometry.dispose();
    this.facade.dispose();
    this.steel.dispose();
    this.housing.dispose();
    this.bulb.dispose();
  }
}
