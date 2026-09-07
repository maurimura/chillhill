export interface OcclusionPoint {
  x: number;
  y: number;
  z: number;
}
export interface OcclusionBox {
  min: OcclusionPoint;
  max: OcclusionPoint;
}
const axes = ['x', 'y', 'z'] as const;

/** Finite segment versus an expanded box; also handles a camera inside a tree. */
export function segmentIntersectsBox(
  start: OcclusionPoint,
  end: OcclusionPoint,
  box: OcclusionBox,
  padding = 0,
) {
  let near = 0,
    far = 1;
  for (const axis of axes) {
    const delta = end[axis] - start[axis];
    const low = box.min[axis] - padding,
      high = box.max[axis] + padding;
    if (Math.abs(delta) < 1e-8) {
      if (start[axis] < low || start[axis] > high) return false;
      continue;
    }
    const a = (low - start[axis]) / delta,
      b = (high - start[axis]) / delta;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return false;
  }
  return true;
}

/** Clear a car-width corridor, with a spatial fade before a tree enters it. */
export function obstructionVisibility(
  camera: OcclusionPoint,
  target: OcclusionPoint,
  box: OcclusionBox,
) {
  const clear = 2.4,
    fade = 2;
  if (!segmentIntersectsBox(camera, target, box, clear + fade)) return 1;
  if (segmentIntersectsBox(camera, target, box, clear)) return 0;
  let low = clear,
    high = clear + fade;
  for (let i = 0; i < 6; i++) {
    const middle = (low + high) / 2;
    if (segmentIntersectsBox(camera, target, box, middle)) high = middle;
    else low = middle;
  }
  const t = (low - clear) / fade;
  return t * t * (3 - 2 * t);
}

/** Never lag behind an obstruction; let trees reappear gently after it clears. */
export function restoreTreeVisibility(previous: number, desired: number, dt: number) {
  if (desired <= previous) return desired;
  const next = previous + (desired - previous) * (1 - Math.exp(-4 * Math.max(0, dt)));
  return next > 0.999 ? 1 : next;
}
