-- Reworks the schedule.
--
-- Old model: nothing official could happen until midnight on the 7th.
-- New model: official runs are open from the moment the league goes live, and
-- practice is what has a deadline.
--
--   now .. practice_close_at   practice and official runs both available
--   practice_close_at .. close official runs only
--   all runs complete          selection may begin early, without waiting
--   official_close_at          anyone who never ran is scored zero
--
-- Selection no longer has to wait for a wall-clock time. The moment every
-- manager has a locked score there is nothing left to wait for.

alter table league_settings
  -- After this, PRACTICE is gone and only the official run remains.
  add column if not exists practice_close_at timestamptz,
  -- Stamped when the last official run lands. Also the flag that lets
  -- selection open early.
  add column if not exists all_runs_complete_at timestamptz,
  -- Stamped once the commissioner has been emailed, so it sends exactly once.
  add column if not exists completion_notified_at timestamptz;

-- Backfill for an already seeded league: practice closes when the official
-- window would previously have opened.
update league_settings
   set practice_close_at = official_open_at
 where practice_close_at is null;

alter table league_settings
  alter column practice_close_at set not null;

-- The old constraint assumed official runs opened after practice ended. They
-- now overlap, so the only ordering that still has to hold is that the official
-- window opens before it closes, and selection closes last.
alter table league_settings
  drop constraint if exists window_order;

alter table league_settings
  add constraint window_order check (
    official_open_at < official_close_at
    and practice_close_at <= official_close_at
    and official_close_at <= selection_open_at
    and selection_open_at < selection_close_at
  );
