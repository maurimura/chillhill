import { carAxles, carRoadLimit, cars, defaultCar, type CarId } from '../config/cars.ts';

export interface DrivingSettings {
  cruiseSpeed: number;
  maxSpeed: number;
  drift: number;
  roadWidth: number;
  car?: CarId;
}
export interface Input {
  steer: number;
  accelerate: boolean;
  brake: boolean;
}
export interface DrivingState {
  distance: number;
  travelled: number;
  speed: number;
  offset: number;
  lateralSpeed: number;
  slide: number;
  yawVelocity: number;
  driftAmount: number;
  steering: number;
  /** Unassisted direction relative to the road; positive points to the right. */
  headingOffset?: number;
}
export type DrivingMode = 'cozy' | 'challenge';
export const initialState = (): DrivingState => ({
  distance: 20,
  travelled: 0,
  speed: 0,
  offset: 0,
  lateralSpeed: 0,
  slide: 0,
  yawVelocity: 0,
  driftAmount: 0,
  steering: 0,
});
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const FRONT_AXLE = carAxles(cars[defaultCar]).front;
export const roadOffsetLimit = carRoadLimit;

/** Speeds are m/s internally and km/h in configuration. Brake always wins. */
export function stepDriving(
  state: DrivingState,
  input: Input,
  config: DrivingSettings,
  dt: number,
  curvature = 0,
  metric = 1,
  mode: DrivingMode = 'cozy',
) {
  if (dt <= 0 || !Number.isFinite(dt)) return;
  dt = Math.min(dt, 0.05);
  if (input.brake) {
    state.speed = Math.max(0, state.speed - 10.5 * dt);
    if (state.speed < 0.025) state.speed = 0;
  } else if (mode === 'challenge' && !input.accelerate) {
    // No automatic throttle in challenge mode. Lifting off coasts gently;
    // holding the brake still wins and keeps the car completely stationary.
    state.speed = Math.max(0, state.speed - 0.55 * dt);
  } else {
    const target = (input.accelerate ? config.maxSpeed : config.cruiseSpeed) / 3.6;
    const acceleration = input.accelerate ? 4.4 : 2.2;
    const difference = target - state.speed;
    state.speed += clamp(difference, -1.5 * dt, acceleration * dt);
  }
  state.speed = clamp(state.speed, 0, config.maxSpeed / 3.6);
  state.steering += (input.steer - state.steering) * (1 - Math.exp(-7 * dt));
  // Translation follows the front axle's path. Rear grip controls how long
  // sideways momentum lingers, independently of the car's visible heading.
  const grip = 6.5 - config.drift * 4.4;
  const movement = Math.min(state.speed / 7, 1);
  if (mode === 'challenge' && state.speed > 0) {
    const heading = state.headingOffset ?? 0;
    // Steering turns the actual direction of travel. A bend beneath the car
    // changes only the *relative* heading: it cannot turn an unattended car.
    // The mellow steering rate and familiar rear-slip spring stay forgiving.
    const turnRate = (state.steering * 0.62 * movement) / (1 + state.speed * 0.018);
    const relative = heading + (turnRate - curvature * state.speed * Math.cos(heading)) * dt;
    state.headingOffset = Math.atan2(Math.sin(relative), Math.cos(relative));
  }
  const targetLateral =
    mode === 'challenge'
      ? state.speed * Math.sin(state.headingOffset ?? 0)
      : state.steering * (2.8 + state.speed * 0.14) * movement;
  const inertia =
    mode === 'challenge' ? 0 : -curvature * state.speed * state.speed * config.drift * 0.38;
  state.lateralSpeed +=
    (targetLateral - state.lateralSpeed) * (1 - Math.exp(-grip * dt)) + inertia * dt;
  if (input.brake) state.lateralSpeed *= Math.exp(-6 * dt);
  if (state.speed === 0) state.lateralSpeed = 0;
  if (state.speed > 0) {
    const travelYaw = -Math.atan2(state.lateralSpeed, Math.max(state.speed, 1));
    const cornerLoad = clamp(curvature * state.speed * 9, -0.7, 0.7);
    const rearSlip = (state.steering + cornerLoad) * config.drift * 0.66 * movement;
    const visualHeading = mode === 'challenge' ? -(state.headingOffset ?? 0) : travelYaw;
    const maxSlide = mode === 'challenge' ? 1.35 : 0.78;
    const slideTarget = clamp(visualHeading - rearSlip, -maxSlide, maxSlide);
    // A damped spring lets the tail sweep out and settle, including a little
    // follow-through when countersteering, without snapping to each key press.
    state.yawVelocity += ((slideTarget - state.slide) * 38 - state.yawVelocity * 8.5) * dt;
    const slideLimit = mode === 'challenge' ? 1.4 : 0.8;
    state.slide = clamp(state.slide + state.yawVelocity * dt, -slideLimit, slideLimit);
    const slip = Math.abs(state.slide - travelYaw);
    const intensity = config.drift === 0 ? 0 : clamp((slip - 0.07) / 0.38, 0, 1) * movement;
    state.driftAmount += (intensity - state.driftAmount) * (1 - Math.exp(-8 * dt));
  } else {
    // A held brake freezes rotation as well as forward and sideways motion.
    state.yawVelocity = 0;
    state.driftAmount = 0;
  }
  state.offset += state.lateralSpeed * dt;
  // The soft edge accounts for the whole car, including the swinging rear.
  const edge = roadOffsetLimit(config.roadWidth, state.slide, config.car);
  if (mode === 'cozy' && Math.abs(state.offset) > edge) {
    state.offset = clamp(state.offset, -edge, edge);
    state.lateralSpeed *= Math.exp(-14 * dt);
  }
  // Heading does not consume downhill momentum: a drift keeps going forward.
  const forward = mode === 'challenge' ? Math.cos(state.headingOffset ?? 0) : 1;
  state.distance += (state.speed * forward * dt) / Math.max(metric, 1);
  state.travelled += state.speed * dt;
}
