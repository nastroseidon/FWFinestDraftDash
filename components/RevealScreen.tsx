'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type RevealRow, type RevealState } from '@/lib/client';
import { sfx } from '@/game/audio';

/** Milliseconds between positions during the animated reveal. */
const BEAT = 2200;

export default function RevealScreen({ onMenu }: { onMenu: () => void }) {
  const [state, setState] = useState<RevealState | null>(null);
  const [revealedFrom, setRevealedFrom] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const next = await api.reveal();
        if (!stop) setState(next);
      } catch {
        if (!stop) setState({ released: false });
      }
    };
    void load();
    // Keeps a waiting player's page live until the commissioner opens it.
    const id = setInterval(load, 10000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  const stopPlayback = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  if (!state) {
    return (
      <Shell>
        <p className="meta">LOADING...</p>
      </Shell>
    );
  }

  if (!state.released) {
    return (
      <Shell>
        <h1 className="headline">NOT YET</h1>
        <p className="warnBody">The draft order is sealed until every pick is in.</p>
        <p className="meta">This page updates on its own.</p>
        <button className="btn secondary" onClick={onMenu}>
          MAIN MENU
        </button>
      </Shell>
    );
  }

  const order = state.order;
  const last = order[order.length - 1]?.slot ?? 0;

  // Positions are revealed from the bottom up, so number one lands last.
  const play = () => {
    setPlaying(true);
    setRevealedFrom(last + 1);

    const step = (slot: number) => {
      if (slot < 1) {
        stopPlayback();
        sfx.revealLand();
        return;
      }
      setRevealedFrom(slot);
      if (slot === 1) sfx.revealLand();
      else sfx.milestone();
      timer.current = setTimeout(() => step(slot - 1), BEAT);
    };

    sfx.unlock();
    timer.current = setTimeout(() => step(last), 600);
  };

  const showAll = () => {
    stopPlayback();
    setRevealedFrom(1);
  };

  const visible = (row: RevealRow) => revealedFrom !== null && row.slot >= revealedFrom;

  return (
    <Shell wide>
      <p className="brand">{state.leagueName.toUpperCase()}</p>
      <h1 className="revealTitle">
        2026 OFFICIAL
        <br />
        DRAFT ORDER
      </h1>

      {revealedFrom === null ? (
        <>
          <p className="warnBody">Every pick is in. Positions revealed last to first.</p>
          <button className="btn" onClick={play}>
            START THE REVEAL
          </button>
          <button className="btn secondary" onClick={showAll}>
            SKIP TO THE BOARD
          </button>
        </>
      ) : null}

      <ol className="revealList">
        {order.map((row) => (
          <li
            key={row.slot}
            className={visible(row) ? 'revealRow in' : 'revealRow'}
            aria-hidden={!visible(row)}
          >
            <span className="revealSlot">{row.slot}</span>
            <span className="revealWho">
              <strong>{row.manager.toUpperCase()}</strong>
              {row.team ? <em>{row.team}</em> : null}
            </span>
            <span className="revealScore">
              {row.score.toLocaleString('en-US')}
              <em>
                {row.completed ? `dash rank ${row.rank}` : 'no official run'}
              </em>
            </span>
          </li>
        ))}
      </ol>

      {revealedFrom !== null ? (
        <>
          {playing ? (
            <button className="btn secondary" onClick={showAll}>
              SKIP AHEAD
            </button>
          ) : null}
          <button className="btn secondary" onClick={onMenu}>
            MAIN MENU
          </button>
        </>
      ) : null}
    </Shell>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="app scrollable">
      <div className={wide ? 'panel wide' : 'panel'}>{children}</div>
    </main>
  );
}
