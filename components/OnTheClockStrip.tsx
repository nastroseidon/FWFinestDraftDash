'use client';

import { useEffect, useState } from 'react';
import type { OnTheClockInfo } from '@/lib/client';

/**
 * Who the league is waiting on, and for how long.
 *
 * Public on purpose. The minutes tick up locally from a duration the server
 * sent, rather than from a timestamp, so a phone with a wrong clock still shows
 * the right number.
 */
export default function OnTheClockStrip({
  info,
  mine,
}: {
  info: OnTheClockInfo;
  mine: boolean;
}) {
  // Ticks up locally between server updates. Keyed on the server's own value,
  // so each refresh restarts the local offset rather than compounding it.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => setTick(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, [info.elapsedMs, info.manager]);

  const total = info.elapsedMs + tick;
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);

  return (
    <div className={mine ? 'clockStrip mine' : 'clockStrip'}>
      <span className="clockLabel">ON THE CLOCK</span>
      <span className="clockName">{info.manager.toUpperCase()}</span>
      <span className="clockScore">{info.score.toLocaleString('en-US')} YARDS</span>
      <span className="clockTime">
        {minutes}:{String(seconds).padStart(2, '0')}
      </span>
      <span className="clockNag">
        {mine
          ? 'EVERYONE IS WATCHING THIS NUMBER'
          : minutes >= 5
            ? 'SOMEBODY GO AND POKE THEM'
            : 'ON THE CLOCK'}
      </span>
    </div>
  );
}
