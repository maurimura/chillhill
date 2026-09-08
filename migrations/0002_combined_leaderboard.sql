-- Rank all driving setups together while preserving existing records and rules versions.
CREATE INDEX IF NOT EXISTS leaderboard_combined_ranking ON leaderboard_entries(
  version, score DESC, near_misses DESC, finished_at, run_id
);
