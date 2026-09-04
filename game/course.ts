import { Rng } from './rng';
import {
  COLLISION_BAND,
  DEFENDER_KINDS,
  DefenderKind,
  GAME_HEIGHT,
  OPPOSITE_LANE_SEPARATION,
  PIXELS_PER_YARD,
  PLAYER_Y,
  SPAWN_GAP_MIN,
  SPAWN_GAP_START,
  SPAWN_RAMP_YARDS,
  STACK_OFFSET_MAX,
  STACK_OFFSET_MIN,
  SPEED_MAX,
  SPEED_RAMP_YARDS,
  SPEED_START,
} from './config';

export type Lane = 0 | 1;

export type CourseDefender = {
  id: number;
  lane: Lane;
  y: number;
  kind: DefenderKind;
};

/**
 * Wave shapes. Both occupy a single lane, so the other lane is always free.
 * Variety and pressure come from which lane is chosen and how close together
 * the waves arrive, not from ever blocking both lanes.
 */
type WaveShape = 'single' | 'stack';

/**
 * The entire game simulation, with no rendering and no Phaser dependency.
 * Given a seed and a sequence of (delta, tap) inputs it is fully deterministic,
 * which is what makes official runs identical for every player and lets the
 * course be replayed or verified outside the browser.
 */
export class Course {
  readonly seed: number;
  private rng: Rng;
  private nextId = 0;

  lane: Lane = 0;
  /** Total field pixels scrolled. Yardage is derived from this. */
  distancePx = 0;
  defenders: CourseDefender[] = [];
  tackled = false;

  private nextSpawnAtPx: number;

  constructor(seed: number) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.nextSpawnAtPx = SPAWN_GAP_START;
  }

  /** Exact yardage survived. Never shown while a run is in progress. */
  get yards(): number {
    return Math.floor(this.distancePx / PIXELS_PER_YARD);
  }

  /** Field scroll speed in px/s. Ramps up with distance. */
  get speed(): number {
    const t = Math.min(this.yards / SPEED_RAMP_YARDS, 1);
    return SPEED_START + (SPEED_MAX - SPEED_START) * t;
  }

  /** Distance between defender waves in px. Shrinks with distance. */
  get spawnGap(): number {
    const t = Math.min(this.yards / SPAWN_RAMP_YARDS, 1);
    return SPAWN_GAP_START + (SPAWN_GAP_MIN - SPAWN_GAP_START) * t;
  }

  /** The one and only control. */
  toggleLane() {
    if (this.tackled) return;
    this.lane = this.lane === 0 ? 1 : 0;
  }

  /** Advance the simulation. `dt` is in seconds. */
  step(dt: number): void {
    if (this.tackled) return;

    const move = this.speed * dt;
    this.distancePx += move;

    if (this.distancePx >= this.nextSpawnAtPx) {
      this.spawnWave();
      this.nextSpawnAtPx = this.distancePx + this.spawnGap;
    }

    // All defenders fall at exactly the field speed. Holding one speed is what
    // preserves the safe-lane separation established at spawn time.
    for (let i = this.defenders.length - 1; i >= 0; i -= 1) {
      const d = this.defenders[i];
      d.y += move;

      if (d.lane === this.lane && Math.abs(d.y - PLAYER_Y) <= COLLISION_BAND) {
        this.tackled = true;
        return;
      }

      if (d.y > GAME_HEIGHT + 90) this.defenders.splice(i, 1);
    }
  }

  private spawnWave() {
    const lane: Lane = this.rng.next() < 0.5 ? 0 : 1;
    const shapes: WaveShape[] = ['single', 'single', 'stack'];
    // Stacks unlock only once the player has some distance behind them.
    const shape: WaveShape = this.yards < 250 ? 'single' : this.rng.pick(shapes);

    this.addDefender(lane, -70);
    if (shape === 'stack') {
      // A second defender in the same lane: a taller wall, other lane still free.
      this.addDefender(lane, -70 - this.rng.int(STACK_OFFSET_MIN, STACK_OFFSET_MAX));
    }
  }

  private addDefender(lane: Lane, requestedY: number) {
    // Wave scheduling already keeps opposite lanes apart; this is a belt-and-
    // braces guard so no future tuning can produce an unreachable safe lane.
    let y = requestedY;
    const otherLane: Lane = lane === 0 ? 1 : 0;
    let moved = true;
    while (moved) {
      moved = false;
      for (const existing of this.defenders) {
        if (existing.lane !== otherLane) continue;
        if (Math.abs(existing.y - y) < OPPOSITE_LANE_SEPARATION) {
          y = existing.y - OPPOSITE_LANE_SEPARATION;
          moved = true;
        }
      }
    }

    this.defenders.push({
      id: this.nextId++,
      lane,
      y,
      kind: this.rng.pick(DEFENDER_KINDS),
    });
  }
}
