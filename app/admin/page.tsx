'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, type AdminMember, type AdminOverview } from '@/lib/client';

/**
 * Commissioner dashboard. Everything here is admin-only data, and the server
 * enforces that: a normal manager gets a 404 from every endpoint below.
 */
export default function AdminPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setData(await api.admin.overview());
      setError('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load.';
      if (message === 'Not found.' || message === 'Sign in first.') setDenied(true);
      else setError(message);
    }
  }, []);

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      if (!stop) await refresh();
    };
    void poll();
    // Fast enough to watch the draft unfold without hammering the database.
    const id = setInterval(poll, 5000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [refresh]);

  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError('');
      try {
        await fn();
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That did not work.');
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  if (denied) {
    return (
      <main className="adminWrap">
        <h1 className="adminTitle">NOT FOUND</h1>
        <p className="adminNote">
          Sign in as the commissioner at <Link href="/">the main app</Link> first.
        </p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="adminWrap">
        <p className="adminNote">{error || 'Loading...'}</p>
      </main>
    );
  }

  const { league, members, counts, onTheClock } = data;
  const zone = (iso: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: league.timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));

  return (
    <main className="adminWrap">
      <h1 className="adminTitle">COMMISSIONER</h1>
      <p className="adminNote">
        {league.name} · {league.timezone.split('/').pop()} · server time{' '}
        {zone(league.serverNow)}
      </p>

      {error ? <p className="adminError">{error}</p> : null}

      <section className="adminCard">
        <h2>PHASE</h2>
        <p className="adminBig">{league.phase.toUpperCase()}</p>
        <dl className="adminGrid">
          <dt>Official opens</dt>
          <dd>{zone(league.officialOpenAt)}</dd>
          <dt>Official closes</dt>
          <dd>{zone(league.officialCloseAt)}</dd>
          <dt>Selection opens</dt>
          <dd>{zone(league.selectionOpenAt)}</dd>
          <dt>Selection closes</dt>
          <dd>{zone(league.selectionCloseAt)}</dd>
          <dt>Rankings</dt>
          <dd>{league.rankingsFrozen ? 'FROZEN' : 'not yet frozen'}</dd>
          <dt>On the clock</dt>
          <dd>{onTheClock ? onTheClock.display_name : '—'}</dd>
        </dl>
      </section>

      <section className="adminCard">
        <h2>WINDOWS</h2>
        <p className="adminNote">
          Override forces a window open or shut. Schedule follows the times above.
        </p>
        {(['official', 'selection'] as const).map((which) => {
          const current =
            which === 'official' ? league.officialOpenOverride : league.selectionOpenOverride;
          return (
            <div className="adminRow" key={which}>
              <span className="adminRowLabel">
                {which.toUpperCase()}
                <em>
                  {current === null ? 'schedule' : current ? 'forced open' : 'forced shut'}
                </em>
              </span>
              <span className="adminBtns">
                <button
                  className={current === true ? 'aBtn on' : 'aBtn'}
                  disabled={busy}
                  onClick={() => act(() => api.admin.setWindow(which, true))}
                >
                  OPEN
                </button>
                <button
                  className={current === false ? 'aBtn on' : 'aBtn'}
                  disabled={busy}
                  onClick={() => act(() => api.admin.setWindow(which, false))}
                >
                  SHUT
                </button>
                <button
                  className={current === null ? 'aBtn on' : 'aBtn'}
                  disabled={busy}
                  onClick={() => act(() => api.admin.setWindow(which, null))}
                >
                  SCHEDULE
                </button>
              </span>
            </div>
          );
        })}
      </section>

      <section className="adminCard">
        <h2>STATUS</h2>
        <dl className="adminGrid">
          <dt>Completed official runs</dt>
          <dd>
            {counts.completed} / {league.leagueSize}
          </dd>
          <dt>Started, never finished</dt>
          <dd className={counts.abandoned ? 'warn' : ''}>{counts.abandoned}</dd>
          <dt>Never ran</dt>
          <dd className={counts.neverRan ? 'warn' : ''}>{counts.neverRan}</dd>
          <dt>Draft positions taken</dt>
          <dd>
            {counts.slotsTaken} / {league.leagueSize}
          </dd>
        </dl>
      </section>

      <section className="adminCard">
        <h2>MANAGERS</h2>
        <div className="adminTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>#</th>
                <th>Manager</th>
                <th>Practice</th>
                <th>Official</th>
                <th>State</th>
                <th>Slot</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <ManagerRow
                  key={m.id}
                  member={m}
                  leagueSize={league.leagueSize}
                  takenSlots={data.takenSlots}
                  busy={busy}
                  onClock={onTheClock?.id === m.id}
                  act={act}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="adminCard">
        <h2>FINAL REVEAL</h2>
        <p className="adminNote">
          {league.revealReleased
            ? 'Released. The league can see the full draft order.'
            : `Sealed. Needs all ${league.leagueSize} positions taken (${counts.slotsTaken} so far).`}
        </p>
        <div className="adminBtns">
          <button
            className="aBtn big"
            disabled={busy || league.revealReleased}
            onClick={() => act(() => api.admin.setReveal(true))}
          >
            RELEASE REVEAL
          </button>
          <button
            className="aBtn"
            disabled={busy || !league.revealReleased}
            onClick={() => act(() => api.admin.setReveal(false))}
          >
            SEAL AGAIN
          </button>
          <a className="aBtn" href="/reveal">
            VIEW
          </a>
        </div>
      </section>

      <section className="adminCard danger">
        <h2>RESET LEAGUE</h2>
        <p className="adminNote">
          Wipes every practice best, official run and draft position. The roster and
          access codes survive. For testing. There is no undo.
        </p>
        <button
          className="aBtn danger"
          disabled={busy}
          onClick={() => {
            if (!window.confirm('Wipe all scores and draft positions? No undo.')) return;
            void act(() => api.admin.resetLeague());
          }}
        >
          WIPE ALL PLAY DATA
        </button>
      </section>

      <p className="adminNote">
        <Link href="/">Back to the game</Link>
      </p>
    </main>
  );
}

