import type { DirectionalLight, Object3D, Vector3 } from 'three';

export const celestialSkyDistance = 900;
export const celestialShadowDistance = 140;

/** One world-space direction for the visible sun/moon and its parallel rays.
 * Elevation is the existing atmosphere's art-directed height, not degrees.
 * The sky follows the observer's translation (no parallax), never their rotation.
 * The light stays near its road-relative target to keep the shadow map precise.
 * Reuse the light position as scratch space: no per-frame vector allocation. */
export function placeCelestialLight(
  light: DirectionalLight,
  disc: Object3D,
  observer: Vector3,
  elevation: number,
) {
  light.position.set(240, elevation * 2.2, -850).normalize();
  disc.position.copy(observer).addScaledVector(light.position, celestialSkyDistance);
  light.position.multiplyScalar(celestialShadowDistance).add(light.target.position);
}
