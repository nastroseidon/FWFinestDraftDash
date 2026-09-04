'use client';

import ScoreReveal from '@/components/ScoreReveal';

type Props = {
  yards: number;
  official: boolean;
  practiceBest?: number;
  onAgain?: () => void;
  onMenu: () => void;
};

export default function ResultScreen({
  yards,
  official,
  practiceBest,
  onAgain,
  onMenu,
}: Props) {
  const beatenBest =
    !official && practiceBest !== undefined && yards > 0 && yards >= practiceBest;

  return (
    <main className="app">
      <div className="panel">
        <h1 className="headline">{official ? 'OFFICIAL RUN COMPLETE' : 'RUN OVER'}</h1>
        <p className="label">FINAL DISTANCE</p>
        <ScoreReveal yards={yards} />
        <p className="unit">YARDS</p>

        {official ? (
          <>
            <p className="locked">SCORE LOCKED</p>
            <p className="meta">
              THERE ARE NO APPEALS.
              <br />
              Draft-position selection begins at 5:00 PM.
            </p>
          </>
        ) : (
          <p className="meta">
            {beatenBest
              ? 'NEW PERSONAL BEST'
              : `PERSONAL BEST — ${(practiceBest ?? 0).toLocaleString('en-US')}`}
          </p>
        )}

        {onAgain ? (
          <button className="btn" onClick={onAgain}>
            RUN IT BACK
          </button>
        ) : null}
        <button className="btn secondary" onClick={onMenu}>
          MAIN MENU
        </button>
      </div>
    </main>
  );
}
