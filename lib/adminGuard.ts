import { currentMember } from './api';
import { Member } from './members';

/**
 * Every admin route funnels through here. A normal manager must never see any
 * of this data: it contains every score and rank, which is exactly what the
 * players are kept from seeing.
 *
 * Returns the member on success, or a Response to send back on failure.
 */
export async function requireAdmin(): Promise<
  { ok: true; member: Member } | { ok: false; response: Response }
> {
  const member = await currentMember();
  if (!member) {
    return {
      ok: false,
      response: Response.json({ error: 'Sign in first.' }, { status: 401 }),
    };
  }
  if (!member.is_admin) {
    // Deliberately the same shape as any other refusal. No hint that an admin
    // area exists at all.
    return {
      ok: false,
      response: Response.json({ error: 'Not found.' }, { status: 404 }),
    };
  }
  return { ok: true, member };
}
