'use client';

export type Phase = 'official' | 'ranking' | 'selection' | 'complete';

export type DraftStatus = {
  phase: Phase;
  officialScore: number | null;
  selectedSlot: number | null;
  onTheClock: boolean;
  board: { slot: number; available: boolean }[] | null;
  leagueSize: number;
  selectionComplete: boolean;
};

export type AdminMember = {
  id: string;
  display_name: string;
  team_name: string | null;
  is_admin: boolean;
  practice_best: number;
  official_started_at: string | null;
  official_completed_at: string | null;
  official_score: number | null;
  selection_priority: number | null;
  selected_draft_slot: number | null;
  abandoned: boolean;
  never_ran: boolean;
};

export type AdminOverview = {
  league: {
    name: string;
    timezone: string;
    phase: Phase;
    leagueSize: number;
    serverNow: string;
    officialOpenAt: string;
    officialCloseAt: string;
    selectionOpenAt: string;
    selectionCloseAt: string;
    officialOpenOverride: boolean | null;
    selectionOpenOverride: boolean | null;
    rankingsFrozen: boolean;
    revealReleased: boolean;
  };
  members: AdminMember[];
  onTheClock: { id: string; display_name: string } | null;
  counts: { completed: number; abandoned: number; neverRan: number; slotsTaken: number };
  takenSlots: number[];
};

export type RevealRow = {
  slot: number;
  manager: string;
  team: string | null;
  score: number;
  rank: number;
  completed: boolean;
};

export type RevealState =
  | { released: false }
  | { released: true; leagueName: string; order: RevealRow[] };

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
        practiceOpen: boolean;
        officialSeed: number;
        msUntilPracticeCloses: number | null;
        msUntilOfficialCloses: number | null;
        practiceCloseAt: string;
        officialCloseAt: string;
        allRunsComplete: boolean;
        revealAvailable: boolean;
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
  draftStatus: () => call<DraftStatus>('/api/draft/status'),
  claimSlot: (slot: number) => call<{ ok: true; slot: number }>('/api/draft/claim', { slot }),
  reveal: () => call<RevealState>('/api/reveal'),

  admin: {
    overview: () => call<AdminOverview>('/api/admin/overview'),
    setWindow: (which: 'official' | 'selection', value: boolean | null) =>
      call<{ ok: true }>('/api/admin/window', { which, value }),
    resetAttempt: (memberId: string) =>
      call<{ ok: true }>('/api/admin/reset-attempt', { memberId }),
    assignSlot: (memberId: string, slot: number) =>
      call<{ ok: true }>('/api/admin/assign-slot', { memberId, slot }),
    setReveal: (released: boolean) => call<{ ok: true }>('/api/admin/reveal', { released }),
    resetLeague: () => call<{ ok: true }>('/api/admin/reset-league', { confirm: 'RESET' }),
  },
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
