import * as THREE from 'three';
import { cars, type CarId } from '../config/cars';
import { challengeDefaults } from '../config/challenge';
import {
  bodyRoadLimits,
  collisionFootprint,
  trafficCollisionPose,
  type CollisionPose,
} from './collision';
import { type DrivingState } from './driving';
import type { ChallengeState } from './challenge';
import { roadAt, terrainAt, type RouteSettings } from './route';

/** One reusable line buffer. Disabled means no geometry work or draw calls. */
export class CollisionDebug {
  private readonly geometry = new THREE.BufferGeometry();
  private readonly positions = new Float32Array(8192 * 3);
  private readonly colors = new Float32Array(8192 * 3);
  private readonly material = new THREE.LineBasicMaterial({
    vertexColors: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  readonly lines = new THREE.LineSegments(this.geometry, this.material);
  private count = 0;
  private vehicles = 0;

  constructor() {
    this.lines.name = 'collision-debug';
    this.lines.renderOrder = 20;
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geometry.setDrawRange(0, 0);
  }

  update(
    enabled: boolean,
    state: DrivingState,
    car: CarId,
    settings: RouteSettings,
    challenge: ChallengeState | undefined,
    originDistance: number,
    originHeight: number,
    playerGround: number,
  ) {
    this.lines.visible = enabled;
    this.count = 0;
    this.vehicles = 0;
    if (!enabled) {
      this.geometry.setDrawRange(0, 0);
      return;
    }
    const vertex = (x: number, y: number, z: number, color: THREE.Color) => {
      this.positions.set([x, y, z], this.count * 3);
      this.colors.set([color.r, color.g, color.b], this.count * 3);
      this.count++;
    };
    const outline = (pose: CollisionPose, id: CarId, color: THREE.Color, ground: number) => {
      const points = collisionFootprint(pose, id, settings);
      const low = ground + 0.12,
        high = ground + cars[id].height * 0.68;
      for (let i = 0; i < points.length; i++) {
        const a = points[i],
          b = points[(i + 1) % points.length];
        for (const y of [low, high]) {
          vertex(a.x, y, a.z + originDistance, color);
          vertex(b.x, y, b.z + originDistance, color);
        }
        vertex(a.x, low, a.z + originDistance, color);
        vertex(a.x, high, a.z + originDistance, color);
      }
      this.vehicles++;
    };
    outline(state, car, new THREE.Color('#70ffb4'), playerGround);
    for (const vehicle of challenge?.traffic ?? []) {
      outline(
        trafficCollisionPose(vehicle),
        vehicle.car,
        new THREE.Color('#ffbd68'),
        roadAt(vehicle.distance, settings).y - originHeight,
      );
    }
    // Green/red limits refer to the player's reference position, as the game
    // rule does. The white asphalt edge makes that distinction easy to see.
    const cache = new Map<number, ReturnType<typeof bodyRoadLimits>>();
    const limits = [
      ['asphalt', '#ffffff'],
      ['safe', '#77dfff'],
      ['recovery', '#ff7488'],
    ] as const;
    for (const [kind, hex] of limits) {
      const color = new THREE.Color(hex);
      for (const side of [-1, 1]) {
        for (let step = -10; step < 180; step++) {
          // Broken lines leave the road easy to read through the debug view.
          if (step % 2) continue;
          for (const end of [step, step + 1]) {
            const s = state.distance + end * 3;
            const road = roadAt(s, settings);
            let offset = (side * settings.roadWidth) / 2;
            if (kind !== 'asphalt') {
              let safe = cache.get(end);
              if (!safe) {
                safe = bodyRoadLimits({ ...state, distance: s }, car, settings);
                cache.set(end, safe);
              }
              offset = side < 0 ? safe.left : safe.right;
              if (kind === 'recovery') offset += side * challengeDefaults.offRoadRange;
            }
            vertex(
              road.x + offset,
              terrainAt(s, offset, settings) - originHeight + 0.2,
              originDistance - s,
              color,
            );
          }
        }
      }
    }
    this.geometry.setDrawRange(0, this.count);
    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.getAttribute('color').needsUpdate = true;
  }

  get telemetry() {
    return { enabled: this.lines.visible, vehicles: this.vehicles, vertices: this.count };
  }
  dispose() {
    this.lines.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
