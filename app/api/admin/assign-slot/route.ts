import { fail, json, readJson } from '@/lib/api';
import { assignDraftSlot } from '@/lib/admin';
import { requireAdmin } from '@/lib/adminGuard';

const MESSAGES: Record<string, string> = {
  taken: 'That draft position is already held.',
  bad_slot: 'That is not a draft position.',
  not_found: 'No such manager.',
  already_has_slot: 'That manager already has a draft position.',
};

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const body = await readJson(req);
  const memberId = body.memberId;
  const slot = body.slot;
  if (typeof memberId !== 'string') return fail('memberId is required.');
  if (typeof slot !== 'number') return fail('slot is required.');

  const result = await assignDraftSlot(memberId, slot);
  if (!result.ok) return fail(MESSAGES[result.reason], 409);
  return json({ ok: true });
}
