-- One all-time ranking across every setup and scoring version. Preserve all records.
CREATE INDEX IF NOT EXISTS leaderboard_all_time_ranking ON leaderboard_entries(
  score DESC, near_misses DESC, finished_at, run_id
);
