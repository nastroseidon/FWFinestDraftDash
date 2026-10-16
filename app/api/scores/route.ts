import { fail, json, parseScore, readJson } from '@/lib/api';
import { cleanInitials } from '@/lib/board';
import { addScore, topScores } from '@/lib/scores';

/** The world's top 20. Public, and the same for everyone. */
export async function GET() {
  return json({ scores: await topScores() });
}

/**
 * Posts one run to the board. Scores are reported by the browser, so this can
 * only bound them to something a run could plausibly produce — see
 * MAX_PLAUSIBLE_SCORE. The board is for bragging, not for adjudicating.
 */
export async function POST(req: Request) {
  const body = await readJson(req);

  const initials = cleanInitials(body.initials);
  if (!initials) return fail('Use up to 3 letters, numbers, spaces or periods.');

  const score = parseScore(body.score);
  if (score === null) return fail('That score is not a number this game can produce.');

  return json({ scores: await addScore(initials, score) });
}
