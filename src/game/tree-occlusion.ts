import * as THREE from 'three';
import { obstructionVisibility, restoreTreeVisibility } from './camera-occlusion';

/** Dither instead of transparent blending: instanced trees need no depth sorting.
 * Only the color pass fades; the actual forest still casts its natural shadows.
 */
export function installTreeFade(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'attribute float treeVisibility; varying float vTreeVisibility;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvTreeVisibility = treeVisibility;',
    );
    shader.fragmentShader = 'varying float vTreeVisibility;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `
      #include <clipping_planes_fragment>
      if (vTreeVisibility < 0.999) {
        float threshold = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        if (vTreeVisibility <= threshold) discard;
      }
    `,
    );
  };
  material.customProgramCacheKey = () => 'tree-camera-visibility-v1';
}

/** Chunk-local bounds stay valid when the endless road rebases its origin. */
export class TreeOcclusion {
  private visibility: THREE.InstancedBufferAttribute;
  private boxes: THREE.Box3[][] = [];
  private camera = new THREE.Vector3();
  private car = new THREE.Vector3();
  private look = new THREE.Vector3();

  constructor(meshes: THREE.InstancedMesh[], ownedGeometries: THREE.BufferGeometry[]) {
    const count = meshes[0].count;
    this.visibility = new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1), 1);
    this.visibility.setUsage(THREE.DynamicDrawUsage);
    const matrix = new THREE.Matrix4();
    // Geometry wrappers own this chunk's attribute, never mutate a shared tree geometry.
    for (const mesh of meshes) {
      mesh.geometry = mesh.geometry.clone();
      mesh.geometry.setAttribute('treeVisibility', this.visibility);
      mesh.geometry.computeBoundingBox();
      ownedGeometries.push(mesh.geometry);
    }
    for (let i = 0; i < count; i++) {
      this.boxes.push(
        meshes.map((mesh) => {
          mesh.getMatrixAt(i, matrix);
          return mesh.geometry.boundingBox!.clone().applyMatrix4(matrix);
        }),
      );
    }
  }

  update(
    chunk: THREE.Group,
    camera: THREE.Vector3,
    car: THREE.Vector3,
    look: THREE.Vector3,
    dt: number,
  ) {
    this.camera.copy(camera).sub(chunk.position);
    this.car.copy(car).sub(chunk.position);
    this.look.copy(look).sub(chunk.position);
    let changed = false,
      faded = 0;
    this.boxes.forEach((parts, i) => {
      let desired = 1;
      for (const box of parts) {
        desired = Math.min(
          desired,
          obstructionVisibility(this.camera, this.car, box),
          obstructionVisibility(this.camera, this.look, box),
        );
        if (desired === 0) break;
      }
      const before = this.visibility.getX(i);
      // A stopped intro must not leave a permanent stippled/ghost tree at the edge.
      // Finish fading any tree in the safety margin, even while the car is paused.
      if (desired < 0.999) desired = Math.min(desired, Math.max(0, before - Math.max(0, dt) * 5));
      const next = restoreTreeVisibility(before, desired, dt);
      if (Math.abs(next - before) > 1e-5) {
        this.visibility.setX(i, next);
        changed = true;
      }
      if (next < 0.999) faded++;
    });
    if (changed) this.visibility.needsUpdate = true;
    return faded;
  }
}
