import { currentMember, fail, json } from '@/lib/api';
import { revealState } from '@/lib/reveal';

/** The final draft order. Returns nothing until the commissioner releases it. */
export async function GET() {
  const member = await currentMember();
  if (!member) return fail('Sign in first.', 401);
  return json(await revealState());
}
