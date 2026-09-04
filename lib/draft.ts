import { PoolClient } from 'pg';
import { query, transaction } from './db';
import { LeagueSettings, loadSettings, phaseFor } from './phase';

/**
 * Draft position selection.
 *
 * Two rules drive every decision here:
 *   1. Rank order must be frozen. Once written it never moves, or a player's
 *      turn could shift underneath them mid-selection.
 *   2. A player learns nothing about anyone else. Not who has picked, not who
 *      is picking, not what anyone scored, not their own rank.
 */

/** Serialises every claim. Selection is twelve people over an hour, so the
 *  cost is irrelevant and the reasoning is much simpler than row locking. */
const DRAFT_LOCK = 4820260907;

export type DraftStatus = {
  phase: ReturnType<typeof phaseFor>;
  /** Their own locked score, or null before their run is complete. */
  officialScore: number | null;
  /** Their own slot once chosen. */
  selectedSlot: number | null;
  onTheClock: boolean;
  /** Only populated when they are on the clock. */
  board: { slot: number; available: boolean }[] | null;
  leagueSize: number;
  /** True once every slot is taken. */
  selectionComplete: boolean;
};

/**
 * Freezes the ranking. Idempotent: once priorities exist it does nothing, so
 * calling it on every request is safe.
 *
 * Order: completed runs by score descending, then everyone who did not complete
 * one. Ties break on the `tiebreak` value stored when the member row was
 * created, so the result is stable and cannot be influenced by finishing time.
 */
export async function ensureRankings(): Promise<void> {
  await transaction(async (c: PoolClient) => {
    await c.query('select pg_advisory_xact_lock($1)', [DRAFT_LOCK]);

    const { rows } = await c.query(
      'select rankings_frozen_at from league_settings where id = 1 for update',
    );
    if (rows[0]?.rankings_frozen_at) return;

    // Clear first. selection_priority carries a unique index, and assigning a
    // new order in one statement would trip it on the transient duplicate while
    // rows swap places. The index is partial on non-null, so nulling everything
    // empties it. Both statements share this transaction, so no other request
    // can observe the gap.
    await c.query('update league_members set selection_priority = null');

    // A completed run always outranks a missed one, even a completed zero.
    await c.query(`
      with ranked as (
        select id,
               row_number() over (
                 order by (official_completed_at is not null) desc,
                          coalesce(official_score, 0) desc,
                          tiebreak asc
               ) as priority
          from league_members
      )
      update league_members m
         set selection_priority = ranked.priority,
             -- A missed window is recorded as a real zero, so the reveal and
             -- the dashboard do not have to special case a null. The run is
             -- still identifiable as missed by official_completed_at being null.
             official_score = coalesce(m.official_score, 0)
        from ranked
       where m.id = ranked.id
    `);

    await c.query('update league_settings set rankings_frozen_at = now() where id = 1');
  });
}

/** The member whose turn it is: lowest priority still without a slot. */
async function currentSelectorId(c: PoolClient): Promise<string | null> {
  const { rows } = await c.query(`
    select id from league_members
     where selected_draft_slot is null and selection_priority is not null
     order by selection_priority asc
     limit 1
  `);
  return rows[0]?.id ?? null;
}

export async function draftStatus(memberId: string): Promise<DraftStatus> {
  const settings = await loadSettings();
  const phase = phaseFor(settings);

  const base = {
    phase,
    leagueSize: settings.league_size,
    board: null,
    onTheClock: false,
  };

  const me = (
    await query<{ official_score: number | null; selected_draft_slot: number | null }>(
      'select official_score, selected_draft_slot from league_members where id = $1',
      [memberId],
    )
  )[0];

  // Before selection opens there is nothing to say beyond their own score.
  if (phase === 'pre' || phase === 'official' || phase === 'ranking') {
    return {
      ...base,
      officialScore: me?.official_score ?? null,
      selectedSlot: me?.selected_draft_slot ?? null,
      selectionComplete: false,
    };
  }

  await ensureRankings();

  const fresh = (
    await query<{ official_score: number | null; selected_draft_slot: number | null }>(
      'select official_score, selected_draft_slot from league_members where id = $1',
      [memberId],
    )
  )[0];

  const remaining = await query<{ n: string }>(
    'select count(*)::text as n from league_members where selected_draft_slot is null',
  );
  const selectionComplete = Number(remaining[0].n) === 0;

  const onTheClock =
    !selectionComplete &&
    phase === 'selection' &&
    fresh?.selected_draft_slot === null &&
    (await transaction(async (c) => (await currentSelectorId(c)) === memberId));

  return {
    ...base,
    officialScore: fresh?.official_score ?? null,
    selectedSlot: fresh?.selected_draft_slot ?? null,
    onTheClock,
    // The board is only ever sent to the player on the clock, and it carries
    // availability alone. No names, no order, no timestamps.
    board: onTheClock ? await buildBoard(settings) : null,
    selectionComplete,
  };
}

async function buildBoard(
  settings: LeagueSettings,
): Promise<{ slot: number; available: boolean }[]> {
  const taken = new Set(
    (
      await query<{ selected_draft_slot: number }>(
        'select selected_draft_slot from league_members where selected_draft_slot is not null',
      )
    ).map((r) => r.selected_draft_slot),
  );

  return Array.from({ length: settings.league_size }, (_, i) => ({
    slot: i + 1,
    available: !taken.has(i + 1),
  }));
}

export type ClaimResult =
  | { ok: true; slot: number }
  | { ok: false; reason: 'not_open' | 'not_your_turn' | 'taken' | 'already_chosen' | 'bad_slot' };

/**
 * Claims a draft slot. Everything is checked inside one transaction holding the
 * advisory lock, so two players cannot both pass the checks. The unique index
 * on selected_draft_slot is the backstop if that reasoning is ever wrong.
 */
export async function claimSlot(memberId: string, slot: number): Promise<ClaimResult> {
  const settings = await loadSettings();
  if (phaseFor(settings) !== 'selection') return { ok: false, reason: 'not_open' };
  if (!Number.isInteger(slot) || slot < 1 || slot > settings.league_size) {
    return { ok: false, reason: 'bad_slot' };
  }

  await ensureRankings();

  return transaction(async (c: PoolClient) => {
    await c.query('select pg_advisory_xact_lock($1)', [DRAFT_LOCK]);

    const mine = await c.query(
      'select selected_draft_slot from league_members where id = $1 for update',
      [memberId],
    );
    if (!mine.rows[0]) return { ok: false, reason: 'not_your_turn' } as const;
    if (mine.rows[0].selected_draft_slot !== null) {
      return { ok: false, reason: 'already_chosen' } as const;
    }

    if ((await currentSelectorId(c)) !== memberId) {
      return { ok: false, reason: 'not_your_turn' } as const;
    }

    const taken = await c.query(
      'select 1 from league_members where selected_draft_slot = $1',
      [slot],
    );
    if (taken.rowCount) return { ok: false, reason: 'taken' } as const;

    await c.query(
      `update league_members
          set selected_draft_slot = $2, selected_at = now()
        where id = $1`,
      [memberId, slot],
    );

    return { ok: true, slot } as const;
  });
}
