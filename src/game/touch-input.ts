import { challengeSteeringAuthority, type DrivingMode, type DrivingState } from './driving.ts';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Small thumb corrections are gentle; the pad's edges request full sideways
 * intent. Challenge resolves that intent through the heading controller below. */
export function touchSteering(raw: number, mode: DrivingMode, speed = 0) {
  const x = Number.isFinite(raw) ? clamp(raw, -1, 1) : 0;
  if (mode === 'cozy') return Math.abs(x) < 0.15 ? 0 : x;
  const amount = Math.max(0, (Math.abs(x) - 0.12) / 0.88);
  const velocity = Number.isFinite(speed) ? clamp(speed / 30, 0, 1) : 0;
  return Math.sign(x) * Math.pow(amount, 1.45 + velocity * 0.4);
}

/** A thumb requests a bounded lane-change angle, not an ever-growing turn.
 * Releasing/centering settles the heading along the road at the current lateral
 * position. This never reads offset, moves the car, or avoids shoulders/traffic.
 * It only supplies an ordinary [-1, 1] steering command to the existing physics. */
export function touchDrivingSteer(intent: number, state: DrivingState, curvature = 0) {
  const speed = Number.isFinite(state.speed) ? Math.max(0, state.speed) : 0;
  const authority = challengeSteeringAuthority(speed);
  if (authority < 0.001) return 0;
  const thumb = Number.isFinite(intent) ? clamp(intent, -1, 1) : 0;
  const heading = Number.isFinite(state.headingOffset) ? state.headingOffset! : 0;
  // At most ~10 degrees at low speed, becoming a smaller angle at speed.
  // Full sideways intent stays useful for overtaking without a wild tail swing.
  const target = thumb * Math.min(0.18, 2.7 / Math.max(speed, 1));
  const error = Math.atan2(Math.sin(target - heading), Math.cos(target - heading));
  const bendRate = (Number.isFinite(curvature) ? curvature : 0) * speed * Math.cos(heading);
  const turning = authority * (Number.isFinite(state.steering) ? state.steering : 0) - bendRate;
  // Anticipate the heading already changing while the steering is still easing.
  // This reduces the follow-through when lifting or reversing the thumb.
  const correction = clamp(error * 5, -0.28, 0.28) - turning * 0.6;
  return clamp((bendRate + correction) / authority, -1, 1);
}

export interface TouchPedals {
  accelerate: boolean;
  brake: boolean;
}

/** Separate engage/release thresholds stop finger jitter from toggling pedals.
 * The wider upper band supports steering and throttle with one thumb. */
export function touchPedals(y: number, previous: TouchPedals): TouchPedals {
  if (!Number.isFinite(y)) return { accelerate: false, brake: false };
  const brake = y > (previous.brake ? 0.18 : 0.35);
  return {
    brake,
    accelerate: !brake && y < (previous.accelerate ? -0.1 : -0.25),
  };
}
