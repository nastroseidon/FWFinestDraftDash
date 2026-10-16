'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import MuteButton from '@/components/MuteButton';
import ResultScreen from '@/components/ResultScreen';
import { sfx } from '@/game/audio';

// Phaser is browser-only.
const GameCanvas = dynamic(() => import('@/components/GameCanvas'), { ssr: false });

const BEST_KEY = 'fwfdd.arcadeBest';

type Screen = 'menu' | 'play' | 'result';

/**
 * The open arcade. No sign-in, no server: anyone can run the course as many
 * times as they like. The league's one-attempt draft app lives at /league.
 */
export default function Home() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [yards, setYards] = useState(0);
  const [best, setBest] = useState(0);
  const [seed, setSeed] = useState(0);
  const [runId, setRunId] = useState(0);

  // The best is this browser's alone; there is no public scoreboard to game.
  useEffect(() => {
    try {
      setBest(Number(window.localStorage.getItem(BEST_KEY)) || 0);
    } catch {
      /* private browsing; the run still works, the best just will not stick */
    }
  }, []);

  const start = useCallback(() => {
    sfx.loadPreference();
    sfx.unlock();
    // A fresh course every run, so nobody can memorize one layout.
    setSeed(Math.floor(Math.random() * 2_000_000_000) + 1);
    setRunId((n) => n + 1);
    setScreen('play');
  }, []);

  const handleRunOver = useCallback((finalYards: number) => {
    setYards(finalYards);
    setBest((prev) => {
      if (finalYards <= prev) return prev;
      try {
        window.localStorage.setItem(BEST_KEY, String(finalYards));
      } catch {
        /* nothing to do; the score still shows for this session */
      }
      return finalYards;
    });
    setScreen('result');
  }, []);

  if (screen === 'play') {
    return (
      <div className="gameWrap">
        <GameCanvas key={runId} seed={seed} onRunOver={handleRunOver} />
      </div>
    );
  }

  if (screen === 'result') {
    return (
      <>
        <ResultScreen
          yards={yards}
          official={false}
          practiceBest={best}
          onAgain={start}
          onMenu={() => setScreen('menu')}
        />
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

          <p className="meta">
            TAP TO SWITCH LANES.
            <br />
            DO NOT GET TACKLED.
          </p>

          <p className="meta">
            YOUR BEST — {best.toLocaleString('en-US')} YARDS
          </p>

          <a className="linkBtn" href="/league">
            LEAGUE SIGN IN
          </a>
        </div>
      </main>
      <MuteButton />
    </>
  );
}
