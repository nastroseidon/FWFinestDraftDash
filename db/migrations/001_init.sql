-- Fort Wayne Finest: Draft Dash — initial schema.
-- Deliberately small. Every rule that must not be client-controlled is enforced
-- here (constraints) or in a transaction in the API layer.

create table if not exists league_settings (
  id                        smallint primary key default 1,
  league_name               text        not null default 'Fort Wayne Finest',
  -- IANA zone, never a fixed EST/EDT offset.
  timezone                  text        not null default 'America/Indiana/Indianapolis',
  official_open_at          timestamptz not null,
  official_close_at         timestamptz not null,
  selection_open_at         timestamptz not null,
  selection_close_at        timestamptz not null,
  -- Seeds the official course and the tiebreaker. Fixed once runs open.
  official_seed             bigint      not null,
  league_size               smallint    not null default 12,
  -- Commissioner overrides. Null means "follow the schedule above".
  official_open_override    boolean,
  selection_open_override   boolean,
  reveal_released           boolean     not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint one_row check (id = 1),
  constraint league_size_range check (league_size between 4 and 16),
  constraint window_order check (
    official_open_at < official_close_at
    and official_close_at <= selection_open_at
    and selection_open_at < selection_close_at
  )
);

create table if not exists league_members (
  id                   uuid primary key default gen_random_uuid(),
  display_name         text        not null,
  team_name            text,
  -- scrypt hash; the PIN itself is never stored.
  access_code_hash     text        not null,
  is_admin             boolean     not null default false,
  practice_best        integer     not null default 0,
  official_started_at  timestamptz,
  official_completed_at timestamptz,
  official_score       integer,
  -- Frozen at ranking time so a rank can never shift underneath a player.
  selection_priority   smallint,
  selected_draft_slot  smallint,
  -- Stored server-side random value. Breaks ties on equal scores, and it is
  -- written once so re-running the ranking cannot change the outcome.
  tiebreak             double precision not null default random(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint display_name_not_blank check (length(btrim(display_name)) > 0),
  constraint practice_best_non_negative check (practice_best >= 0),
  constraint official_score_non_negative check (official_score is null or official_score >= 0),
  -- A completed run must have a score, and a score requires a started run.
  constraint completed_has_score check (
    (official_completed_at is null) = (official_score is null)
  ),
  constraint completed_requires_start check (
    official_completed_at is null or official_started_at is not null
  )
);

-- Case-insensitive login handle.
create unique index if not exists league_members_display_name_key
  on league_members (lower(display_name));

-- The concurrency guarantee for draft selection: two managers can never hold
-- the same slot, whatever the application layer does.
create unique index if not exists league_members_draft_slot_key
  on league_members (selected_draft_slot)
  where selected_draft_slot is not null;

create unique index if not exists league_members_priority_key
  on league_members (selection_priority)
  where selection_priority is not null;

-- Optional audit trail. Useful for the commissioner when someone claims the
-- game ate their run.
create table if not exists run_events (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references league_members (id) on delete cascade,
  mode              text not null check (mode in ('practice', 'official')),
  run_started_at    timestamptz not null default now(),
  run_completed_at  timestamptz,
  score             integer check (score is null or score >= 0),
  completion_status text not null default 'started'
    check (completion_status in ('started', 'completed', 'abandoned')),
  created_at        timestamptz not null default now()
);

create index if not exists run_events_member_idx on run_events (member_id, created_at desc);

-- Keep updated_at honest without the application having to remember.
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists league_members_touch on league_members;
create trigger league_members_touch before update on league_members
  for each row execute function touch_updated_at();

drop trigger if exists league_settings_touch on league_settings;
create trigger league_settings_touch before update on league_settings
  for each row execute function touch_updated_at();
