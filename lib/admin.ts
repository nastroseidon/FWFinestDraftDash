import { PoolClient } from 'pg';
import { query, transaction } from './db';
import { ensureRankings } from './draft';
import { releaseRevealIfComplete } from './reveal';
import { loadSettings, phaseFor } from './phase';

/**
 * Commissioner-only reads and overrides.
 *
 * Everything here is gated on is_admin at the route layer. None of it may ever
 * be reachable by a normal manager: it exposes every score and rank, which the
 * players are deliberately not allowed to see.
 */

/** Serialised with the draft lock so overrides cannot race a live selection. */
const DRAFT_LOCK = 4820260907;

export type AdminMember = {
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
  selected_at: Date | null;
  /** Started a run and never finished it. */
  abandoned: boolean;
  /** Never started a run at all. */
  never_ran: boolean;
};

export type AdminOverview = {
  league: {
    name: string;
    timezone: string;
    phase: ReturnType<typeof phaseFor>;
    leagueSize: number;
    serverNow: string;
    officialOpenAt: string;
    officialCloseAt: string;
    selectionOpenAt: string;
    selectionCloseAt: string;
    officialOpenOverride: boolean | null;
    selectionOpenOverride: boolean | null;
    rankingsFrozen: boolean;
    revealReleased: boolean;
  };
  members: AdminMember[];
  /** Who is on the clock right now, or null. */
  onTheClock: { id: string; display_name: string } | null;
  counts: {
    completed: number;
    abandoned: number;
    neverRan: number;
    slotsTaken: number;
  };
  takenSlots: number[];
};

export async function adminOverview(): Promise<AdminOverview> {
  const settings = await loadSettings();
  const phase = phaseFor(settings);

  const members = await query<AdminMember>(`
    select id, display_name, team_name, is_admin, practice_best,
           official_started_at, official_completed_at, official_score,
           selection_priority, selected_draft_slot, selected_at,
           (official_started_at is not null and official_completed_at is null) as abandoned,
           (official_started_at is null) as never_ran
      from league_members
     order by selection_priority nulls last, display_name
  `);

  const onClock = await query<{ id: string; display_name: string }>(`
    select id, display_name from league_members
     where selected_draft_slot is null and selection_priority is not null
     order by selection_priority asc
     limit 1
  `);

  return {
    league: {
      name: settings.league_name,
      timezone: settings.timezone,
      phase,
      leagueSize: settings.league_size,
      serverNow: settings.server_now.toISOString(),
      officialOpenAt: settings.official_open_at.toISOString(),
      officialCloseAt: settings.official_close_at.toISOString(),
      selectionOpenAt: settings.selection_open_at.toISOString(),
      selectionCloseAt: settings.selection_close_at.toISOString(),
      officialOpenOverride: settings.official_open_override,
      selectionOpenOverride: settings.selection_open_override,
      rankingsFrozen: !!(settings as unknown as { rankings_frozen_at: Date | null })
        .rankings_frozen_at,
      revealReleased: settings.reveal_released,
    },
    members,
    onTheClock: phase === 'selection' ? onClock[0] ?? null : null,
    counts: {
      completed: members.filter((m) => m.official_completed_at).length,
      abandoned: members.filter((m) => m.abandoned).length,
      neverRan: members.filter((m) => m.never_ran).length,
      slotsTaken: members.filter((m) => m.selected_draft_slot !== null).length,
    },
    takenSlots: members
      .map((m) => m.selected_draft_slot)
      .filter((s): s is number => s !== null)
      .sort((a, b) => a - b),
  };
}

/** null means "follow the schedule". */
export async function setWindowOverride(
  which: 'official' | 'selection',
  value: boolean | null,
) {
  const column =
    which === 'official' ? 'official_open_override' : 'selection_open_override';
  await query(`update league_settings set ${column} = $1 where id = 1`, [value]);
}

