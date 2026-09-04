import Phaser from 'phaser';

/**
 * Pixel-art sprites are drawn from character grids and baked into textures at
 * boot. Keeps the payload at zero bytes of art while still giving every sprite
 * a hand-placed 8-bit look.
 */

export type Palette = Record<string, number>;

/** '.' is transparent; every other character indexes into the palette. */
export function bakeSprite(
  scene: Phaser.Scene,
  key: string,
  grid: readonly string[],
  palette: Palette,
  scale: number,
) {
  if (scene.textures.exists(key)) return;

  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const ch = row[x];
      if (ch === '.') continue;
      const color = palette[ch];
      if (color === undefined) continue;
      g.fillStyle(color, 1);
      g.fillRect(x * scale, y * scale, scale, scale);
    }
  });

  const width = Math.max(...grid.map((r) => r.length)) * scale;
  g.generateTexture(key, width, grid.length * scale);
  g.destroy();
}

/* -------------------------------------------------------------------------- */
/* Runner: seen from behind, carrying the ball, in Fort Wayne Finest colours.  */
/* -------------------------------------------------------------------------- */

const RUNNER_BASE = [
  '...ggggg...',
  '..ggggggg..',
  '..g.ggg.g..',
  '...wwwww...',
  '..sjjjjjs..',
  '.bbjjjjjs..',
  '.bbjjjjjs..',
  '..sjjjjjs..',
  '...wwwww...',
  '...ww.ww...',
];

export const RUNNER_FRAMES: readonly (readonly string[])[] = [
  [...RUNNER_BASE, '...ww.ww...', '..ww...ww..', '..kk...kk..', '..kk...kk..'],
  [...RUNNER_BASE, '..ww...ww..', '..ww...ww..', '.kk.....kk.', '.kk.....kk.'],
];

export const RUNNER_PALETTE: Palette = {
  g: 0xf2c027, // helmet: FWF gold
  w: 0xf5f1e6, // pants: cream
  j: 0x1b3a8f, // jersey: FWF navy
  s: 0xd8a07a, // arms
  b: 0x8a4a1f, // the football, tucked
  k: 0x14203a, // cleats
};

/* -------------------------------------------------------------------------- */
/* Defenders: facing the runner, so they get a face mask.                      */
/* -------------------------------------------------------------------------- */

const DEFENDER_BASE = [
  '...hhhhh...',
  '..hhhhhhh..',
  '..hmmmmmh..',
  '...wwwww...',
  '..sjjjjjs..',
  '.sjjjjjjjs.',
  '.sjjjjjjjs.',
  '..sjjjjjs..',
  '...wwwww...',
  '...ww.ww...',
];

export const DEFENDER_FRAMES: readonly (readonly string[])[] = [
  [...DEFENDER_BASE, '...ww.ww...', '..ww...ww..', '..kk...kk..', '..kk...kk..'],
  [...DEFENDER_BASE, '..ww...ww..', '..ww...ww..', '.kk.....kk.', '.kk.....kk.'],
];

/** A lineman is the same shape, one pixel wider through the shoulders. */
export const LINEMAN_FRAMES: readonly (readonly string[])[] = DEFENDER_FRAMES.map(
  (frame) =>
    frame.map((row, i) =>
      i >= 4 && i <= 7 ? row.replace(/^\.(.)/, '$1$1').replace(/(.)\.$/, '$1$1') : row,
    ),
);

export function defenderPalette(jersey: number, helmet: number): Palette {
  return {
    h: helmet,
    m: 0xd8d8d8, // face mask
    w: 0xf5f1e6,
    j: jersey,
    s: 0xd8a07a,
    k: 0x14203a,
  };
}

/* -------------------------------------------------------------------------- */
/* Decoration                                                                  */
/* -------------------------------------------------------------------------- */

/** Press Start 2P has no star glyph, so milestones get a drawn one. */
export const STAR_FRAME: readonly string[] = [
  '...s...',
  '..sss..',
  'sssssss',
  '.sssss.',
  '..sss..',
  '.s...s.',
];

export const STAR_PALETTE: Palette = { s: 0xf2c027 };
