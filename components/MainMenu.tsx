'use client';

import { useEffect, useState } from 'react';
import { formatCountdown, type SessionState } from '@/lib/client';

type Props = {
  session: Extract<SessionState, { signedIn: true }>;
  onPractice: () => void;
  onOfficial: () => void;
  onDraft: () => void;
  onReveal: () => void;
  onSignOut: () => void;
};

export default function MainMenu({
  session,
  onPractice,
  onOfficial,
  onDraft,
  onReveal,
  onSignOut,
}: Props) {
  const { member, league } = session;

  // Practice ends before the official deadline, so it is the one to show.
  const practiceLeft = useCountdown(league.msUntilPracticeCloses);
  const officialLeft = useCountdown(league.msUntilOfficialCloses);

  const officialLabel = (() => {
    if (member.officialCompleted) return 'SCORE LOCKED';
    if (member.officialStarted) return 'ATTEMPT SPENT';
    if (league.officialAvailable) return 'OFFICIAL RUN';
    return 'OFFICIAL RUNS CLOSED';
  })();

  const revealReady = league.revealAvailable;

  return (
    <main className="app">
      <div className="panel">
        <p className="brand">FORT WAYNE FINEST</p>
        <h1 className="title">
          DRAFT
          <br />
          DASH
        </h1>

        <p className="who">
          {member.displayName.toUpperCase()}
          {member.teamName ? ` — ${member.teamName.toUpperCase()}` : ''}
        </p>

        <button className="btn" disabled={!league.practiceOpen} onClick={onPractice}>
          {league.practiceOpen ? 'PRACTICE' : 'PRACTICE CLOSED'}
        </button>

        <button
          className={league.officialAvailable ? 'btn danger' : 'btn secondary'}
          disabled={!league.officialAvailable}
          onClick={onOfficial}
        >
          {officialLabel}
        </button>

        <button className="btn secondary" onClick={onDraft}>
          DRAFT STATUS
        </button>

        {revealReady ? (
          <button className="btn danger" onClick={onReveal}>
            DRAFT ORDER
          </button>
        ) : null}

        {member.officialCompleted ? (
          <p className="meta">
            YOUR OFFICIAL DISTANCE
            <br />
            <span className="countdown">
              {(member.officialScore ?? 0).toLocaleString('en-US')} YARDS
            </span>
            <br />
            SCORE LOCKED. NO APPEALS.
          </p>
        ) : (
          <p className="meta">
            {league.practiceOpen && practiceLeft !== null ? (
              <>
                PRACTICE ENDS IN
                <br />
                <span className="countdown">{formatCountdown(practiceLeft)}</span>
                <br />
              </>
            ) : null}
            {officialLeft !== null ? (
              <>
                OFFICIAL RUN DUE IN
                <br />
                <span className="countdown">{formatCountdown(officialLeft)}</span>
              </>
            ) : (
              'OFFICIAL RUNS ARE CLOSED.'
            )}
          </p>
        )}

        <p className="meta">
          PRACTICE BEST — {member.practiceBest.toLocaleString('en-US')} YARDS
        </p>

        <button className="linkBtn" onClick={onSignOut}>
          SIGN OUT
        </button>
      </div>
    </main>
  );
}

/**
 * Ticks locally down from the server's value, so no browser clock skew leaks in.
 * Keyed on the server value, so a fresh session resets the countdown.
 */
function useCountdown(initialMs: number | null): number | null {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (initialMs === null) return;
    const startedAt = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, [initialMs]);

  if (initialMs === null) return null;
  return Math.max(0, initialMs - elapsed);
}
