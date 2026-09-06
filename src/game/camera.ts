export const cameraFrame = { horizontal: 0.8, vertical: 0.72 };

export function followDistance(
  front: boolean,
  driving: boolean,
  portrait: boolean,
  speed: number,
  slide: number,
) {
  if (!driving) return portrait ? 19 : 17;
  const base = portrait ? 15 : 12;
  return base + Math.max(0, speed) * 0.18 + (front ? Math.abs(slide) * 1.5 : 0);
}

/** Extra distance along the camera's backward axis needed to fit every corner.
 * Camera-space forward is -Z. Moving straight back preserves orientation and
 * increases every corner's depth equally, so all four frustum planes can be
 * solved directly instead of guessing a distance from speed or vehicle width.
 */
export function framingPullback(
  corners: readonly { x: number; y: number; z: number }[],
  verticalFov: number,
  aspect: number,
) {
  const vertical = Math.tan((verticalFov * Math.PI) / 360);
  const horizontal = vertical * Math.max(0.01, aspect);
  let distance = 0;
  for (const point of corners) {
    const depth = -point.z;
    distance = Math.max(
      distance,
      Math.abs(point.x) / (horizontal * cameraFrame.horizontal) - depth,
      Math.abs(point.y) / (vertical * cameraFrame.vertical) - depth,
      0.5 - depth,
    );
  }
  return distance;
}
