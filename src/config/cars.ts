export interface CarSpec {
  name: string;
  variant: string;
  kind: 'astra-hatch' | 'astra-sedan' | 'wagon';
  length: number;
  width: number;
  mirrorWidth: number;
  height: number;
  wheelbase: number;
  frontOverhang: number;
  frontTrack: number;
  rearTrack: number;
  tireRadius: number;
  tireWidth: number;
  paint: string | null;
}

// Dimensions in meters. Astra geometry uses the 195/60 R15 configuration in
// Chevrolet Argentina's MY2011 owner manual, section 12, pages 12-1 and 12-2.
// The wagon is the game's original fictional car.
export const carSource =
  'https://mi.chevrolet.com.ar/content/dam/gmownercenter/gmsa/gmar/dynamic/manuals/2011/chevrolet/Astra/es/om_ng-chevrolet_Astra_my11-es_AR.pdf.pdf';
export const cars = {
  astra: {
    name: 'Chevrolet Astra',
    variant: '5-door hatchback · 2.0',
    kind: 'astra-hatch',
    length: 4.199,
    width: 1.709,
    mirrorWidth: 1.989,
    height: 1.431,
    wheelbase: 2.614,
    frontOverhang: 0.878,
    frontTrack: 1.464,
    rearTrack: 1.44,
    tireRadius: 0.3075,
    tireWidth: 0.195,
    paint: '#a7b4b9',
  },
  'astra-sedan': {
    name: 'Chevrolet Astra Sedan',
    variant: '4-door sedan · 2.0',
    kind: 'astra-sedan',
    length: 4.342,
    width: 1.709,
    mirrorWidth: 1.989,
    height: 1.425,
    wheelbase: 2.614,
    frontOverhang: 0.878,
    frontTrack: 1.484,
    rearTrack: 1.46,
    tireRadius: 0.3075,
    tireWidth: 0.195,
    paint: '#778f9c',
  },
  wagon: {
    name: 'Hillside Wagon',
    variant: 'The original little adventurer',
    kind: 'wagon',
    length: 3.92,
    width: 1.93,
    mirrorWidth: 2.145,
    height: 1.745,
    wheelbase: 2.27,
    frontOverhang: 0.84,
    frontTrack: 1.9,
    rearTrack: 1.9,
    tireRadius: 0.36,
    tireWidth: 0.24,
    paint: null,
  },
} satisfies Record<string, CarSpec>;

export type CarId = keyof typeof cars;
export const defaultCar: CarId = 'astra';
export function carAxles(spec: CarSpec) {
  const front = spec.length / 2 - spec.frontOverhang;
  return { front, rear: spec.wheelbase - front };
}

/** Symmetric safety envelope around the front-axle drift pivot. */
export function carRoadLimit(roadWidth: number, yaw: number, car: CarId = defaultCar) {
  const spec = cars[car];
  const axles = carAxles(spec);
  const footprint =
    (spec.mirrorWidth / 2) * Math.abs(Math.cos(yaw)) +
    (spec.length / 2 + axles.front) * Math.abs(Math.sin(yaw));
  return Math.max(0, roadWidth / 2 - Math.max(spec.mirrorWidth / 2 + 0.12, footprint + 0.1));
}
