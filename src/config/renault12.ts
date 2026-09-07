// Renault's 1969 launch brochure, technical plate on scan page 6.
// See docs/renault12-references.md for primary sources and estimated details.
export const renault12Spec = {
  name: 'Renault 12',
  variant: 'Early TL sedan · 1.3',
  kind: 'renault-12',
  length: 4.34,
  width: 1.636,
  mirrorWidth: 1.79, // Conservative game envelope; not a factory measurement.
  height: 1.434,
  wheelbase: 2.441,
  frontOverhang: 0.859,
  frontTrack: 1.312,
  rearTrack: 1.312,
  tireRadius: 0.284, // 145 x 330 period tire, approximated as 145/82 R13.
  tireWidth: 0.145,
  wheelStyle: 'steel',
  paint: '#e3d7b6',
} as const;
