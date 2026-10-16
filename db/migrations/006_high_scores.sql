-- The world's scoreboard. One row per submitted run; the board is the top 20.
--
-- Initials are exactly three characters from a deliberately narrow set:
-- A-Z, 0-9, space and period. The client uppercases and pads, so every row
-- stores the same shape and the board lines up in a fixed-width font.

create table if not exists high_scores (
  id bigserial primary key,
  initials text not null check (initials ~ '^[A-Z0-9 .]{3}$'),
  score integer not null check (score >= 0 and score <= 1000000),
  created_at timestamptz not null default now()
);

-- The board's only query: highest first, earliest wins a tie.
create index if not exists high_scores_rank
  on high_scores (score desc, created_at asc);
