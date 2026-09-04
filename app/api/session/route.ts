import { currentMember, json } from '@/lib/api';
import {
  loadSettings,
  msUntilOfficialCloses,
  msUntilPracticeCloses,
  phaseFor,
  practiceOpen,
} from '@/lib/phase';

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
  const canPractice = practiceOpen(settings);

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
      practiceOpen: canPractice,
      officialSeed: Number(settings.official_seed),
      msUntilPracticeCloses: msUntilPracticeCloses(settings),
      msUntilOfficialCloses: msUntilOfficialCloses(settings),
      practiceCloseAt: settings.practice_close_at,
      officialCloseAt: settings.official_close_at,
      allRunsComplete: settings.all_runs_complete_at !== null,
      revealAvailable: settings.reveal_released,
      serverNow: settings.server_now,
    },
  });
}
