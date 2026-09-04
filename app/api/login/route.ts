import { verifyAccessCode } from '@/lib/auth';
import { fail, json, readJson } from '@/lib/api';
import { findMemberByName } from '@/lib/members';
import { setSession } from '@/lib/session';

export async function POST(req: Request) {
  const body = await readJson(req);
  const name = typeof body.name === 'string' ? body.name : '';
  const pin = typeof body.pin === 'string' ? body.pin : '';

  if (!name.trim() || !pin.trim()) {
    return fail('Enter your manager name and PIN.');
  }

  const member = await findMemberByName(name);
  // Same message either way, so the form cannot be used to enumerate managers.
  const ok = member ? await verifyAccessCode(pin, member.access_code_hash) : false;
  if (!member || !ok) {
    return fail('That name and PIN do not match.', 401);
  }

  await setSession(member.id);
  return json({ ok: true });
}
