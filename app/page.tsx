'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import LoginScreen from '@/components/LoginScreen';
import MainMenu from '@/components/MainMenu';
import MuteButton from '@/components/MuteButton';
import OfficialWarning from '@/components/OfficialWarning';
import DraftScreen from '@/components/DraftScreen';
import ResultScreen from '@/components/ResultScreen';
import { api, type SessionState } from '@/lib/client';
import { sfx } from '@/game/audio';
import { PRACTICE_SEED } from '@/game/config';

// Phaser is browser-only.
const GameCanvas = dynamic(() => import('@/components/GameCanvas'), { ssr: false });

type Screen =
  | 'loading'
  | 'login'
  | 'menu'
  | 'practice'
  | 'practiceResult'
  | 'officialWarning'
  | 'official'
  | 'officialResult'
  | 'draft';

export default function Home() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [session, setSession] = useState<SessionState | null>(null);
  const [yards, setYards] = useState(0);
  const [officialSeed, setOfficialSeed] = useState<number | null>(null);
  const [runId, setRunId] = useState(0);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const next = await api.session();
    setSession(next);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const next = await refresh();
        if (!cancelled) setScreen(next.signedIn ? 'menu' : 'login');
      } catch {
        if (!cancelled) setScreen('login');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const startPractice = useCallback(() => {
    sfx.loadPreference();
    sfx.unlock();
    setRunId((n) => n + 1);
    setScreen('practice');
  }, []);

  const handlePracticeOver = useCallback(
    async (finalYards: number) => {
      setYards(finalYards);
      setScreen('practiceResult');
      // Persisting the best is not worth blocking the reveal on.
      try {
        await api.practice(finalYards);
        await refresh();
      } catch {
        /* the score still shows; the personal best will catch up next load */
      }
    },
    [refresh],
  );

  const beginOfficial = useCallback(async () => {
    // The attempt is claimed server-side before a single frame is drawn.
    const { seed } = await api.startOfficial();
    sfx.loadPreference();
    sfx.unlock();
    setOfficialSeed(seed);
    setRunId((n) => n + 1);
    setScreen('official');
  }, []);

  const handleOfficialOver = useCallback(
    async (finalYards: number) => {
      try {
        const result = await api.completeOfficial(finalYards);
        setYards(result.score);
      } catch (err) {
        setYards(finalYards);
        setError(err instanceof Error ? err.message : 'Could not save your score.');
      }
      setScreen('officialResult');
      refresh().catch(() => {});
    },
    [refresh],
  );

  if (screen === 'loading') {
    return (
      <main className="app">
        <div className="panel">
          <p className="brand">FORT WAYNE FINEST</p>
          <h1 className="title">
            DRAFT
            <br />
            DASH
          </h1>
          <p className="meta">WARMING UP...</p>
        </div>
      </main>
    );
  }

  if (screen === 'login' || !session?.signedIn) {
    return (
      <LoginScreen
        onSignedIn={async () => {
          const next = await refresh();
          setScreen(next.signedIn ? 'menu' : 'login');
        }}
      />
    );
  }

  if (screen === 'practice') {
    return (
      <div className="gameWrap">
        <GameCanvas key={runId} seed={PRACTICE_SEED} onRunOver={handlePracticeOver} />
      </div>
    );
  }

  if (screen === 'official') {
    return (
      <div className="gameWrap">
        <GameCanvas
          key={runId}
          seed={officialSeed ?? session.league.officialSeed}
          onRunOver={handleOfficialOver}
        />
      </div>
    );
  }

  if (screen === 'practiceResult') {
    return (
      <>
        <ResultScreen
          yards={yards}
          official={false}
          practiceBest={session.member.practiceBest}
          onAgain={startPractice}
          onMenu={() => setScreen('menu')}
        />
        <MuteButton />
      </>
    );
  }

  if (screen === 'officialWarning') {
    return (
      <>
        <OfficialWarning onBegin={beginOfficial} onCancel={() => setScreen('menu')} />
        <MuteButton />
      </>
    );
  }

  if (screen === 'draft') {
    return (
      <>
        <DraftScreen onMenu={() => { void refresh(); setScreen('menu'); }} />
        <MuteButton />
      </>
    );
  }

  if (screen === 'officialResult') {
    return (
      <>
        <ResultScreen yards={yards} official onMenu={() => setScreen('menu')} />
        {error ? <p className="floatingError">{error}</p> : null}
        <MuteButton />
      </>
    );
  }

  return (
    <>
      <MainMenu
        session={session}
        onPractice={startPractice}
        onOfficial={() => setScreen('officialWarning')}
        onDraft={() => setScreen('draft')}
        onSignOut={async () => {
          await api.logout();
          setSession({ signedIn: false });
          setScreen('login');
        }}
      />
      <MuteButton />
    </>
  );
}
