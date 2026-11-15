-- Quality boards can tell which scoring configuration produced a row.
-- Existing rows stay. A null version is not mixed into form-v1 rankings.

alter table leaderboard add column if not exists scoring_version text;

create index if not exists leaderboard_quality_rank
  on leaderboard (exercise, goal_reps, scoring_version, average desc, consistency desc, created_at asc, id asc);
