import { fail, json, readJson } from '@/lib/api';
import { resetLeagueState } from '@/lib/admin';
import { requireAdmin } from '@/lib/adminGuard';

/**
 * Wipes all play state. The roster and access codes survive.
 * Requires an explicit confirmation string, because there is no undo.
 */
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  if ((await readJson(req)).confirm !== 'RESET') {
    return fail('Send confirm: "RESET" to wipe all scores and selections.');
  }

  await resetLeagueState();
  return json({ ok: true });
}
