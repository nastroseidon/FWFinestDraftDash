import { PoolClient } from 'pg';
import { query, transaction } from './db';
import { sendAllRunsCompleteEmail } from './notify';

export type Member = {
  id: string;
  display_name: string;
  team_name: string | null;
  is_admin: boolean;
  practice_best: number;
  official_started_at: Date | null;
  official_completed_at: Date | null;
  official_score: number | null;
  selection_priority: number | null;
  selected_draft_slot: number | null;
};

const PUBLIC_COLUMNS = `
  id, display_name, team_name, is_admin, practice_best,
  official_started_at, official_completed_at, official_score,
  selection_priority, selected_draft_slot
`;

export async function findMemberById(id: string): Promise<Member | null> {
  const rows = await query<Member>(
    `select ${PUBLIC_COLUMNS} from league_members where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findMemberByName(
  displayName: string,
): Promise<(Member & { access_code_hash: string }) | null> {
  const rows = await query<Member & { access_code_hash: string }>(
    `select ${PUBLIC_COLUMNS}, access_code_hash
       from league_members
      where lower(display_name) = lower($1)`,
    [displayName.trim()],
  );
  return rows[0] ?? null;
}

/** Practice best only ever moves up. */
export async function recordPracticeRun(memberId: string, score: number): Promise<number> {
  const rows = await query<{ practice_best: number }>(
    `update league_members
        set practice_best = greatest(practice_best, $2)
      where id = $1
      returning practice_best`,
    [memberId, score],
  );

  await query(
    `insert into run_events (member_id, mode, run_completed_at, score, completion_status)
     values ($1, 'practice', now(), $2, 'completed')`,
    [memberId, score],
  );

  return rows[0]?.practice_best ?? score;
}

export type StartOfficialResult =
  | { ok: true; startedAt: Date }
  | { ok: false; reason: 'already_started' | 'already_completed' };

/**
 * Claims the single official attempt. The check and the write are in one
 * transaction with the row locked, so a double-tap or two devices cannot both
 * win. Marking the start server-side is what makes refreshing the page useless
 * as a restart: the attempt is already spent.
 */
export async function startOfficialRun(memberId: string): Promise<StartOfficialResult> {
  return transaction(async (c: PoolClient) => {
    const { rows } = await c.query(
      `select official_started_at, official_completed_at
         from league_members
        where id = $1
        for update`,
      [memberId],
    );
    const row = rows[0];
    if (!row) return { ok: false, reason: 'already_started' } as const;
    if (row.official_completed_at) return { ok: false, reason: 'already_completed' } as const;
    if (row.official_started_at) return { ok: false, reason: 'already_started' } as const;

    const started = await c.query(
      `update league_members
          set official_started_at = now()
        where id = $1
        returning official_started_at`,
      [memberId],
    );

    await c.query(
      `insert into run_events (member_id, mode, completion_status)
       values ($1, 'official', 'started')`,
      [memberId],
    );

    return { ok: true, startedAt: started.rows[0].official_started_at } as const;
  });
}

export type CompleteOfficialResult =
  | { ok: true; score: number }
  | { ok: false; reason: 'not_started' | 'already_completed'; score?: number };

/** Writes the official score exactly once. There are no appeals. */
export async function completeOfficialRun(
  memberId: string,
  score: number,
): Promise<CompleteOfficialResult> {
  return transaction(async (c: PoolClient) => {
    const { rows } = await c.query(
      `select official_started_at, official_completed_at, official_score
         from league_members
        where id = $1
        for update`,
      [memberId],
    );
    const row = rows[0];
    if (!row || !row.official_started_at) {
      return { ok: false, reason: 'not_started' } as const;
    }
    if (row.official_completed_at) {
      return { ok: false, reason: 'already_completed', score: row.official_score } as const;
    }

    await c.query(
      `update league_members
          set official_completed_at = now(), official_score = $2
        where id = $1`,
      [memberId, score],
    );

    await c.query(
      `update run_events
          set run_completed_at = now(), score = $2, completion_status = 'completed'
        where id = (
          select id from run_events
           where member_id = $1 and mode = 'official' and completion_status = 'started'
           order by run_started_at desc
           limit 1
        )`,
      [memberId, score],
    );

    return { ok: true, score } as const;
  });
}

/**
 * Stamps the moment the last official run lands, which is what lets selection
 * open early. Returns true only on the transition, so the email fires once.
 *
 * The stamp is written under a conditional update rather than a read then
 * write, so two managers finishing at the same instant cannot both claim to be
 * the last one in.
 */
export async function markAllRunsCompleteIfDone(): Promise<boolean> {
  const rows = await query<{ stamped: boolean }>(`
    update league_settings
       set all_runs_complete_at = now()
     where id = 1
       and all_runs_complete_at is null
       and not exists (
         select 1 from league_members where official_completed_at is null
       )
    returning true as stamped
  `);
  return rows.length > 0;
}

/** Best effort, and only ever once. Never throws into the request path. */
export async function notifyCommissionerOnce(baseUrl: string): Promise<void> {
  const claimed = await query<{ id: number }>(`
    update league_settings
       set completion_notified_at = now()
     where id = 1
       and all_runs_complete_at is not null
       and completion_notified_at is null
    returning id
  `);
  if (claimed.length === 0) return;

  const info = await query<{ league_name: string; total: string }>(`
    select (select league_name from league_settings where id = 1) as league_name,
           (select count(*)::text from league_members) as total
  `);

  const result = await sendAllRunsCompleteEmail({
    leagueName: info[0].league_name,
    completed: Number(info[0].total),
    total: Number(info[0].total),
    adminUrl: `${baseUrl}/admin`,
  });

  if (!result.sent) {
    console.error('[draft-dash] commissioner email not sent:', result.reason);
    // Let it be retried, rather than silently swallowing the only notification.
    await query('update league_settings set completion_notified_at = null where id = 1');
  }
}
