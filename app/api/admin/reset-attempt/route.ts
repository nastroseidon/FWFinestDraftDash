import { fail, json, readJson } from '@/lib/api';
import { resetOfficialAttempt } from '@/lib/admin';
import { requireAdmin } from '@/lib/adminGuard';

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const memberId = (await readJson(req)).memberId;
  if (typeof memberId !== 'string') return fail('memberId is required.');

  const result = await resetOfficialAttempt(memberId);
  if (!result.ok) {
    return fail(
      result.reason === 'slots_taken'
        ? 'Draft slots have already been claimed. Resetting a run now would reorder a selection already in progress.'
        : 'No such manager.',
      409,
    );
  }
  return json({ ok: true });
}
