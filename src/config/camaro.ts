// Chevrolet's 1969 AMA sheet, page 1. Inches converted exactly to meters.
// Tires and mirror envelope are visual approximations; see docs/muscle-cars-references.md.
export const camaroSpec = {
  name: 'Chevrolet Camaro',
  variant: '1969 SS 396 coupé · V8',
  kind: 'camaro-ss',
  length: 4.7244,
  width: 1.8796,
  mirrorWidth: 2.015,
  height: 1.29794,
  wheelbase: 2.7432,
  frontOverhang: 0.94234,
  frontTrack: 1.51384,
  rearTrack: 1.5113,
  tireRadius: 0.326,
  tireWidth: 0.215,
  wheelStyle: 'rally',
  paint: '#d9763f',
} as const;
