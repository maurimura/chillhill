import type { CarId } from './cars.ts';

/** Shared by traffic generation and its bounded geometry-template cache. */
export const trafficCarIds = [
  'astra',
  'renault-12',
  'wagon',
  'peugeot-206',
  'mustang-fastback',
] as const satisfies readonly CarId[];

/** Challenge tuning is independent from the original, assisted Cozy physics. */
export interface ChallengeConfig {
  lives: number;
  trafficCount: number;
  /** Metres ahead of the player before a new vehicle may appear. */
  firstTrafficDistance: number;
  trafficSpacing: number;
  /** Traffic cruises at this fraction of the configured player speed cap. */
  trafficSpeedRatio: number;
  /** Maximum gap between actual body edges for a near miss, in metres. */
  nearMissDistance: number;
  /** Player must be driving, not farming passing traffic while parked (km/h). */
  nearMissMinSpeed: number;
  recoverySeconds: number;
  graceSeconds: number;
  /** Metres beyond the car's safe road envelope before recovery is impossible. */
  offRoadRange: number;
  /** Full recovery budget near the road, shrinking towards the outer limit. */
  offRoadSeconds: number;
  offRoadMinSeconds: number;
  /** Stable on-road time before the excursion is considered over for scoring. */
  offRoadRejoinSeconds: number;
  /** Continuous safe driving required before the shared recovery budget refills. */
  offRoadCooldownSeconds: number;
  /** Time to restore an entirely spent budget, after the cooldown. */
  offRoadRefillSeconds: number;
}

export const challengeDefaults: Readonly<ChallengeConfig> = Object.freeze({
  lives: 3,
  trafficCount: 7,
  firstTrafficDistance: 75,
  trafficSpacing: 74,
  trafficSpeedRatio: 0.46,
  nearMissDistance: 0.65,
  nearMissMinSpeed: 15,
  recoverySeconds: 1.35,
  graceSeconds: 2.5,
  offRoadRange: 6,
  offRoadSeconds: 4,
  offRoadMinSeconds: 0.8,
  offRoadRejoinSeconds: 0.25,
  offRoadCooldownSeconds: 5,
  offRoadRefillSeconds: 4,
});
