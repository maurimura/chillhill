import { defaultCurveLength, defaultCurveMix } from './road-shape.ts';

/** Absolute configurable speed ceiling, in km/h; also enforced by the API. */
export const maxDrivingSpeed = 280;

/** Version records the game's scoring history; it never separates rankings. */
export const scoringDefaults = Object.freeze({
  version: 6,
  nearMissPoints: 100,
  speedReference: 60, // km/h; independent of display units or a custom speed cap
  speedMinMultiplier: 0.5,
  speedMaxMultiplier: 2,
  streakStep: 0.25,
  streakMaxMultiplier: 2,
  driftPointsPerSecond: 20,
  driftRampSeconds: 8,
  driftMaxMultiplier: 3,
  driftMinSpeed: 7.2, // km/h; matches the smoke renderer's > 2 m/s gate
  driftMinAmount: 0.1, // visible rear slip, not the smoke's fading numerical tail
  shoulderEntryPenalty: 25,
  shoulderMinRate: 10, // points per second outside the asphalt
  shoulderMaxRate: 30,
  shoulderFullDepth: 2.5, // metres beyond the safe body envelope
  shoulderDebounce: 0.15,
  shoulderRearm: 1, // continuous clean seconds before another entry can be charged
  feedbackSeconds: 1.8,
  leaderboardSize: 10,
});

export type ScoringConfig = { [K in keyof typeof scoringDefaults]: number };

/** Canonical difficulty, not user saves or environment overrides. Scenery,
 * units, paint, and the starting car/seed do not affect this classification. */
export const standardDriving = Object.freeze({
  curves: 1,
  curveLength: defaultCurveLength,
  curveMix: defaultCurveMix,
  roadWidth: 10,
  grade: 0.09,
  maxSpeed: maxDrivingSpeed,
  drift: 0.55,
});
export type ScoredSettings = {
  [K in Exclude<keyof typeof standardDriving, 'curveLength' | 'curveMix'>]: number;
} & {
  curveLength?: number;
  curveMix?: number;
  seed: number;
  car?: string;
};
export function scoredSetting(settings: ScoredSettings, key: keyof typeof standardDriving) {
  return (
    settings[key] ??
    (key === 'curveLength' ? defaultCurveLength : key === 'curveMix' ? defaultCurveMix : NaN)
  );
}
export function isStandardDriving(settings: ScoredSettings) {
  return (Object.keys(standardDriving) as (keyof typeof standardDriving)[]).every(
    (key) => Math.abs(scoredSetting(settings, key) - standardDriving[key]) < 1e-9,
  );
}
