import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE = 'fwf_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error('SESSION_SECRET is missing or too short (needs 16+ characters).');
  }
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/**
 * Signed, httpOnly cookie holding just the member id. There is nothing secret
 * in the payload; the signature is what stops a player claiming to be someone
 * else, which is the rule that actually matters here.
 */
export async function setSession(memberId: string) {
  const issued = Date.now().toString(36);
  const payload = `${memberId}.${issued}`;
  const store = await cookies();

  store.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in member id, or null. Never trust anything else for identity. */
export async function sessionMemberId(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;

  const cut = raw.lastIndexOf('.');
  if (cut < 0) return null;

  const payload = raw.slice(0, cut);
  const provided = Buffer.from(raw.slice(cut + 1));
  const expected = Buffer.from(sign(payload));

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }
  return payload.split('.')[0] ?? null;
}
