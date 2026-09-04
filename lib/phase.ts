import { query } from './db';

export type Phase =
  | 'official'   // official runs may be taken
  | 'ranking'    // runs closed, selection not yet open
  | 'selection'  // draft-position selection window
  | 'complete';  // selection window has closed

export type LeagueSettings = {
  league_name: string;
  timezone: string;
  official_open_at: Date;
  official_close_at: Date;
  /** After this, practice is gone and only the official run remains. */
  practice_close_at: Date;
  selection_open_at: Date;
  selection_close_at: Date;
  /** Set when the last official run lands. Lets selection open early. */
  all_runs_complete_at: Date | null;
  completion_notified_at: Date | null;
  rankings_frozen_at: Date | null;
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

  // Selection is checked first. Once every manager has a locked score there is
  // nothing left to wait for, so it can open well before its scheduled time.
  const selectionOpen =
    s.selection_open_override ??
    ((s.all_runs_complete_at !== null || now >= s.selection_open_at.getTime()) &&
      now < s.selection_close_at.getTime());

  if (selectionOpen) return 'selection';

  const officialOpen =
    s.official_open_override ??
    (now >= s.official_open_at.getTime() && now < s.official_close_at.getTime());

  if (officialOpen) return 'official';

  if (now >= s.selection_close_at.getTime()) return 'complete';
  return 'ranking';
}

/** Practice has its own deadline, independent of the phase. */
export function practiceOpen(s: LeagueSettings): boolean {
  return s.server_now.getTime() < s.practice_close_at.getTime();
}

/** Milliseconds until practice closes, or null once it has. */
export function msUntilPracticeCloses(s: LeagueSettings): number | null {
  const delta = s.practice_close_at.getTime() - s.server_now.getTime();
  return delta > 0 ? delta : null;
}

/** Milliseconds until official runs must be finished. */
export function msUntilOfficialCloses(s: LeagueSettings): number | null {
  const delta = s.official_close_at.getTime() - s.server_now.getTime();
  return delta > 0 ? delta : null;
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
