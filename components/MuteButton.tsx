'use client';

import { useState } from 'react';
import { sfx } from '@/game/audio';

/** Audio is optional, so this is a convenience rather than a gameplay control. */
export default function MuteButton() {
  const [muted, setMuted] = useState(() => {
    if (typeof window === 'undefined') return false;
    sfx.loadPreference();
    return sfx.isMuted();
  });

  return (
    <button
      className="muteBtn"
      aria-label={muted ? 'Unmute' : 'Mute'}
      onClick={() => {
        const next = !muted;
        sfx.setMuted(next);
        setMuted(next);
        if (!next) {
          sfx.unlock();
          sfx.confirm();
        }
      }}
    >
      {muted ? 'SOUND OFF' : 'SOUND ON'}
    </button>
  );
}
