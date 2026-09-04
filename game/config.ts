/**
 * Gameplay tuning. These values define the course, so changing them changes
 * every score. Treat them as frozen once official runs open.
 */

/** Fixed logical resolution. Phaser scales it to fit the device viewport, so
 *  every player gets an identical field regardless of phone size. */
export const GAME_WIDTH = 450;
export const GAME_HEIGHT = 800;

/** Lane centres as a fraction of width. Exactly two lanes, always. */
export const LANE_X = [GAME_WIDTH * 0.3, GAME_WIDTH * 0.7] as const;

/** Runner sits in the lower quarter of the screen. */
export const PLAYER_Y = GAME_HEIGHT * 0.74;

/** Field pixels per yard. Yardage is derived from scrolled distance. */
export const PIXELS_PER_YARD = 22;

/** Scroll speed in px/s: starts here, ramps toward the cap. */
export const SPEED_START = 300;
export const SPEED_MAX = 760;
/** Yards of progress needed to reach SPEED_MAX. */
export const SPEED_RAMP_YARDS = 4000;

/** Vertical gap between defender waves, in px. Shrinks with difficulty. */
export const SPAWN_GAP_START = 620;
export const SPAWN_GAP_MIN = 420;
/** Yards of progress needed to reach SPAWN_GAP_MIN. */
export const SPAWN_RAMP_YARDS = 3000;

/** Half-height of the tackle window around the runner, in px. */
export const COLLISION_BAND = 30;

/** Lane-change tween duration in ms. Lane ownership changes instantly on tap. */
export const LANE_SWITCH_MS = 90;

/** Default course seeds. The official seed is overridden server-side later. */
export const PRACTICE_SEED = 20260907;

/**
 * Minimum vertical separation between defenders in opposite lanes, in px.
 * Every defender falls at exactly the field speed, so separation enforced at
 * spawn time holds for the rest of the run.
 *
 * It has to clear the collision band (so a safe lane exists at all) by enough
 * margin that a human can actually get there: at SPEED_MAX this is a 0.39s
 * reaction window. Keep it below SPAWN_GAP_MIN, or waves shove each other
 * up the field faster than it scrolls and defenders pile up off-screen.
 */
export const OPPOSITE_LANE_SEPARATION = 300;

/** Vertical offset between the two defenders of a stacked wave, in px. */
export const STACK_OFFSET_MIN = 50;
export const STACK_OFFSET_MAX = 90;

export type DefenderKind = {
  key: string;
  /** Jersey colour. */
  color: number;
  helmet: number;
  /** Which pixel grid to draw. Linemen are broader through the shoulders. */
  build: 'standard' | 'lineman';
  /** Sprite pixel size. Purely cosmetic. */
  scale: number;
  /** Visual flourish only; never affects the lane rule or speed. */
  motion: 'run' | 'dive' | 'spin' | 'hurdle' | 'lunge';
};

/**
 * Visual variety only. Every defender obeys the same lane rule and falls at the
 * same speed. Keep this list the same length and order once official runs open:
 * the course seed indexes into it, so reordering changes everyone's course.
 */
export const DEFENDER_KINDS: readonly DefenderKind[] = [
  { key: 'lb', color: 0xe0453a, helmet: 0xb8241a, build: 'standard', scale: 5, motion: 'run' },
  { key: 'db', color: 0xf2a03d, helmet: 0xc9761d, build: 'standard', scale: 4.5, motion: 'lunge' },
  { key: 'line', color: 0x9b3fd4, helmet: 0x6f21a0, build: 'lineman', scale: 5.8, motion: 'run' },
  { key: 'safety', color: 0x2fbf6f, helmet: 0x1c8a4c, build: 'standard', scale: 4.8, motion: 'dive' },
  { key: 'edge', color: 0x3f8fe0, helmet: 0x1f63ac, build: 'standard', scale: 5, motion: 'spin' },
  { key: 'nickel', color: 0xe05fa8, helmet: 0xb0347b, build: 'standard', scale: 4.8, motion: 'hurdle' },
];
