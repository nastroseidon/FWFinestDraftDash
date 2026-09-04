-- Draft position selection.
--
-- Ranking is frozen rather than computed on the fly: once selection_priority is
-- written it must never move, or a player's turn could shift underneath them.

alter table league_members
  add column if not exists selected_at timestamptz;

alter table league_settings
  -- Set the moment rankings are frozen. Also the flag that says they exist.
  add column if not exists rankings_frozen_at timestamptz;

-- A slot must be a positive position. The upper bound is league_size, which a
-- CHECK cannot reach across tables, so that is enforced when claiming.
alter table league_members
  drop constraint if exists draft_slot_positive;
alter table league_members
  add constraint draft_slot_positive
  check (selected_draft_slot is null or selected_draft_slot >= 1);

-- A slot cannot be held without a priority to have earned it.
alter table league_members
  drop constraint if exists slot_requires_priority;
alter table league_members
  add constraint slot_requires_priority
  check (selected_draft_slot is null or selection_priority is not null);
