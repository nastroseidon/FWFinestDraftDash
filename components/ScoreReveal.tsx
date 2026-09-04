'use client';

import { useEffect, useState } from 'react';

/** Rapidly counts up to the final yardage before landing on the exact number. */
export default function ScoreReveal({ yards }: { yards: number }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const duration = 1200;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // Ease out so the number slams to a stop rather than drifting.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.floor(eased * yards));
      if (t < 1) frame = requestAnimationFrame(tick);
      else setShown(yards);
    };

    frame = requestAnimationFrame(tick);
    // rAF is throttled when the tab is backgrounded, which would leave the
    // number stranded mid-count. Guarantee it lands on the real score.
    const settle = setTimeout(() => setShown(yards), duration + 100);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [yards]);

  return <div className="scoreNumber">{shown.toLocaleString('en-US')}</div>;
}
