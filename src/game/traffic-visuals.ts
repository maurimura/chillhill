import * as THREE from 'three';
import { styles, type Settings } from '../config';
import type { ChallengeState } from './challenge';
import { roadAt, roadElevation } from './route';
import { buildVehicle, type CarVisual } from './vehicles';
import type { CarId } from '../config/cars';
import { trafficCarIds } from '../config/challenge';
import { instanceVehicle } from './vehicle-instance';

/** A bounded display pool. Traffic uses the same silhouettes as the garage. */
export class TrafficVisuals {
  readonly group = new THREE.Group();
  private slots = new Map<number, CarVisual>();
  private templates = new Map<CarId, CarVisual>();
  private softness = -1;
  private builds = 0;
  private instances = 0;

  constructor() {
    this.group.name = 'challenge-traffic';
  }

  update(
    traffic: ChallengeState['traffic'] | undefined,
    settings: Settings,
    originDistance: number,
    dt: number,
    headlight: number,
  ) {
    if (!traffic || settings.roundness !== this.softness) this.clear();
    this.softness = settings.roundness;
    if (!traffic) return;
    // Prepare the fixed traffic catalog once on entry, not halfway through a
    // drive when a previously unseen model first spawns. No work in Easy drive.
    if (!this.templates.size) for (const id of trafficCarIds) this.template(id, settings);
    const live = new Set(traffic.map((car) => car.id));
    for (const [id, visual] of this.slots)
      if (!live.has(id)) {
        visual.dispose();
        this.slots.delete(id);
      }
    const originHeight = roadElevation(originDistance, settings);
    for (const car of traffic) {
      let visual = this.slots.get(car.id);
      if (!visual || visual.root.userData.carId !== car.car) {
        visual?.dispose();
        visual = instanceVehicle(this.template(car.car, settings));
        this.instances++;
        this.slots.set(car.id, visual);
        this.group.add(visual.root);
      }
      if (visual.root.userData.trafficPaint !== car.color) {
        visual.setPaint(styles[settings.style].car, car.color);
        visual.root.userData.trafficPaint = car.color;
      }
      const road = roadAt(car.distance, settings);
      visual.root.position.set(
        road.x + car.offset,
        road.y - originHeight + 0.08,
        originDistance - car.distance,
      );
      visual.root.rotation.set(
        car.lane * Math.atan(road.dy),
        -road.heading + (car.lane === -1 ? Math.PI : 0),
        0,
        'YXZ',
      );
      for (const wheel of visual.wheels)
        wheel.rotation.x -= (car.speed * dt) / wheel.userData.tireRadius;
      visual.headlights.emissiveIntensity = headlight / 100;
      visual.brakeLights.emissiveIntensity = headlight > 20 ? 0.8 : 0.25;
    }
  }

  get count() {
    return this.slots.size;
  }

  get telemetry() {
    return {
      templates: this.templates.size,
      active: this.slots.size,
      builds: this.builds,
      instances: this.instances,
    };
  }

  private template(id: CarId, settings: Settings) {
    let visual = this.templates.get(id);
    if (!visual) {
      visual = buildVehicle(id, settings.roundness, styles[settings.style].car);
      this.templates.set(id, visual);
      this.builds++;
    }
    return visual;
  }

  private clear() {
    for (const visual of this.slots.values()) visual.dispose();
    this.slots.clear();
    for (const template of this.templates.values()) template.dispose();
    this.templates.clear();
  }

  dispose() {
    this.clear();
    this.group.removeFromParent();
  }
}
