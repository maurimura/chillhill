/** Original 206 five-door; Peugeot's May 2005 technical plate (see reference notes). */
export const peugeot206 = {
  name: 'Peugeot 206',
  variant: '2005 · 5-door hatchback',
  kind: 'peugeot-206',
  length: 3.835,
  width: 1.652,
  mirrorWidth: 1.89, // Conservative visual envelope; not a factory measurement.
  height: 1.432,
  wheelbase: 2.442,
  frontOverhang: 0.785,
  frontTrack: 1.425,
  rearTrack: 1.416,
  tireRadius: 0.29155, // 175/65 R14: 14 in / 2 + 175 mm × 0.65.
  tireWidth: 0.175,
  paint: '#7ca9bb',
} as const;
