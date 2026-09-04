import { currentMember, fail, json } from '@/lib/api';
import { draftStatus } from '@/lib/draft';

/**
 * What one player may know about the draft: their own score, their own slot,
 * and whether it is their turn. The board of available slots is included only
 * when they are on the clock, and even then it carries availability alone.
 */
export async function GET() {
  const member = await currentMember();
  if (!member) return fail('Sign in first.', 401);
  return json(await draftStatus(member.id));
}
