import { cars, defaultCar, type CarId } from './config/cars.ts';
import {
  isStandardDriving,
  scoredSetting,
  scoringDefaults,
  standardDriving,
  type ScoredSettings,
} from './config/scoring.ts';
import type { ChallengeState } from './game/challenge.ts';

export type ScoreCategory = 'standard' | 'custom';
// One permanent board; older versioned keys remain readable as backups.
export const scoreStorageKey = 'chillhill.scores';
const reasonLabels = {
  setup: 'Custom driving setup',
  tuning: 'Driving settings changed during the run',
  route: 'Route changed during the run',
  car: 'Car changed during the run',
} as const;
export type CustomReason = keyof typeof reasonLabels;
export const customReasonLabel = (reason: CustomReason) => reasonLabels[reason];

export interface ScoreRun {
  id: string;
  seed: number;
  car: CarId;
  cars: CarId[];
  category: ScoreCategory;
  customReasons: CustomReason[];
}
export interface ScoreRecord extends ScoreRun {
  version: number;
  finishedAt: string;
  score: number;
  earned: number;
  nearMissEarned: number;
  driftEarned: number;
  driftSeconds: number;
  bestDriftSeconds: number;
  penalties: number;
  nearMisses: number;
  bestStreak: number;
  shoulderTouches: number;
  shoulderSeconds: number;
  distance: number; // metres
  duration: number;
  topSpeed: number; // km/h
  averageSpeed: number;
}
export interface RunResult {
  record: ScoreRecord;
  personalBest: boolean;
  rank: number | null;
  persisted: boolean;
}
export interface ScoreStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createScoreRun(
  settings: ScoredSettings,
  id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
): ScoreRun {
  const car =
    settings.car && Object.hasOwn(cars, settings.car) ? (settings.car as CarId) : defaultCar;
  const standard = isStandardDriving(settings);
  return {
    id,
    seed: settings.seed,
    car,
    cars: [car],
    category: standard ? 'standard' : 'custom',
    customReasons: standard ? [] : ['setup'],
  };
}

/** Once custom, always custom for this run—even if a slider is restored. */
export function trackScoreSettings(run: ScoreRun, before: ScoredSettings, after: ScoredSettings) {
  const add = (reason: CustomReason) => {
    run.category = 'custom';
    if (!run.customReasons.includes(reason)) run.customReasons.push(reason);
  };
  if (
    (Object.keys(standardDriving) as (keyof typeof standardDriving)[]).some(
      (key) => scoredSetting(before, key) !== scoredSetting(after, key),
    )
  )
    add('tuning');
  if (before.seed !== after.seed) add('route');
  if (before.car !== after.car) {
    add('car');
    if (after.car && Object.hasOwn(cars, after.car) && !run.cars.includes(after.car as CarId))
      run.cars.push(after.car as CarId);
  }
}

export function completedScore(
  run: ScoreRun,
  challenge: ChallengeState,
  distance: number,
  finishedAt = new Date().toISOString(),
): ScoreRecord | null {
  if (challenge.phase !== 'gameover') return null;
  const stats = challenge.score;
  const points = Math.max(0, Math.round(stats.points));
  const driftEarned = Math.round(stats.driftEarned);
  const earned = stats.nearMissEarned + driftEarned;
  return {
    ...run,
    cars: [...run.cars],
    customReasons: [...run.customReasons],
    version: scoringDefaults.version,
    finishedAt,
    score: points,
    earned,
    nearMissEarned: stats.nearMissEarned,
    driftEarned,
    driftSeconds: stats.driftSeconds,
    bestDriftSeconds: stats.bestDriftSeconds,
    penalties: earned - points,
    nearMisses: challenge.overtakes,
    bestStreak: stats.bestStreak,
    shoulderTouches: stats.shoulderTouches,
    shoulderSeconds: stats.shoulderSeconds,
    distance,
    duration: stats.drivingSeconds,
    topSpeed: stats.topSpeed,
    averageSpeed: stats.movingSeconds > 0 ? (stats.movingDistance / stats.movingSeconds) * 3.6 : 0,
  };
}

