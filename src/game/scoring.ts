import { scoringDefaults, type ScoringConfig } from '../config/scoring.ts';

export interface RunScore {
  points: number;
  earned: number;
  nearMissEarned: number;
  driftEarned: number;
  /** Actual deductions, limited by the zero floor; earned - penalties = points. */
  penalties: number;
  streak: number;
  bestStreak: number;
  driftSeconds: number;
  bestDriftSeconds: number;
  /** Current uninterrupted, eligible drift; pauses freeze it. */
  driftTime: number;
  driftPoints: number;
  shoulderTouches: number;
  shoulderSeconds: number;
  drivingSeconds: number;
  movingSeconds: number;
  movingDistance: number;
  topSpeed: number; // km/h
  shoulderTime: number;
  shoulderCharged: boolean;
  cleanTime: number;
  notice: 'near-miss' | 'shoulder' | 'drift' | null;
  noticePoints: number;
  noticeRemaining: number;
}

export const initialScore = (): RunScore => ({
  points: 0,
  earned: 0,
  nearMissEarned: 0,
  driftEarned: 0,
  penalties: 0,
  streak: 0,
  bestStreak: 0,
  driftSeconds: 0,
  bestDriftSeconds: 0,
  driftTime: 0,
  driftPoints: 0,
  shoulderTouches: 0,
  shoulderSeconds: 0,
  drivingSeconds: 0,
  movingSeconds: 0,
  movingDistance: 0,
  topSpeed: 0,
  shoulderTime: 0,
  shoulderCharged: false,
  cleanTime: 0,
  notice: null,
  noticePoints: 0,
  noticeRemaining: 0,
});

export function streakMultiplier(
  streak: number,
  config: Readonly<ScoringConfig> = scoringDefaults,
) {
  return Math.min(config.streakMaxMultiplier, 1 + Math.max(0, streak) * config.streakStep);
}

export function nearMissPoints(
  speedKmh: number,
  streak: number,
  config: Readonly<ScoringConfig> = scoringDefaults,
) {
  const speed = Math.max(
    config.speedMinMultiplier,
    Math.min(config.speedMaxMultiplier, speedKmh / config.speedReference),
  );
  return Math.round(config.nearMissPoints * speed * streakMultiplier(streak, config));
}

export function awardNearMiss(
  score: RunScore,
  speedKmh: number,
  config: Readonly<ScoringConfig> = scoringDefaults,
) {
  const points = nearMissPoints(speedKmh, score.streak, config);
  score.nearMissEarned += points;
  score.earned = score.nearMissEarned + score.driftEarned;
  score.points = score.earned - score.penalties;
  score.streak++;
  score.bestStreak = Math.max(score.bestStreak, score.streak);
  score.notice = 'near-miss';
  score.noticePoints = points;
  score.noticeRemaining = config.feedbackSeconds;
  return points;
}

export function driftMultiplier(
  seconds: number,
  config: Readonly<ScoringConfig> = scoringDefaults,
) {
  return (
    1 +
    (Math.max(1, config.driftMaxMultiplier) - 1) *
      Math.min(1, Math.max(0, seconds) / Math.max(0.01, config.driftRampSeconds))
  );
}

function endDrift(score: RunScore) {
  score.driftTime = 0;
  score.driftPoints = 0;
}

/** Uses the physical rear-slip signal that emits smoke, never particle density.
 * Call after collision checks: an impact cannot earn points on the same step. */
