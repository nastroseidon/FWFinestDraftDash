import { query } from './db';
import { loadSettings } from './phase';

/**
 * Opens the reveal the moment the last draft position is taken.
 *
 * Called after every write that can fill the final slot, whether a manager
 * claimed it or the commissioner assigned it. Idempotent, so calling it on a
 * draft that is not finished does nothing.
 */
export async function releaseRevealIfComplete(): Promise<boolean> {
  const rows = await query<{ released: boolean }>(`
    update league_settings
       set reveal_released = true
     where id = 1
       and reveal_released = false
       and not exists (
         select 1 from league_members where selected_draft_slot is null
       )
    returning true as released
  `);
  return rows.length > 0;
}

export type RevealRow = {
  slot: number;
  manager: string;
  team: string | null;
  score: number;
  /** Draft Dash finishing rank, 1 being the highest score. */
  rank: number;
  /** False when they never completed an official run. */
  completed: boolean;
};

export type RevealState =
  | { released: false }
  | { released: true; leagueName: string; order: RevealRow[] };

/**
 * The full draft order, but only once the commissioner has released it.
 *
 * Before that this returns nothing at all, which is what keeps scores, ranks
 * and other managers' picks private right up until the reveal.
 */
export async function revealState(): Promise<RevealState> {
  const settings = await loadSettings();
  if (!settings.reveal_released) return { released: false };

  const rows = await query<{
    selected_draft_slot: number;
    display_name: string;
    team_name: string | null;
    official_score: number | null;
    selection_priority: number;
    completed: boolean;
  }>(`
    select selected_draft_slot, display_name, team_name, official_score,
           selection_priority, (official_completed_at is not null) as completed
      from league_members
     where selected_draft_slot is not null
     order by selected_draft_slot asc
  `);

  return {
    released: true,
    leagueName: settings.league_name,
    order: rows.map((r) => ({
      slot: r.selected_draft_slot,
      manager: r.display_name,
      team: r.team_name,
      score: r.official_score ?? 0,
      rank: r.selection_priority,
      completed: r.completed,
    })),
  };
}
