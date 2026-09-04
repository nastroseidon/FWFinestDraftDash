'use client';

import { useEffect, useState } from 'react';

/** Portrait-only game. Landscape gets a blocking rotate prompt. */
export default function OrientationGuard() {
  const [landscape, setLandscape] = useState(false);

  useEffect(() => {
    const check = () =>
      setLandscape(window.innerWidth > window.innerHeight && window.innerHeight < 560);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  if (!landscape) return null;

  return (
    <div className="rotateOverlay">
      <div className="rotateIcon" />
      <h2>ROTATE YOUR PHONE</h2>
      <p>
        DRAFT DASH RUNS IN PORTRAIT.
        <br />
        TURN IT BACK.
      </p>
    </div>
  );
}
