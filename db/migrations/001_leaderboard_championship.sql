-- Non-destructive championship fields. Existing rows stay in place.
-- Rows missing goal_reps, duration_sec, or consistency are left out of boards
-- that depend on that setting, instead of being mixed into the wrong ranking.

alter table leaderboard add column if not exists consistency numeric;
alter table leaderboard add column if not exists goal_reps integer;

create index if not exists leaderboard_arcade_board
  on leaderboard (exercise, duration_sec, reps desc, created_at asc, id asc);

create index if not exists leaderboard_quality_board
  on leaderboard (exercise, challenge, goal_reps, target_deg);
