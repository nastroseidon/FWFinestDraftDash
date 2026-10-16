import { BOARD_SIZE } from './board';
import { query } from './db';

/** Rows kept in the table. Anything below this can never reach the board. */
const KEEP_ROWS = 500;

export type HighScore = {
  initials: string;
  score: number;
  created_at: Date;
};

/**
 * The scoreboard is the only table the public game touches, and it may not
 * exist yet on a database that predates it. Creating it on first use means the
 * board works the moment this deploys, with no migration step in between.
 * `db/migrations/006_high_scores.sql` holds the same definition.
 */
let ensured: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  ensured ??= (async () => {
    await query(`
      create table if not exists high_scores (
        id bigserial primary key,
        initials text not null check (initials ~ '^[A-Z0-9 .]{3}$'),
        score integer not null check (score >= 0 and score <= 1000000),
        created_at timestamptz not null default now()
      )
    `);
    await query(
      'create index if not exists high_scores_rank on high_scores (score desc, created_at asc)',
    );
  })().catch((err) => {
    // A failed attempt must not be cached, or every later request inherits it.
    ensured = null;
    throw err;
  });

  return ensured;
}

export async function topScores(limit = BOARD_SIZE): Promise<HighScore[]> {
  await ensureTable();
  return query<HighScore>(
    `select initials, score, created_at
       from high_scores
      order by score desc, created_at asc
      limit $1`,
    [limit],
  );
}

/** Adds one run to the board and returns the board as it now stands. */
export async function addScore(initials: string, score: number): Promise<HighScore[]> {
  await ensureTable();
  await query('insert into high_scores (initials, score) values ($1, $2)', [initials, score]);

  // Keeping the table small is cheap here and keeps the board query fast
  // forever. Only rows far below the cut are ever removed.
  await query(
    `delete from high_scores
      where id not in (
        select id from high_scores order by score desc, created_at asc limit $1
      )`,
    [KEEP_ROWS],
  );

  return topScores();
}
