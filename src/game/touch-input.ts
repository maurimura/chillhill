import type { DrivingMode } from './driving.ts';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Input shaping only: both modes still use the same physics and scoring rules.
 * Small thumb corrections are gentle; the pad's edges retain full steering. */
export function touchSteering(raw: number, mode: DrivingMode, speed = 0) {
  const x = Number.isFinite(raw) ? clamp(raw, -1, 1) : 0;
  if (mode === 'cozy') return Math.abs(x) < 0.15 ? 0 : x;
  const amount = Math.max(0, (Math.abs(x) - 0.12) / 0.88);
  const velocity = Number.isFinite(speed) ? clamp(speed / 30, 0, 1) : 0;
  return Math.sign(x) * Math.pow(amount, 1.45 + velocity * 0.4);
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
