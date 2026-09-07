import * as THREE from 'three';
import type { CarId } from '../config/cars';
import { vehiclePaintColor, type CarVisual } from './vehicles';

/** Cheap independent animation/paint over an immutable template's geometry and
 * textures. The owner must dispose ALL instances before disposing the template. */
export function instanceVehicle(template: CarVisual): CarVisual {
  const root = template.root.clone(true);
  const nodes = new Map<THREE.Object3D, THREE.Object3D>();
  const materials = new Map<THREE.Material, THREE.Material>();
  const material = <T extends THREE.Material>(source: T): T => {
    let copy = materials.get(source);
    if (!copy) {
      copy = source.clone();
      materials.set(source, copy);
    }
    return copy as T;
  };
  const visit = (source: THREE.Object3D, copy: THREE.Object3D) => {
    nodes.set(source, copy);
    if (copy instanceof THREE.Mesh)
      copy.material = Array.isArray(copy.material)
        ? copy.material.map(material)
        : material(copy.material);
    source.children.forEach((child, i) => visit(child, copy.children[i]));
  };
  visit(template.root, root);
  const paint = [...materials.values()].find(
    (mat) => mat.name === 'car-paint',
  ) as THREE.MeshStandardMaterial;
  const car = root.userData.carId as CarId;
  let disposed = false;
  return {
    root,
    body: nodes.get(template.body) as THREE.Group,
    wheels: template.wheels.map((node) => nodes.get(node) as THREE.Group),
    frontWheels: template.frontWheels.map((node) => nodes.get(node) as THREE.Group),
    spec: template.spec,
    rearLeft: template.rearLeft.clone(),
    rearRight: template.rearRight.clone(),
    brakeLights: material(template.brakeLights),
    headlights: material(template.headlights),
    setPaint(theme, custom) {
      paint.color.set(vehiclePaintColor(car, theme, custom));
      root.userData.paint = `#${paint.color.getHexString()}`;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const copy of materials.values()) copy.dispose();
      materials.clear();
      nodes.clear();
      // Geometry and mapped badge textures belong only to the template.
    },
  };
}
