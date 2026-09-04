'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import ScoreReveal from '@/components/ScoreReveal';
import { PRACTICE_SEED } from '@/game/config';

// Phaser is browser-only.
const GameCanvas = dynamic(() => import('@/components/GameCanvas'), { ssr: false });

type Screen = 'menu' | 'playing' | 'result';

const BEST_KEY = 'fwf-draft-dash-practice-best';

export default function Home() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [yards, setYards] = useState(0);
  const [best, setBest] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const stored = Number(window.localStorage.getItem(BEST_KEY) ?? 0);
    return Number.isFinite(stored) ? stored : 0;
  });
  // Changing the seed forces a fresh Phaser instance for each run.
  const [runId, setRunId] = useState(0);

  const startRun = useCallback(() => {
    setRunId((n) => n + 1);
    setScreen('playing');
  }, []);

  const handleRunOver = useCallback((finalYards: number) => {
    setYards(finalYards);
    setBest((prev) => {
      const next = Math.max(prev, finalYards);
      window.localStorage.setItem(BEST_KEY, String(next));
      return next;
    });
    setScreen('result');
  }, []);

  if (screen === 'playing') {
    return (
      <div className="gameWrap">
        <GameCanvas key={runId} seed={PRACTICE_SEED} onRunOver={handleRunOver} />
      </div>
    );
  }

  if (screen === 'result') {
    return (
      <main className="app">
        <div className="panel">
          <h1 className="headline">RUN OVER</h1>
          <p className="label">FINAL DISTANCE</p>
          <ScoreReveal yards={yards} />
          <p className="unit">YARDS</p>
          <p className="meta">PERSONAL BEST — {best.toLocaleString('en-US')} YARDS</p>
          <button className="btn" onClick={startRun}>
            RUN IT BACK
          </button>
          <button className="btn secondary" onClick={() => setScreen('menu')}>
            MAIN MENU
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <div className="panel">
        <p className="brand">FORT WAYNE FINEST</p>
        <h1 className="title">DRAFT DASH</h1>
        <button className="btn" onClick={startRun}>
          PRACTICE
        </button>
        <button className="btn secondary" disabled>
          OFFICIAL RUN
        </button>
        <p className="tutorial">
          TAP TO SWITCH LANES.
          <br />
          DON&apos;T GET TACKLED.
        </p>
      </div>
    </main>
  );
}
