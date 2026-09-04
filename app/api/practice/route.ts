import { currentMember, fail, json, parseScore, readJson } from '@/lib/api';
import { recordPracticeRun } from '@/lib/members';
import { loadSettings, practiceOpen } from '@/lib/phase';

/** Practice is unlimited and carries no consequences, until its deadline. */
export async function POST(req: Request) {
  const member = await currentMember();
  if (!member) return fail('Sign in first.', 401);

  const settings = await loadSettings();
  if (!practiceOpen(settings)) {
    return fail('Practice is closed. Only the official run remains.', 409);
  }

  const score = parseScore((await readJson(req)).score);
  if (score === null) return fail('Invalid score.');

  const practiceBest = await recordPracticeRun(member.id, score);
  return json({ ok: true, score, practiceBest });
}
