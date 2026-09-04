import { currentMember, fail, json, readJson } from '@/lib/api';
import { claimSlot, draftStatus } from '@/lib/draft';

const MESSAGES: Record<string, string> = {
  not_open: 'Draft selection is not open.',
  not_your_turn: 'You are not on the clock.',
  already_chosen: 'You have already made your selection. It cannot be changed.',
  bad_slot: 'That is not a draft position.',
  taken: 'Gone. Somebody was faster than you, which is the whole theme here.',
};

export async function POST(req: Request) {
  const member = await currentMember();
  if (!member) return fail('Sign in first.', 401);

  const body = await readJson(req);
  const slot = typeof body.slot === 'number' ? body.slot : NaN;

  const result = await claimSlot(member.id, slot);
  if (!result.ok) {
    // Hand back a fresh board so a stale page corrects itself immediately.
    return json(
      { ok: false, error: MESSAGES[result.reason], status: await draftStatus(member.id) },
      result.reason === 'taken' ? 409 : 400,
    );
  }

  return json({ ok: true, slot: result.slot });
}