export type ResetResult =
  | { ok: true }
  | { ok: false; reason: 'slots_taken' | 'not_found' };

/**
 * Wipes one manager's official attempt so they can run again.
 *
 * Refused once anybody holds a draft slot: rank order would have to change
 * underneath a selection already in progress, and no override is worth
 * corrupting a draft that is halfway done.
 */
export async function resetOfficialAttempt(memberId: string): Promise<ResetResult> {
  return transaction(async (c: PoolClient) => {
    await c.query('select pg_advisory_xact_lock($1)', [DRAFT_LOCK]);

    const taken = await c.query(
      'select 1 from league_members where selected_draft_slot is not null limit 1',
    );
    if (taken.rowCount) return { ok: false, reason: 'slots_taken' } as const;

    const res = await c.query(
      `update league_members
          set official_started_at = null, official_completed_at = null,
              official_score = null, selection_priority = null
        where id = $1`,
      [memberId],
    );
    if (!res.rowCount) return { ok: false, reason: 'not_found' } as const;

    // Clear every priority and unfreeze, so the next status call ranks again
    // from scratch with this manager's new result included.
    await c.query('update league_members set selection_priority = null');
    await c.query('update league_settings set rankings_frozen_at = null where id = 1');

    return { ok: true } as const;
  });
}

export type AssignResult =
  | { ok: true }
  | { ok: false; reason: 'taken' | 'bad_slot' | 'not_found' | 'already_has_slot' };

/** Commissioner override for a manager who cannot pick for themselves. */
export async function assignDraftSlot(
  memberId: string,
  slot: number,
): Promise<AssignResult> {
  const result = await assignDraftSlotInner(memberId, slot);
  if (result.ok) await releaseRevealIfComplete();
  return result;
}

async function assignDraftSlotInner(
  memberId: string,
  slot: number,
): Promise<AssignResult> {
  const settings = await loadSettings();
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
    if (!mine.rows[0]) return { ok: false, reason: 'not_found' } as const;
    if (mine.rows[0].selected_draft_slot !== null) {
      return { ok: false, reason: 'already_has_slot' } as const;
    }

    const taken = await c.query(
      'select 1 from league_members where selected_draft_slot = $1',
      [slot],
    );
    if (taken.rowCount) return { ok: false, reason: 'taken' } as const;

    await c.query(
      'update league_members set selected_draft_slot = $2, selected_at = now() where id = $1',
      [memberId, slot],
    );
    return { ok: true } as const;
  });
}

export type ReleaseResult = { ok: true } | { ok: false; reason: 'incomplete' };

/**
 * Publishes the draft order. Refused until every slot is taken, because the
 * whole design keeps the board secret until selection is finished.
 */
export async function releaseReveal(released: boolean): Promise<ReleaseResult> {
  if (released) {
    const remaining = await query<{ n: string }>(
      'select count(*)::text as n from league_members where selected_draft_slot is null',
    );
    if (Number(remaining[0].n) > 0) return { ok: false, reason: 'incomplete' };
  }
  await query('update league_settings set reveal_released = $1 where id = 1', [released]);
  return { ok: true };
}

/** Wipes all play state. For testing only; the roster and codes survive. */
export async function resetLeagueState() {
  await transaction(async (c: PoolClient) => {
    await c.query('select pg_advisory_xact_lock($1)', [DRAFT_LOCK]);
    await c.query('delete from run_events');
    await c.query(`
      update league_members
         set practice_best = 0, official_started_at = null, official_completed_at = null,
             official_score = null, selection_priority = null,
             selected_draft_slot = null, selected_at = null
    `);
    await c.query(`
      update league_settings
         set rankings_frozen_at = null,
             reveal_released = false,
             -- Without these two the league stays stuck in selection forever,
             -- because a completion stamp is what opens selection early.
             all_runs_complete_at = null,
             completion_notified_at = null,
             official_open_override = null,
             selection_open_override = null
       where id = 1
    `);
  });
}
