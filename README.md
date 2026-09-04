# Fort Wayne Finest: Draft Dash

A portrait, mobile-first fantasy-football draft-order game for the Fort Wayne Finest
Fantasy Football League. You run up an infinite field with one control: tap anywhere to
switch lanes. Your score is the exact number of yards you survive, and it is hidden until
the run ends.

**Status: Phase 2 (game polish) complete.** Practice mode works end to end with pixel art,
milestone banners, and arcade sound. Official runs, Supabase, draft-position selection, and
the commissioner dashboard are not built yet.

## Local setup

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000 on a phone-sized viewport (or a real phone on the same network
via the network URL that `next dev` prints).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run simulate` | Headless course verification (see below) |

## Project structure

```
app/                  Next.js App Router pages and global styles
  layout.tsx          Root layout, viewport/safe-area config, orientation guard
  page.tsx            Screen state machine: menu -> playing -> result
components/
  GameCanvas.tsx      Mounts Phaser for one run (client-only)
  OrientationGuard.tsx Landscape rotate-back overlay
  ScoreReveal.tsx     Count-up animation for the final yardage
  MuteButton.tsx      Sound on/off, persisted per device
game/
  config.ts           All gameplay tuning constants
  rng.ts              Seeded deterministic PRNG (mulberry32)
  course.ts           The entire simulation, with no Phaser dependency
  sprites.ts          Pixel-art grids, baked into textures at boot
  audio.ts            Web Audio arcade sounds, synthesised (no audio files)
  milestones.ts       Milestone thresholds and banner text
  scenes/RunScene.ts  Phaser scene: renders a Course and forwards taps
scripts/
  simulate.ts         Headless verification of course invariants
```

## Why the simulation is separate from the scene

`game/course.ts` holds every gameplay rule — scrolling, spawning, difficulty, collision,
yardage — and imports nothing from Phaser. `RunScene` only draws it and forwards taps.

That split matters for the official run: given a seed and a sequence of inputs the course
is fully deterministic, so every league member faces an identical defender sequence, spawn
timing, speed progression, and starting lane. It also means the course can be verified (and
later replayed server-side) without a browser.

`npm run simulate` runs a perfect-dodging bot against it and asserts that:

- a safe lane always exists, and is far enough from the tackle band to be reachable
- opposite-lane defenders never come within the minimum separation
- the same seed always produces the same run
- speed increases and the spawn gap tightens with distance

## Fairness rules baked into the course

- Every defender falls at exactly the field scroll speed. Separation established at spawn
  time therefore holds for the whole run.
- Each wave occupies exactly one lane, so the other lane is always free.
- Consecutive waves are at least `OPPOSITE_LANE_SEPARATION` apart, which is the reaction
  window. Changing `SPAWN_GAP_MIN` below that separation will break fairness; `npm run
  simulate` catches it.

## No art or audio files

Every sprite is a character grid in `game/sprites.ts`, baked into a texture at boot.
Every sound is synthesised from oscillators and noise buffers in `game/audio.ts`. The turf,
crowd, and stars are drawn with `Graphics`. Nothing but the Press Start 2P webfont is
fetched, which keeps the payload small and means there is no art to source.

Audio is never required: if the `AudioContext` cannot start, every call is a no-op. The
sound toggle persists per device.

## Hidden score

Yardage is tracked internally and never rendered during a run. There are no yard markers,
and the turf bands are deliberately not yard-aligned so they cannot be counted.

## Configuration

Copy `.env.example` to `.env.local`. Nothing in it is used yet — Phase 1 runs entirely in
the browser. Supabase arrives in Phase 3.

## Not built yet

Official run window and one-attempt enforcement, server-side event timing, manager PIN
access, score persistence, draft-position selection, the commissioner dashboard, and the
final reveal.
