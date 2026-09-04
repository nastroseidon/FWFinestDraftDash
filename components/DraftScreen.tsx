'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type DraftStatus } from '@/lib/client';
import { randomTakenMessage } from '@/lib/snark';
import { sfx } from '@/game/audio';

/** How often a waiting player checks whether they are on the clock. */
const POLL_MS = 5000;

export default function DraftScreen({ onMenu }: { onMenu: () => void }) {
  const [status, setStatus] = useState<DraftStatus | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [snark, setSnark] = useState('');
  const [busy, setBusy] = useState(false);
  const wasOnTheClock = useRef(false);

  const refresh = useCallback(async () => {
    const next = await api.draftStatus();
    setStatus(next);
    // A small fanfare the moment it becomes their turn.
    if (next.onTheClock && !wasOnTheClock.current) sfx.milestone();
    wasOnTheClock.current = next.onTheClock;
    return next;
  }, []);

  useEffect(() => {
    let stop = false;

    const poll = async () => {
      if (stop) return;
      try {
        await refresh();
      } catch {
        /* a dropped poll is harmless; the next one catches up */
      }
    };

    const id = setInterval(poll, POLL_MS);
    void poll();

    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [refresh]);

  if (!status) {
    return (
      <Shell>
        <p className="meta">CHECKING THE BOARD...</p>
      </Shell>
    );
  }

  // Already picked, or the whole thing is done.
  if (status.selectedSlot !== null) {
    return (
      <Shell>
        <p className="label">YOUR 2026 FORT WAYNE FINEST</p>
        <p className="label">DRAFT POSITION</p>
        <div className="slotBig">{status.selectedSlot}</div>
        <p className="locked">LOCKED IN</p>
        <p className="meta">
          {status.selectionComplete
            ? 'Every pick is in. The full draft order is on the main menu.'
            : 'Your selection has been recorded.'}
        </p>
        <button className="btn secondary" onClick={onMenu}>
          MAIN MENU
        </button>
      </Shell>
    );
  }

  // Selection has not opened yet.
  if (status.phase === 'official' || status.phase === 'ranking') {
    return (
      <Shell>
        <h1 className="headline">DRAFT STATUS</h1>
        {status.officialScore !== null ? (
          <p className="meta">
            YOUR OFFICIAL DISTANCE
            <br />
            <span className="countdown">
              {status.officialScore.toLocaleString('en-US')} YARDS
            </span>
            <br />
            SCORE LOCKED
          </p>
        ) : (
          <p className="meta">You have not completed your official run.</p>
        )}
        <p className="meta">
          {status.phase === 'ranking'
            ? 'Official runs are closed. Selection begins shortly.'
            : 'Selection begins once every manager has completed their official run.'}
        </p>
        <button className="btn secondary" onClick={onMenu}>
          MAIN MENU
        </button>
      </Shell>
    );
  }

  // Never ran, so there is no turn coming. Say so plainly.
  if (!status.onTheClock && status.officialScore === null) {
    return (
      <Shell>
        <h1 className="headline">NO OFFICIAL RUN</h1>
        <p className="warnBody">You did not complete an official run.</p>
        <p className="warnBody">
          You do not get to choose. Whatever positions are left over will be dealt
          out at random once everybody else has picked.
        </p>
        <p className="warnBody muted">Should have run.</p>
        <button className="btn secondary" onClick={onMenu}>
          MAIN MENU
        </button>
      </Shell>
    );
  }

  // Waiting for their turn. Deliberately says nothing about anyone else.
  if (!status.onTheClock) {
    return (
      <Shell>
        <h1 className="headline">NOT YOUR TURN</h1>
        <p className="warnBody">Your official score is locked.</p>
        <p className="warnBody">Draft-position selection is underway.</p>
        <p className="warnBody muted">You will get access when you are on the clock.</p>
        <p className="meta">This page updates on its own. Leave it open.</p>
        <button className="btn secondary" onClick={onMenu}>
          MAIN MENU
        </button>
      </Shell>
    );
  }

  // Confirmation step.
  if (pending !== null) {
    return (
      <Shell>
        <p className="label">DRAFT POSITION</p>
        <div className="slotBig">{pending}</div>
        <p className="warnBody">Once confirmed, this selection cannot be changed.</p>
        <button
          className="btn danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.claimSlot(pending);
              sfx.confirm();
              setPending(null);
              await refresh();
            } catch (err) {
              // Somebody took it between loading the board and confirming.
              setSnark(err instanceof Error ? err.message : randomTakenMessage());
              setPending(null);
              await refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'LOCKING IN...' : `CONFIRM #${pending}`}
        </button>
        <button className="btn secondary" disabled={busy} onClick={() => setPending(null)}>
          GO BACK
        </button>
      </Shell>
    );
  }

  // Snarky interstitial after tapping a taken slot.
  if (snark) {
    return (
      <Shell>
        <h1 className="headline">NOPE</h1>
        <p className="snark">{snark}</p>
        <button className="btn" onClick={() => setSnark('')}>
          BACK TO THE BOARD
        </button>
      </Shell>
    );
  }

  return (
    <Shell wide>
      <h1 className="headline">YOU ARE ON THE CLOCK</h1>
      <p className="meta">Choose your 2026 Fort Wayne Finest draft position.</p>
      <div className="slotGrid">
        {status.board?.map(({ slot, available }) => (
          <button
            key={slot}
            className={available ? 'slot' : 'slot unavailable'}
            onClick={() => {
              if (available) {
                sfx.laneSwitch();
                setPending(slot);
              } else {
                // Unavailable slots still respond, purely for entertainment.
                sfx.collision();
                setSnark(randomTakenMessage());
              }
            }}
          >
            {slot}
          </button>
        ))}
      </div>
    </Shell>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="app">
      <div className={wide ? 'panel wide' : 'panel'}>{children}</div>
    </main>
  );
}
