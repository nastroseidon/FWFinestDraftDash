import { findMemberById, Member } from './members';
import { sessionMemberId } from './session';

export function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    // Every one of these responses is per-player and time-sensitive.
    headers: { 'cache-control': 'no-store' },
  });
}

export function fail(message: string, status = 400) {
  return json({ error: message }, status);
}

/** The signed-in member, or null. Identity comes only from the signed cookie. */
export async function currentMember(): Promise<Member | null> {
  const id = await sessionMemberId();
  return id ? findMemberById(id) : null;
}

/** Scores are client-reported, so bound them to something a run could produce. */
export const MAX_PLAUSIBLE_SCORE = 1_000_000;

export function parseScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 0 || value > MAX_PLAUSIBLE_SCORE) return null;
  return value;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
