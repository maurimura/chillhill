// Ferrari owner's manual, chassis table p.12 (1986) / p.14 (1988 US).
// See docs/testarossa-references.md for the original manuals and visual sources.
export const testarossaSpec = {
  name: 'Ferrari Testarossa',
  variant: '1986 · custom twin mirrors · flat-12',
  kind: 'testarossa',
  length: 4.485,
  width: 1.976,
  mirrorWidth: 2.06, // Conservative visual envelope, estimated from photographs.
  height: 1.13,
  wheelbase: 2.55,
  frontOverhang: 1.025, // Photo-derived split; total length/wheelbase are factory values.
  frontTrack: 1.518,
  rearTrack: 1.66,
  tireRadius: 0.3157, // 225/50 R16 nominal unloaded radius.
  tireWidth: 0.225,
  rearTireRadius: 0.3307, // 255/50 R16: the wider rear tires are not copied from the front.
  rearTireWidth: 0.255,
  wheelStyle: 'star',
  paint: '#c72b24',
} as const;
