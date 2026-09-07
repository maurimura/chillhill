/** 1967 short-wheelbase 911 S coupé; source/estimate notes in docs/porsche911-references.md. */
export const porsche911Spec = {
  name: 'Porsche 911 S',
  variant: '1967 · 2.0 flat-six coupé',
  kind: 'porsche-911',
  length: 4.163,
  width: 1.61,
  mirrorWidth: 1.75, // Both matching period-style mirrors fit this symmetric envelope.
  height: 1.32,
  wheelbase: 2.211,
  frontOverhang: 0.82, // Photo-proportioned: not a factory measurement.
  frontTrack: 1.354,
  rearTrack: 1.321,
  tireRadius: 0.326, // Approximate outside radius of a period 165 VR15 tire.
  tireWidth: 0.165,
  wheelStyle: 'fuchs',
  paint: '#b5c3bf',
} as const;
