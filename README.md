# Fort Wayne Finest: Draft Dash

A portrait, mobile-first fantasy-football draft-order game for the Fort Wayne Finest
Fantasy Football League. You run up an infinite field with one control: tap anywhere to
switch lanes. Your score is the exact number of yards you survive, and it is hidden until
the run ends.

**Status: Phase 3 (backend) complete.** Manager sign-in, practice persistence, the official
run window, and one-attempt enforcement all work against Postgres. Draft-position selection
(Phase 4) and the commissioner dashboard (Phase 5) are not built yet.

## Local setup

Requires Node 20 or newer and Docker (for the local database).

```bash
npm install
cp .env.example .env.local
docker run -d --name fwf-pg -e POSTGRES_PASSWORD=draftdash -e POSTGRES_DB=draftdash -p 55432:5432 postgres:17-alpine
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000 on a phone-sized viewport (or a real phone on the same network
via the network URL that `next dev` prints). The seed prints the manager names and PINs;
sign in as any of them, or as `Commissioner` for an admin account.

Set `SESSION_SECRET` in `.env.local` to any long random string:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run simulate` | Headless course verification (see below) |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:seed` | Insert league settings and members (safe to re-run) |
| `npm run test:api` | Integration tests against a running dev server |

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
lib/
  db.ts               Postgres pool and transaction helper
  auth.ts             scrypt PIN hashing
  session.ts          Signed, httpOnly session cookie
  phase.ts            Server-authoritative phase and countdown logic
  members.ts          Member reads and the guarded score writes
  api.ts              Route-handler helpers and score validation
  client.ts           Browser-side API calls and types
db/migrations/        SQL migrations, applied in name order
scripts/
  simulate.ts         Headless verification of course invariants
  migrate.ts          Migration runner
  seed.ts             League settings and members
  test-api.ts         Integration tests for the rules that must hold
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

## What the server decides, and why

Anything a player could gain by lying about lives on the server:

- **Time.** Phases come from Postgres `now()` compared against `league_settings`, never the
  browser clock. Times are stored as `timestamptz` written with the IANA zone
  `America/Indiana/Indianapolis`, so the DST offset is resolved by Postgres rather than
  hardcoded. September resolves to UTC-4 and January to UTC-5, which is the point.
- **The single attempt.** `POST /api/official/start` locks the member row and sets
  `official_started_at` in one transaction. The attempt is spent before a frame is drawn,
  so refreshing, force-quitting, or opening a second device buys nothing.
- **The score.** `POST /api/official/complete` writes once. A second submission returns the
  locked score instead of overwriting it.
- **Identity.** The session is an httpOnly cookie signed with HMAC-SHA256. The payload is
  only a member id; the signature is what stops one manager submitting as another.
- **Privacy.** `GET /api/session` returns only the caller's own row. No ranks, no other
  managers, no counts.

`npm run test:api` covers all of the above, including two simultaneous starts racing for
one attempt. The suite has been mutation-tested: removing the restart guard, the overwrite
guard, or the window check each makes it fail.

## Hidden score

Yardage is tracked internally and never rendered during a run. There are no yard markers,
and the turf bands are deliberately not yard-aligned so they cannot be counted.

## Deployment

Vercel, with a hosted Postgres. Any Postgres works — Neon, Vercel Postgres, or Supabase —
because the app talks plain SQL over `pg` rather than a vendor SDK.

1. Provision a Postgres database and copy its connection string.
2. In Vercel, set `DATABASE_URL` and `SESSION_SECRET` as environment variables.
3. Run `npm run db:migrate` and `npm run db:seed` with `DATABASE_URL` pointed at it.
4. Deploy.

The game is then linked from nicksmith.app alongside the other games.

## Not built yet

Draft-position selection and its turn gating (Phase 4), the commissioner dashboard and
final reveal (Phase 5), and PWA support (Phase 6).

Two things are deliberately deferred rather than forgotten:

- **Scores are reported by the client.** The guards above stop a player from getting a
  second attempt or editing a locked score, but a determined manager with dev tools could
  submit a number they did not earn. `game/course.ts` is Phaser-free and deterministic
  precisely so a submitted input trace could be replayed server-side to verify it, if the
  league wants that.
- **Abandoned official runs.** A run that starts and never finishes currently stays
  incomplete. The spec's rule (score 0 after the deadline, flagged for the commissioner) is
  part of the Phase 5 ranking work.
