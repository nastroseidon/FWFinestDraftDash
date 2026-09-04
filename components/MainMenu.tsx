'use client';

import { useEffect, useState } from 'react';
import { formatCountdown, type SessionState } from '@/lib/client';

type Props = {
  session: Extract<SessionState, { signedIn: true }>;
  onPractice: () => void;
  onOfficial: () => void;
  onSignOut: () => void;
};

export default function MainMenu({ session, onPractice, onOfficial, onSignOut }: Props) {
  const { member, league } = session;
  const countdown = useCountdown(league.msUntilOfficialOpen);

  const officialLabel = (() => {
    if (member.officialCompleted) return 'SCORE LOCKED';
    if (league.phase === 'pre') return 'OFFICIAL RUN LOCKED';
    if (league.phase === 'official') {
      return member.officialStarted ? 'ATTEMPT SPENT' : 'OFFICIAL RUN';
    }
    return 'OFFICIAL RUNS CLOSED';
  })();

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

        <button className="btn" onClick={onPractice}>
          PRACTICE
        </button>
        <button
          className={league.officialAvailable ? 'btn danger' : 'btn secondary'}
          disabled={!league.officialAvailable}
          onClick={onOfficial}
        >
          {officialLabel}
        </button>

        {league.phase === 'pre' && countdown !== null ? (
          <p className="meta">
            OFFICIAL RUNS OPEN IN
            <br />
            <span className="countdown">{formatCountdown(countdown)}</span>
          </p>
        ) : null}

        {member.officialCompleted ? (
          <p className="meta">
            YOUR OFFICIAL DISTANCE
            <br />
            <span className="countdown">
              {(member.officialScore ?? 0).toLocaleString('en-US')} YARDS
            </span>
          </p>
        ) : null}

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

/** Ticks locally from the server's value, so no clock skew leaks in. */
function useCountdown(initialMs: number | null): number | null {
  const [ms, setMs] = useState(initialMs);

  useEffect(() => {
    if (initialMs === null) return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      setMs(Math.max(0, initialMs - (Date.now() - startedAt)));
    }, 1000);
    return () => clearInterval(id);
  }, [initialMs]);

  return ms;
}
