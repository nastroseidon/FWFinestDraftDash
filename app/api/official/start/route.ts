import { currentMember, fail, json } from '@/lib/api';
import { startOfficialRun } from '@/lib/members';
import { loadSettings, phaseFor } from '@/lib/phase';

/**
 * Claims the one official attempt. The attempt is spent the moment this
 * succeeds, so closing the tab or pulling the plug does not buy a retry.
 */
export async function POST() {
  const member = await currentMember();
  if (!member) return fail('Sign in first.', 401);

  const settings = await loadSettings();
  if (phaseFor(settings) !== 'official') {
    return fail('The official run window is not open.', 409);
  }

  const result = await startOfficialRun(member.id);
  if (!result.ok) {
    return fail(
      result.reason === 'already_completed'
        ? 'Your official run is already in the books. There are no appeals.'
        : 'Your official attempt has already started. There are no restarts.',
      409,
    );
  }

  return json({ ok: true, seed: Number(settings.official_seed) });
}
