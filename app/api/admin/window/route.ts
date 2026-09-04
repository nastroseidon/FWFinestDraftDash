import { fail, json, readJson } from '@/lib/api';
import { setWindowOverride } from '@/lib/admin';
import { requireAdmin } from '@/lib/adminGuard';

/** `value` of null means "follow the schedule". */
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const body = await readJson(req);
  const which = body.which;
  const value = body.value;

  if (which !== 'official' && which !== 'selection') {
    return fail('which must be "official" or "selection".');
  }
  if (value !== true && value !== false && value !== null) {
    return fail('value must be true, false, or null.');
  }

  await setWindowOverride(which, value);
  return json({ ok: true });
}
