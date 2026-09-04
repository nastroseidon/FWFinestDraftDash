/**
 * Headless course verification. Runs the pure simulation with a bot that
 * dodges optimally and asserts the invariants official runs depend on:
 *   - a safe lane always exists
 *   - the run is deterministic for a given seed
 *   - difficulty actually ramps
 *
 * Run with: npm run simulate
 */
import { Course, Lane } from '../game/course';
import {
  COLLISION_BAND,
  OPPOSITE_LANE_SEPARATION,
  PLAYER_Y,
  PRACTICE_SEED,
} from '../game/config';

const STEP = 1 / 60;

type Result = {
  yards: number;
  seconds: number;
  taps: number;
  survived: boolean;
};

/** Distance from the player to the nearest defender ahead in `lane`. */
function clearance(course: Course, lane: Lane): number {
  let min = Infinity;
  for (const d of course.defenders) {
    if (d.lane !== lane) continue;
    const gap = PLAYER_Y - COLLISION_BAND - d.y;
    if (gap >= -COLLISION_BAND * 2) min = Math.min(min, gap);
  }
  return min;
}

function run(seed: number, maxSteps: number, checkInvariants: boolean): Result {
  const course = new Course(seed);
  let steps = 0;
  let taps = 0;

  while (!course.tackled && steps < maxSteps) {
    if (checkInvariants) {
      let blocked0 = false;
      let blocked1 = false;
      for (const d of course.defenders) {
        if (Math.abs(d.y - PLAYER_Y) > COLLISION_BAND) continue;
        if (d.lane === 0) blocked0 = true;
        else blocked1 = true;
      }
      if (blocked0 && blocked1) {
        throw new Error(`No safe lane at ${course.yards} yards (seed ${seed})`);
      }

      for (const a of course.defenders) {
        for (const b of course.defenders) {
          if (a.lane === b.lane) continue;
          if (Math.abs(a.y - b.y) < OPPOSITE_LANE_SEPARATION - 0.5) {
            throw new Error(
              `Opposite-lane separation violated at ${course.yards} yards (seed ${seed})`,
            );
          }
        }
      }
    }

    const mine = clearance(course, course.lane);
    const other = clearance(course, course.lane === 0 ? 1 : 0);
    if (mine < 340 && other > mine + 100) {
      course.toggleLane();
      taps += 1;
    }

    course.step(STEP);
    steps += 1;
  }

  return {
    yards: course.yards,
    seconds: Math.round(steps / 60),
    taps,
    survived: !course.tackled,
  };
}

// 1. Fairness: a perfect dodger must survive 10 minutes on the official course.
const long = run(PRACTICE_SEED, 60 * 600, true);
console.log('perfect-dodge run:', long);
if (!long.survived) {
  throw new Error(`Bot was tackled at ${long.yards} yards; the course is unfair.`);
}

// 2. Determinism: the same seed must produce an identical run.
const a = run(PRACTICE_SEED, 60 * 60, false);
const b = run(PRACTICE_SEED, 60 * 60, false);
if (JSON.stringify(a) !== JSON.stringify(b)) {
  throw new Error('Course is not deterministic for a fixed seed.');
}
console.log('determinism: ok', a);

// 3. Fairness across seeds.
for (const seed of [1, 7, 42, 1234, 99999, 20260907]) {
  const r = run(seed, 60 * 240, true);
  if (!r.survived) throw new Error(`Seed ${seed} unfair: tackled at ${r.yards} yards`);
}
console.log('cross-seed fairness: ok');

// 4. Difficulty ramp.
const course = new Course(PRACTICE_SEED);
const curve: { yards: number; speed: number; gap: number }[] = [];
for (let i = 0; i < 60 * 600; i += 1) {
  course.defenders.length = 0; // ignore collisions; we only want the curve
  course.step(STEP);
  if (i % (60 * 60) === 0) {
    curve.push({
      yards: course.yards,
      speed: Math.round(course.speed),
      gap: Math.round(course.spawnGap),
    });
  }
}
console.table(curve);
if (curve[curve.length - 1].speed <= curve[0].speed) {
  throw new Error('Speed does not increase with distance.');
}
if (curve[curve.length - 1].gap >= curve[0].gap) {
  throw new Error('Spawn gap does not tighten with distance.');
}

console.log('\nAll course invariants hold.');
