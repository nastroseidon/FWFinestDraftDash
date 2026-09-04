import { json } from '@/lib/api';
import { adminOverview } from '@/lib/admin';
import { requireAdmin } from '@/lib/adminGuard';

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  return json(await adminOverview());
}
