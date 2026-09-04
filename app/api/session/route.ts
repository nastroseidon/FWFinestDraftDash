import { currentMember, json } from '@/lib/api';
import { loadSettings, msUntilOfficialOpen, phaseFor } from '@/lib/phase';

/**
 * Everything a player is allowed to know about themselves and the clock.
 * Deliberately says nothing about anyone else: no ranks, no scores, no counts.
 */
export async function GET() {
  const member = await currentMember();
  if (!member) return json({ signedIn: false });

  const settings = await loadSettings();
  const phase = phaseFor(settings);

  const officialAvailable =
    phase === 'official' && !member.official_started_at && !member.official_completed_at;

  return json({
    signedIn: true,
    member: {
      id: member.id,
      displayName: member.display_name,
      teamName: member.team_name,
      isAdmin: member.is_admin,
      practiceBest: member.practice_best,
      officialStarted: !!member.official_started_at,
      officialCompleted: !!member.official_completed_at,
      // Only ever their own score, and only once it is locked.
      officialScore: member.official_completed_at ? member.official_score : null,
      selectedDraftSlot: member.selected_draft_slot,
    },
    league: {
      name: settings.league_name,
      timezone: settings.timezone,
      phase,
      officialAvailable,
      officialSeed: Number(settings.official_seed),
      msUntilOfficialOpen: msUntilOfficialOpen(settings),
      officialOpenAt: settings.official_open_at,
      officialCloseAt: settings.official_close_at,
      selectionOpenAt: settings.selection_open_at,
      serverNow: settings.server_now,
    },
  });
}
