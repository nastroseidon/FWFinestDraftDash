'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import HighScores, { type BoardRow } from '@/components/HighScores';
import MuteButton from '@/components/MuteButton';
import ScoreEntry from '@/components/ScoreEntry';
import ScoreReveal from '@/components/ScoreReveal';
import { sfx } from '@/game/audio';
import { BOARD_SIZE } from '@/lib/board';

// Phaser is browser-only.
const GameCanvas = dynamic(() => import('@/components/GameCanvas'), { ssr: false });

type Screen = 'menu' | 'play' | 'entry' | 'result' | 'board';

async function fetchBoard(): Promise<BoardRow[]> {
  const res = await fetch('/api/scores', { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load the scoreboard.');
  const body = await res.json();
  return body.scores as BoardRow[];
}

/** Open to anyone: no sign-in, one shared scoreboard, unlimited runs. */
export default function Home() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [yards, setYards] = useState(0);
  const [seed, setSeed] = useState(0);
  const [runId, setRunId] = useState(0);
  const [scores, setScores] = useState<BoardRow[] | null>(null);
  const [boardError, setBoardError] = useState('');
  const [mine, setMine] = useState<BoardRow | null>(null);

  const loadBoard = useCallback(async () => {
    setBoardError('');
    try {
      setScores(await fetchBoard());
    } catch (err) {
      setBoardError(err instanceof Error ? err.message : 'Could not load the scoreboard.');
    }
  }, []);

  // The board doubles as the menu's attract screen, so it is fetched up front.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const board = await fetchBoard();
        if (!cancelled) setScores(board);
      } catch {
        if (!cancelled) setBoardError('Could not load the scoreboard.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const start = useCallback(() => {
    sfx.loadPreference();
    sfx.unlock();
    // A fresh course every run, so nobody can memorize one layout.
    setSeed(Math.floor(Math.random() * 2_000_000_000) + 1);
    setRunId((n) => n + 1);
    setMine(null);
    setScreen('play');
  }, []);

  const handleRunOver = useCallback(
    async (finalYards: number) => {
      setYards(finalYards);

      // The board is re-read now rather than trusted from the menu: someone
      // else may have knocked this run out of the top 20 while it was being run.
      let board: BoardRow[] | null = null;
      try {
        board = await fetchBoard();
        setScores(board);
        setBoardError('');
      } catch {
        // Offer the entry screen anyway; the save itself reports any failure.
        setBoardError('');
      }

      const madeIt =
        finalYards > 0 &&
        (board === null ||
          board.length < BOARD_SIZE ||
          finalYards > board[board.length - 1].score);

      setScreen(madeIt ? 'entry' : 'result');
    },
    [],
  );

  const submitScore = useCallback(
    async (initials: string) => {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initials, score: yards }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Could not save your score.');

      setScores(body.scores as BoardRow[]);
      setMine({ initials: initials.toUpperCase().padEnd(3, ' '), score: yards });
      setScreen('result');
    },
    [yards],
  );

  if (screen === 'play') {
    return (
      <div className="gameWrap">
        <GameCanvas key={runId} seed={seed} onRunOver={handleRunOver} />
      </div>
    );
  }

  if (screen === 'entry') {
    return (
      <>
        <ScoreEntry yards={yards} onSubmit={submitScore} onSkip={() => setScreen('result')} />
        <MuteButton />
      </>
    );
  }

  if (screen === 'result') {
    return (
      <>
        <main className="app">
          <div className="panel">
            <h1 className="headline">RUN OVER</h1>
            <p className="label">FINAL DISTANCE</p>
            <ScoreReveal yards={yards} />
            <p className="unit">YARDS</p>

            <p className="label">WORLD TOP {BOARD_SIZE}</p>
            <HighScores scores={scores} error={boardError} highlight={mine} />

            <button className="btn" onClick={start}>
              RUN IT BACK
            </button>
            <button className="btn secondary" onClick={() => setScreen('menu')}>
              MAIN MENU
            </button>
          </div>
        </main>
        <MuteButton />
      </>
    );
  }

  if (screen === 'board') {
    return (
      <>
        <main className="app">
          <div className="panel">
            <h1 className="headline">WORLD TOP {BOARD_SIZE}</h1>
            <HighScores scores={scores} error={boardError} highlight={mine} />
            <button className="btn" onClick={start}>
              PLAY
            </button>
            <button className="btn secondary" onClick={() => setScreen('menu')}>
              MAIN MENU
            </button>
          </div>
        </main>
        <MuteButton />
      </>
    );
  }

  return (
    <>
      <main className="app">
        <div className="panel">
          <p className="brand">FORT WAYNE FINEST</p>
          <h1 className="title">
            DRAFT
            <br />
            DASH
          </h1>

          <button className="btn" onClick={start}>
            PLAY
          </button>
          <button
            className="btn secondary"
            onClick={() => {
              void loadBoard();
              setScreen('board');
            }}
          >
            HIGH SCORES
          </button>

          <p className="meta">
            TAP TO SWITCH LANES.
            <br />
            DO NOT GET TACKLED.
          </p>
        </div>
      </main>
      <MuteButton />
    </>
  );
}