export function validScoreRecord(value: unknown): ScoreRecord | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as ScoreRecord;
  if (
    !Number.isSafeInteger(row.version) ||
    row.version < 1 ||
    !['standard', 'custom'].includes(row.category) ||
    typeof row.id !== 'string' ||
    !/^[\w-]{1,80}$/.test(row.id) ||
    typeof row.finishedAt !== 'string' ||
    row.finishedAt.length > 32 ||
    !Number.isFinite(Date.parse(row.finishedAt)) ||
    typeof row.car !== 'string' ||
    !Object.hasOwn(cars, row.car) ||
    !Number.isInteger(row.seed) ||
    row.seed < 1 ||
    row.seed > 99999 ||
    !Array.isArray(row.cars) ||
    row.cars.length < 1 ||
    row.cars.length > Object.keys(cars).length ||
    !row.cars.every((car) => typeof car === 'string' && Object.hasOwn(cars, car)) ||
    !Array.isArray(row.customReasons) ||
    row.customReasons.length > 4 ||
    !row.customReasons.every(
      (reason) => typeof reason === 'string' && Object.hasOwn(reasonLabels, reason),
    )
  )
    return null;
  const keys = [
    'score',
    'earned',
    'nearMissEarned',
    'driftEarned',
    'driftSeconds',
    'bestDriftSeconds',
    'penalties',
    'nearMisses',
    'bestStreak',
    'shoulderTouches',
    'shoulderSeconds',
    'distance',
    'duration',
    'topSpeed',
    'averageSpeed',
  ] as const;
  if (
    keys.some((key) => !Number.isFinite(row[key]) || row[key] < 0 || row[key] > 1e12) ||
    [
      'score',
      'earned',
      'nearMissEarned',
      'driftEarned',
      'penalties',
      'nearMisses',
      'bestStreak',
      'shoulderTouches',
    ].some((key) => !Number.isInteger(row[key as keyof ScoreRecord])) ||
    row.earned - row.penalties !== row.score ||
    row.nearMissEarned + row.driftEarned !== row.earned ||
    row.bestDriftSeconds > row.driftSeconds + 1e-6 ||
    row.driftSeconds > row.duration + 1e-6 ||
    row.bestStreak > row.nearMisses ||
    (row.category === 'standard' && (row.customReasons.length > 0 || row.cars.length !== 1))
  )
    return null;
  // Whitelist fields; stored data is not HTML or a source of executable settings.
  return {
    version: row.version,
    id: row.id,
    finishedAt: new Date(row.finishedAt).toISOString(),
    category: row.category,
    seed: row.seed,
    car: row.car,
    cars: [...new Set(row.cars)],
    customReasons: [...new Set(row.customReasons)],
    ...Object.fromEntries(keys.map((key) => [key, row[key]])),
  } as ScoreRecord;
}

export function rankScores(records: readonly ScoreRecord[]): ScoreRecord[] {
  const unique = new Map<string, ScoreRecord>();
  for (const record of records) {
    const valid = validScoreRecord(record);
    if (valid && !unique.has(valid.id)) unique.set(valid.id, valid);
  }
  const sorted = [...unique.values()].sort(
    (a, b) =>
      b.score - a.score ||
      b.nearMisses - a.nearMisses ||
      a.finishedAt.localeCompare(b.finishedAt) ||
      a.id.localeCompare(b.id),
  );
  return sorted.slice(0, scoringDefaults.leaderboardSize);
}

export function readScores(storage?: ScoreStorage): ScoreRecord[] {
  const keys = [
    scoreStorageKey,
    ...Array.from({ length: scoringDefaults.version }, (_, i) => `chillhill.scores.v${i + 1}`),
  ];
  let records: ScoreRecord[] = [];
  for (const key of keys) {
    try {
      const raw = storage?.getItem(key);
      if (!raw || raw.length > 100000) continue;
      const value = JSON.parse(raw);
      if (!Array.isArray(value?.records) || value.records.length > 100) continue;
      records = rankScores([...records, ...value.records]);
    } catch {
      // One corrupt or inaccessible save must not hide the other records.
    }
  }
  return records;
}

function browserStorage(): ScoreStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** Bounded local records. No writes in the simulation loop and no network calls. */
export class ScoreboardStore {
  records: ScoreRecord[];
  persisted = true;
  private storage: ScoreStorage | undefined;
  constructor(storage: ScoreStorage | undefined = browserStorage()) {
    this.storage = storage;
    this.records = readScores(storage);
  }
  refresh() {
    this.records = rankScores([...readScores(this.storage), ...this.records]);
  }
  save(record: ScoreRecord): RunResult {
    this.refresh();
    const existing = this.records.find((row) => row.id === record.id);
    const previousBest = this.records[0]?.score ?? 0;
    this.records = rankScores([...this.records, record]);
    const rank = this.records.findIndex((row) => row.id === record.id) + 1;
    try {
      if (!this.storage) throw new Error('Storage is unavailable');
      this.storage.setItem(scoreStorageKey, JSON.stringify({ records: this.records }));
      this.persisted = true;
    } catch {
      this.persisted = false;
    }
    return {
      record,
      personalBest: !existing && record.score > previousBest,
      rank: rank || null,
      persisted: this.persisted,
    };
  }
}
