import { query } from './db';

export type Phase =
  | 'pre'        // practice only; official runs have not opened
  | 'official'   // official run window is open
  | 'ranking'    // runs closed, selection not yet open
  | 'selection'  // draft-position selection window
  | 'complete';  // selection window has closed

export type LeagueSettings = {
  league_name: string;
  timezone: string;
  official_open_at: Date;
  official_close_at: Date;
  selection_open_at: Date;
  selection_close_at: Date;
  official_seed: string;
  league_size: number;
  official_open_override: boolean | null;
  selection_open_override: boolean | null;
  reveal_released: boolean;
  /** Postgres `now()`, never the client clock. */
  server_now: Date;
};

export async function loadSettings(): Promise<LeagueSettings> {
  const rows = await query<LeagueSettings>(
    'select *, now() as server_now from league_settings where id = 1',
  );
  if (!rows[0]) throw new Error('league_settings row is missing. Run the seed script.');
  return rows[0];
}

/**
 * Phase is derived from authoritative server time, never from the browser.
 * Commissioner overrides force a window open or closed; null means follow the
 * schedule.
 */
export function phaseFor(s: LeagueSettings): Phase {
  const now = s.server_now.getTime();

  const officialOpen =
    s.official_open_override ??
    (now >= s.official_open_at.getTime() && now < s.official_close_at.getTime());

  if (officialOpen) return 'official';

  const selectionOpen =
    s.selection_open_override ??
    (now >= s.selection_open_at.getTime() && now < s.selection_close_at.getTime());

  if (selectionOpen) return 'selection';

  if (now < s.official_open_at.getTime()) return 'pre';
  if (now < s.selection_open_at.getTime()) return 'ranking';
  if (now < s.selection_close_at.getTime()) return 'selection';
  return 'complete';
}

/** Milliseconds until official runs open, or null if that moment has passed. */
export function msUntilOfficialOpen(s: LeagueSettings): number | null {
  const delta = s.official_open_at.getTime() - s.server_now.getTime();
  return delta > 0 ? delta : null;
}

/** Formats an instant in the league's own timezone. Never a fixed offset. */
export function inLeagueZone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date);
}