function ManagerRow({
  member: m,
  leagueSize,
  takenSlots,
  busy,
  onClock,
  act,
}: {
  member: AdminMember;
  leagueSize: number;
  takenSlots: number[];
  busy: boolean;
  onClock: boolean;
  act: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [slot, setSlot] = useState('');

  const state = m.official_completed_at
    ? 'done'
    : m.abandoned
      ? 'ABANDONED'
      : 'not run';

  return (
    <tr className={onClock ? 'onClock' : ''}>
      <td>{m.selection_priority ?? '—'}</td>
      <td>
        {m.display_name}
        {m.is_admin ? ' *' : ''}
      </td>
      <td>{m.practice_best.toLocaleString('en-US')}</td>
      <td>{m.official_score === null ? '—' : m.official_score.toLocaleString('en-US')}</td>
      <td className={m.abandoned ? 'warn' : ''}>{state}</td>
      <td>{m.selected_draft_slot ?? '—'}</td>
      <td className="adminRowActions">
        {m.selected_draft_slot === null ? (
          <>
            <select value={slot} onChange={(e) => setSlot(e.target.value)} disabled={busy}>
              <option value="">slot</option>
              {Array.from({ length: leagueSize }, (_, i) => i + 1)
                .filter((s) => !takenSlots.includes(s))
                .map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
            </select>
            <button
              className="aBtn tiny"
              disabled={busy || !slot}
              onClick={() => act(() => api.admin.assignSlot(m.id, Number(slot)))}
            >
              ASSIGN
            </button>
          </>
        ) : null}
        {m.official_started_at ? (
          <button
            className="aBtn tiny"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Reset ${m.display_name}'s official run?`)) return;
              void act(() => api.admin.resetAttempt(m.id));
            }}
          >
            RESET RUN
          </button>
        ) : null}
      </td>
    </tr>
  );
}
