/**
 * Commissioner email, sent once when the last official run lands.
 *
 * Delivery is best effort and deliberately never throws: a mail outage must not
 * be able to fail the request that recorded somebody's official score. If it
 * cannot send, it says so in the server log and the dashboard still shows the
 * truth.
 */

type Result = { sent: boolean; reason?: string };

export async function sendAllRunsCompleteEmail(summary: {
  leagueName: string;
  completed: number;
  total: number;
  adminUrl: string;
}): Promise<Result> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.COMMISSIONER_EMAIL;

  if (!apiKey || !to) {
    return { sent: false, reason: 'RESEND_API_KEY or COMMISSIONER_EMAIL not set' };
  }

  const from = process.env.NOTIFY_FROM ?? 'Draft Dash <onboarding@resend.dev>';

  const text = [
    `All ${summary.total} official runs are complete.`,
    '',
    'Draft position selection can begin. The highest score picks first.',
    '',
    `Dashboard: ${summary.adminUrl}`,
  ].join('\n');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `${summary.leagueName}: all official runs are in`,
        text,
      }),
    });

    if (!res.ok) {
      return { sent: false, reason: `Resend returned ${res.status}: ${await res.text()}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : 'unknown error' };
  }
}
