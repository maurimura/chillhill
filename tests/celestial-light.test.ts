import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectionalLight, Object3D, Vector3 } from 'three';
import {
  celestialShadowDistance,
  celestialSkyDistance,
  placeCelestialLight,
} from '../src/game/celestial-light.ts';

const directionFrom = (source: Vector3, origin: Vector3) => source.clone().sub(origin).normalize();
const close = (a: Vector3, b: Vector3) => assert.ok(a.distanceTo(b) < 1e-10);

test('sun/moon and directional light agree at every time of day and during transitions', () => {
  const light = new DirectionalLight(),
    disc = new Object3D();
  const observer = new Vector3(4, 8, 18);
  light.target.position.set(-12, -10, -35);
  for (const [start, end] of [
    [70, 28],
    [28, 12],
    [12, 65],
    [65, 18],
    [18, 70],
  ]) {
    for (let frame = 0; frame <= 100; frame++) {
      placeCelestialLight(light, disc, observer, start + ((end - start) * frame) / 100);
      const visible = directionFrom(disc.position, observer);
      const illumination = directionFrom(light.position, light.target.position);
      close(visible, illumination);
      assert.ok(
        visible.x > 0 && visible.z < 0 && visible.y > 0,
        'the source is ahead/right, above the horizon',
      );
      assert.ok(Math.abs(disc.position.distanceTo(observer) - celestialSkyDistance) < 1e-10);
      assert.ok(
        Math.abs(light.position.distanceTo(light.target.position) - celestialShadowDistance) <
          1e-10,
      );
    }
  }
  light.dispose();
});

test('turning or moving the camera does not turn the sun or its cast shadows', () => {
  const light = new DirectionalLight(),
    disc = new Object3D();
  light.target.position.set(16, -5, -30);
  const source = new Vector3();
  for (const [i, observer] of [
    new Vector3(0, 8, 20),
    new Vector3(0, 5, -20),
    new Vector3(-12, 9, 14),
  ].entries()) {
    placeCelestialLight(light, disc, observer, 70);
    if (i === 0) source.copy(light.position);
    else close(light.position, source);
    close(directionFrom(disc.position, observer), directionFrom(source, light.target.position));
  }
  light.dispose();
});

test('world rebasing preserves sky direction and local shadows after long drives', () => {
  const light = new DirectionalLight(),
    disc = new Object3D();
  const observer = new Vector3(25, -6, -160);
  light.target.position.set(23, -14, -195);
  placeCelestialLight(light, disc, observer, 28);
  const direction = directionFrom(light.position, light.target.position);
  const source = light.position.clone(),
    sky = disc.position.clone();
  const rebase = new Vector3(0, 18, 180);
  observer.add(rebase);
  light.target.position.add(rebase);
  placeCelestialLight(light, disc, observer, 28);
  close(light.position, source.add(rebase));
  close(disc.position, sky.add(rebase));
  close(directionFrom(light.position, light.target.position), direction);
  light.dispose();
});

test('tree shadows extend away from the visible source and lengthen with a lower sun', () => {
  const light = new DirectionalLight(),
    disc = new Object3D(),
    observer = new Vector3();
  let previousLength = 0;
  for (const elevation of [70, 65, 28, 18, 12]) {
    placeCelestialLight(light, disc, observer, elevation);
    const rays = directionFrom(light.target.position, light.position);
    const visible = directionFrom(disc.position, observer);
    const shadow = rays.multiplyScalar(8 / -rays.y); // An 8 m tree over flat ground.
    assert.ok(shadow.x < 0 && shadow.z > 0, 'shadow travels behind/left, not toward the sun');
    assert.ok(shadow.x * visible.x + shadow.z * visible.z < 0);
    const length = Math.hypot(shadow.x, shadow.z);
    assert.ok(length > previousLength);
    previousLength = length;
  }
  light.dispose();
});
