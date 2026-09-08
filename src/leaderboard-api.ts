import type { CarId } from './config/cars.ts';
import type { ScoreCategory, ScoreRecord } from './scoreboard.ts';

/** Same-origin API. Bearer capabilities stay in memory, never in public records. */
export interface StartRunRequest {
  version: number;
  car: CarId;
  seed: number;
  category: ScoreCategory;
}
export interface StartRunResponse {
  runId: string;
  token: string;
  expiresAt: string;
}
export interface FinishRunRequest {
  token: string;
  record: ScoreRecord;
}
export interface NameRunRequest {
  token: string;
  name: string;
}
export interface RankResponse {
  qualified: boolean;
  rank: number | null;
}
export interface LeaderboardEntry {
  name: string;
  record: ScoreRecord;
}
export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
}
export interface LeaderboardError {
  error: string;
}
