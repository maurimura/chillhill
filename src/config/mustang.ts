// Ford's 1967 sales brochure, final specifications page. Inches converted to meters.
// Front overhang, tires and mirror envelope are photo-fit estimates (documented).
export const mustangSpec = {
  name: 'Ford Mustang',
  variant: '1967 fastback 2+2 · 289 V8',
  kind: 'mustang-fastback',
  length: 4.66344,
  width: 1.80086,
  mirrorWidth: 1.95,
  height: 1.31572,
  wheelbase: 2.7432,
  frontOverhang: 0.815,
  frontTrack: 1.4732,
  rearTrack: 1.4732,
  tireRadius: 0.321,
  tireWidth: 0.205,
  wheelStyle: 'styled-steel',
  paint: '#648b89',
} as const;
