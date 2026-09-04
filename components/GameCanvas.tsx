'use client';

import { useEffect, useRef } from 'react';
import { GAME_HEIGHT, GAME_WIDTH } from '@/game/config';

type Props = {
  seed: number;
  onRunOver: (yards: number) => void;
};

/**
 * Mounts a Phaser game for one run. Phaser is imported dynamically because it
 * touches `window` at module scope and must never run during SSR.
 */
export default function GameCanvas({ seed, onRunOver }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Keep the latest callback without re-creating the game on every render.
  const onRunOverRef = useRef(onRunOver);
  useEffect(() => {
    onRunOverRef.current = onRunOver;
  }, [onRunOver]);

  useEffect(() => {
    let game: import('phaser').Game | undefined;
    let cancelled = false;

    (async () => {
      const [{ default: Phaser }, { RunScene }] = await Promise.all([
        import('phaser'),
        import('@/game/scenes/RunScene'),
      ]);
      if (cancelled || !hostRef.current) return;

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        backgroundColor: '#12331f',
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        input: { activePointers: 1 },
        scene: [RunScene],
      });

      if (process.env.NODE_ENV === 'development') {
        // Dev-only handle for manual/automated poking at the running game.
        (window as unknown as { __ddGame?: unknown }).__ddGame = game;
      }

      game.scene.start('RunScene', {
        seed,
        onRunOver: (yards: number) => onRunOverRef.current(yards),
      });
    })();

    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, [seed]);

  return <div ref={hostRef} className="gameHost" />;
}
