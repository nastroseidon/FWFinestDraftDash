'use client';

export type Phase = 'pre' | 'official' | 'ranking' | 'selection' | 'complete';

export type SessionState =
  | { signedIn: false }
  | {
      signedIn: true;
      member: {
        id: string;
        displayName: string;
        teamName: string | null;
        isAdmin: boolean;
        practiceBest: number;
        officialStarted: boolean;
        officialCompleted: boolean;
        officialScore: number | null;
        selectedDraftSlot: number | null;
      };
      league: {
        name: string;
        timezone: string;
        phase: Phase;
        officialAvailable: boolean;
        officialSeed: number;
        msUntilOfficialOpen: number | null;
        officialOpenAt: string;
        officialCloseAt: string;
        selectionOpenAt: string;
        serverNow: string;
      };
    };

async function call<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Something went wrong.');
  return data as T;
}

export const api = {
  session: () => call<SessionState>('/api/session'),
  login: (name: string, pin: string) => call<{ ok: true }>('/api/login', { name, pin }),
  logout: () => call<{ ok: true }>('/api/logout', {}),
  practice: (score: number) =>
    call<{ score: number; practiceBest: number }>('/api/practice', { score }),
  startOfficial: () => call<{ seed: number }>('/api/official/start', {}),
  completeOfficial: (score: number) =>
    call<{ score: number; alreadyLocked: boolean }>('/api/official/complete', { score }),
};

/** Human countdown, e.g. "2d 04:31:07". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const clock = [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
  return days > 0 ? `${days}d ${clock}` : clock;
}
