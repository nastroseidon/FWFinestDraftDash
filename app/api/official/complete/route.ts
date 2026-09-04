import { currentMember, fail, json, parseScore, readJson } from '@/lib/api';
import { completeOfficialRun } from '@/lib/members';

/** Writes the official score once. After this it is locked. */
export async function POST(req: Request) {
  const member = await currentMember();
  if (!member) return fail('Sign in first.', 401);

  const score = parseScore((await readJson(req)).score);
  if (score === null) return fail('Invalid score.');

  const result = await completeOfficialRun(member.id, score);
  if (!result.ok) {
    if (result.reason === 'already_completed') {
      // Not an error worth shouting about: show them the locked score.
      return json({ ok: true, score: result.score, alreadyLocked: true });
    }
    return fail('You have not started an official run.', 409);
  }

  return json({ ok: true, score: result.score, alreadyLocked: false });
}