export function stepDriftScore(
  score: RunScore,
  dt: number,
  driftAmount: number,
  speedKmh: number,
  eligible: boolean,
  config: Readonly<ScoringConfig> = scoringDefaults,
) {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  if (
    !eligible ||
    !Number.isFinite(driftAmount) ||
    !Number.isFinite(speedKmh) ||
    driftAmount < config.driftMinAmount ||
    speedKmh <= config.driftMinSpeed
  ) {
    endDrift(score);
    return;
  }
  const before = score.driftTime;
  const after = before + dt;
  const rampTime = Math.min(dt, Math.max(0, Math.max(0.01, config.driftRampSeconds) - before));
  // Integrate the linear ramp exactly, including the step crossing its cap.
  // Rounding individual simulation steps would reward high/low frame rates.
  const points =
    Math.max(0, config.driftPointsPerSecond) *
    ((rampTime * (driftMultiplier(before, config) + driftMultiplier(before + rampTime, config))) /
      2 +
      (dt - rampTime) * driftMultiplier(after, config));
  score.driftTime = after;
  score.driftSeconds += dt;
  score.bestDriftSeconds = Math.max(score.bestDriftSeconds, after);
  score.driftPoints += points;
  score.driftEarned += points;
  score.earned = score.nearMissEarned + score.driftEarned;
  score.points = score.earned - score.penalties;
  // A near miss or shoulder warning stays readable before live drift feedback.
  if (score.notice === 'drift' || score.notice === null || score.noticeRemaining <= 0) {
    score.notice = 'drift';
    score.noticePoints = score.driftPoints;
    score.noticeRemaining = config.feedbackSeconds;
  }
}

/** A crash or safety recenter ends the streak, but never erases banked points. */
export function resetScoreEncounter(score: RunScore) {
  endDrift(score);
  score.streak = 0;
  score.shoulderTime = 0;
  score.shoulderCharged = false;
  score.cleanTime = 0;
  score.notice = null;
  score.noticeRemaining = 0;
}

function deduct(score: RunScore, amount: number) {
  const actual = Math.min(score.points, Math.max(0, amount));
  score.points -= actual;
  score.penalties = score.earned - score.points;
  return actual;
}

/** Called only by active racing simulation. Pauses, incidents, and menus do not
 * accrue time or penalties. A brief rejoin/side switch shares the same excursion. */
export function stepScore(
  score: RunScore,
  dt: number,
  excursion: number,
  speedKmh: number,
  distance: number,
  protectedPass: boolean,
  config: Readonly<ScoringConfig> = scoringDefaults,
) {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  score.noticeRemaining = Math.max(0, score.noticeRemaining - dt);
  score.drivingSeconds += dt;
  score.topSpeed = Math.max(score.topSpeed, speedKmh);
  if (speedKmh > 0.1) {
    score.movingSeconds += dt;
    score.movingDistance += Math.max(0, distance);
  }
  if (protectedPass) {
    endDrift(score);
    score.shoulderTime = 0;
    score.shoulderCharged = false;
    score.cleanTime = 0;
    return;
  }
  if (excursion <= 0) {
    score.cleanTime = Math.min(config.shoulderRearm, score.cleanTime + dt);
    if (score.cleanTime + 1e-9 >= config.shoulderRearm) {
      score.shoulderTime = 0;
      score.shoulderCharged = false;
    }
    return;
  }
  endDrift(score);
  score.cleanTime = 0;
  score.shoulderSeconds += dt;
  const before = score.shoulderTime;
  score.shoulderTime += dt;
  if (score.shoulderTime + 1e-9 < config.shoulderDebounce) return;
  if (!score.shoulderCharged) {
    score.shoulderCharged = true;
    score.shoulderTouches++;
    score.streak = 0;
    score.notice = 'shoulder';
    score.noticePoints = -deduct(score, config.shoulderEntryPenalty);
    score.noticeRemaining = config.feedbackSeconds;
  }
  const chargedTime =
    Math.max(0, score.shoulderTime - config.shoulderDebounce) -
    Math.max(0, before - config.shoulderDebounce);
  const depth = Math.min(1, Math.max(0, excursion / config.shoulderFullDepth));
  const rate = config.shoulderMinRate + (config.shoulderMaxRate - config.shoulderMinRate) * depth;
  deduct(score, rate * chargedTime);
}
