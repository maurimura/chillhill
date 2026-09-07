import type * as THREE from 'three';
import type { CarSpec } from '../config/cars';

export type Point = [number, number, number];
export interface Section {
  z: number;
  width: number;
  y: number;
}
export interface VehicleBuilder {
  spec: CarSpec;
  axles: { front: number; rear: number };
  roundness: number;
  body: THREE.Group;
  materials: Record<
    | 'paint'
    | 'dark'
    | 'glass'
    | 'rubber'
    | 'alloy'
    | 'light'
    | 'brakeLights'
    | 'clearLens'
    | 'gold'
    | 'cream',
    THREE.MeshStandardMaterial
  >;
  material: (color: string, roughness?: number, metalness?: number) => THREE.MeshStandardMaterial;
  add: (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent?: THREE.Object3D,
  ) => THREE.Mesh;
  box: (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material?: THREE.Material,
    parent?: THREE.Object3D,
  ) => THREE.Mesh;
  panel: (points: Point[], material: THREE.Material) => THREE.Mesh;
  surface: (
    zs: number[],
    us: number[],
    point: (z: number, u: number) => Point,
    material: THREE.Material,
    normal?: (z: number, u: number) => Point,
  ) => THREE.Mesh;
  sample: (sections: Section[], z: number) => { width: number; y: number };
  roundedSections: (sections: Section[], amount: number) => Section[];
  badge: (
    text: string,
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    plate?: boolean,
  ) => void;
}
