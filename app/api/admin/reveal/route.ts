import { fail, json, readJson } from '@/lib/api';
import { releaseReveal } from '@/lib/admin';
import { requireAdmin } from '@/lib/adminGuard';

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const released = (await readJson(req)).released;
  if (typeof released !== 'boolean') return fail('released must be true or false.');

  const result = await releaseReveal(released);
  if (!result.ok) {
    return fail('Every draft position must be taken before the reveal.', 409);
  }
  return json({ ok: true });
}
