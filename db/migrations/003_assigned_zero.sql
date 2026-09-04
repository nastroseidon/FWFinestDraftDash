-- A manager who never starts an official run is assigned a score of 0 when
-- rankings are frozen, and ranks behind everyone who actually ran.
--
-- The original constraint tied score and completion together, which made that
-- assignment impossible. Loosen it to the invariant that actually matters: a
-- completed run must have a score. The reverse is no longer true, because an
-- assigned zero has a score and no completion.
--
-- That difference is also how a missed run is identified for the commissioner:
--   completed    -> official_completed_at is not null
--   missed       -> official_completed_at is null and official_score = 0

alter table league_members
  drop constraint if exists completed_has_score;

alter table league_members
  add constraint completed_requires_score
  check (official_completed_at is null or official_score is not null);
