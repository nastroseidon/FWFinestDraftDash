# Draft Dash: Progress

Fort Wayne Finest: Draft Dash. Status as of 4 September 2026.

Repository: https://github.com/nastroseidon/FWFinestDraftDash
Target deadline: 7 September 2026, official runs open at midnight.

## Where things stand

| Phase | Scope | State |
|---|---|---|
| 1 | Core playable game | Done, pushed (`f9591f6`) |
| 2 | Retro arcade polish | Done, pushed (`b9ae3fb`) |
| 3 | Backend, manager access, one official attempt | Done, pushed (`4087dd5`) |
| 4 | Draft position selection | Done (`npm run test:draft`) |
| 5 | Commissioner dashboard and final reveal | Not started |
| 6 | PWA, deploy, production config | Not started |

Everything below Phase 3 works locally against a real Postgres. Nothing is
deployed yet.

## Stack

Next.js 16, TypeScript, Phaser 3.90, Postgres via the `pg` driver, deployed to
Vercel and linked from nicksmith.app.

Postgres is reached with plain SQL rather than a vendor SDK, so the same code
runs against Neon, Vercel Postgres or Supabase. Supabase was the original plan
but was mid outage when the backend was built, so nothing depends on it.

## Phase 1: core playable game

The game itself. Portrait only, one control, infinite field.

* Two lanes. Tap anywhere to switch. No other input exists.
* The runner sits at 74% down the screen and the field scrolls beneath.
* Defenders approach from up field. Same lane at the moment of contact ends
  the run.
* Yardage is tracked internally and never shown while running.
* Difficulty ramps with distance: scroll speed 300 to 760 px/s, spawn gap
  620 down to 420 px.
* Landscape shows a rotate back overlay.

The important structural decision: **all gameplay rules live in
`game/course.ts`, which imports nothing from Phaser.** The Phaser scene only
draws it and forwards taps.

That matters because official runs must be identical for everyone. Given a seed
and a sequence of inputs the course is fully deterministic, and it can be
verified or replayed without a browser.

### Fairness, enforced rather than hoped for

* Every defender falls at exactly the field speed, so separation set at spawn
  time holds for the whole run.
* Each wave occupies one lane only, so the other lane is always free.
* Consecutive waves are at least 300 px apart, which is the reaction window.

`npm run simulate` runs a perfect dodging bot headlessly and asserts a safe lane
always exists and is reachable, opposite lane separation never breaks, the same
seed always produces the same run, and difficulty actually ramps. The bot
survives 10 minutes and 18,583 yards.

Two real bugs were caught this way. Defenders originally moved at different
speeds and could converge to block both lanes, which is unwinnable. And a
technically safe lane 60 px away gives a 0.08 second reaction window at top
speed, which is not reachable by a human.

## Phase 2: retro arcade polish

Presentation only. The simulation was untouched, confirmed by `npm run simulate`
reporting the identical 18,583 yard run afterwards.

* **No art files.** Sprites are character grids in `game/sprites.ts` baked into
  textures at boot: a two frame runner in FWF navy and gold with the ball
  tucked, six defender builds, pixel stars. Turf, sidelines, hash marks and
  parallax crowd are drawn with Graphics.
* **No audio files.** Every sound is synthesised from oscillators and noise
  buffers in `game/audio.ts`: countdown, hike, lane switch, milestone, collision,
  whistle, score reveal. Sound is never required to play, and the toggle
  persists per device.
* Milestone banners at 100 to 500, then every 1,000 to 5,000, then 10,000, then
  every 5,000. They appear below the runner so they can never hide an incoming
  defender, and never pause the game. They show a threshold, never the score.
* Defender flourishes: dive, spin, hurdle, lunge, bob. All cosmetic.
* Tackle gets screen shake, a flash, a loose ball and a POW burst.
* Press Start 2P throughout, with scanlines and a stadium glow.

Audio was verified by instrumenting the Web Audio API and capturing the actual
frequency sequence, not by assuming it worked.

## Phase 3: backend and the one official attempt

Anything a manager could gain by lying about is decided on the server.

**Time.** Phases come from Postgres `now()` compared against `league_settings`,
never the browser clock. Windows are stored as `timestamptz` written with the
IANA zone `America/Indiana/Indianapolis`, so Postgres resolves the offset.
Verified: September resolves to UTC-4, January to UTC-5. No fixed offset is
hardcoded anywhere.

**The single attempt.** `POST /api/official/start` locks the member row and
stamps `official_started_at` inside one transaction. The attempt is spent before
a single frame is drawn, so refreshing, force quitting, or opening a second
device all return 409.

**The score.** `POST /api/official/complete` writes once. A second submission
returns the locked score rather than overwriting it.

**Identity.** The session is an httpOnly cookie signed with HMAC SHA256. The
payload is only a member id; the signature is what stops one manager submitting
as another. Access codes are hashed with scrypt, which ships with Node and needs
no native module.

Managers sign in once per device and stay signed in for 30 days. The cookie is
persistent, so it survives closing the browser, and the signature is stateless,
so it survives a redeploy. Verified: a session created before a server restart
could still start an official run afterwards with no credentials resent. The
only things that end a session are signing out, clearing site data, or changing
`SESSION_SECRET`.

**Privacy.** `GET /api/session` returns only the caller's own row. No ranks, no
other managers, no counts.

### Screens added

Manager login, main menu with a live countdown to the official window, the one
attempt warning, and the locked score result.

### Verification

`npm run test:api` runs 32 integration tests against a real database, including
two simultaneous starts racing for one attempt.

The suite was mutation tested. Three separate mutations were introduced, each
confirmed to break the suite, then reverted:

| Mutation | Tests that failed |
|---|---|
| Removed the restart guard | second start refused, second device, concurrent race |
| Allowed score overwrite | overwrite rejected, locked flag, database holds first score |
| Removed the window check | run refused before window |

The whole flow was also played through the real UI: signed in, watched the live
countdown, ran practice and confirmed the score persisted, opened the window,
ran the official, saw SCORE LOCKED, and confirmed the menu refused a second
attempt.

## Phase 4: draft position selection

Rank order decides who picks when. It does not assign positions: the highest
score chooses any slot it likes, and everyone after picks from what is left.

**Ranking is frozen, not computed on the fly.** Once `selection_priority` is
written it never moves, or a player's turn could shift underneath them
mid-selection. Order is completed runs by score descending, then anyone who did
not complete one. Ties break on a random value stored when the member row was
created, never on finishing time.

A manager who misses the window is assigned a real score of 0 and ranks behind
every completed run, including a completed zero. The two stay distinguishable by
`official_completed_at`, which is how the commissioner dashboard will flag them.

**A player learns nothing about anyone else.** The status endpoint returns their
own score, their own slot, and whether it is their turn. Nothing else. The board
is sent only to the player on the clock, and it carries availability alone: no
names, no ranks, no timestamps, no counts. A waiting player sees only NOT YOUR
TURN.

**Two people can never hold the same slot.** Every claim runs inside one
transaction holding an advisory lock, which checks the window, the turn, and the
slot together. The unique index on `selected_draft_slot` is the backstop if that
reasoning is ever wrong. A stale board that confirms a slot taken moments earlier
is rejected with a snarky message and a refreshed board.

Taken slots stay visible and stay tappable, purely for entertainment, and never
become selectable.

### Verification

`npm run test:draft` runs 50 tests, including a full twelve manager draft from
start to finish where each pick deliberately does not match its rank.

Mutation tested. Five mutations, each confirmed to break the suite before being
reverted: removing turn gating, sending the board to waiting players, dropping
the taken-slot check, recomputing rankings instead of freezing them, and ranking
missed runs alongside completed ones.

The freeze mutation initially passed, which was the useful part. The recompute
was not being ignored, it was crashing on a unique index violation while
priorities swapped places, so the order held for the wrong reason. That is a real
bug for Phase 5, where a commissioner reset means re-ranking. Fixed by clearing
priorities before reassigning, and the test now asserts the request succeeded
rather than only that the order held.

## Project layout

```
app/
  layout.tsx            Root layout, viewport and safe area config
  page.tsx              Screen state machine
  globals.css           All styling
  api/                  login, logout, session, practice, official/start,
                        official/complete
components/             Login, MainMenu, OfficialWarning, ResultScreen,
                        GameCanvas, ScoreReveal, MuteButton, OrientationGuard
game/
  config.ts             Gameplay tuning constants
  course.ts             The whole simulation, no Phaser dependency
  rng.ts                Seeded deterministic PRNG
  sprites.ts            Pixel art grids
  audio.ts              Synthesised arcade sound
  milestones.ts         Milestone thresholds
  scenes/RunScene.ts    Phaser scene, renders a Course
lib/
  db.ts                 Postgres pool and transaction helper
  auth.ts               scrypt PIN hashing
  session.ts            Signed session cookie
  phase.ts              Server authoritative phase and countdown
  members.ts            Member reads and guarded score writes
  api.ts                Route helpers and score validation
  client.ts             Browser side API calls
db/migrations/          SQL migrations
scripts/
  roster.ts             The league roster. Names only, no secrets
  pins.ts               Access code generation, reads db/pins.local.json
  simulate.ts, migrate.ts, seed.ts, prune.ts, test-api.ts
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run simulate` | Headless course verification |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:seed` | Insert league settings and members |
| `npm run db:prune` | List members not in the roster, `-- --yes` to delete |
| `npm run test:api` | 37 integration tests, dev server must be running |
| `npm run test:draft` | 50 draft selection tests, dev server must be running |
| `npm test` | Both suites |

## Known limitations

**Scores are reported by the client.** The guards stop a manager getting a
second attempt or editing a locked score, but someone with dev tools could
submit a number they did not earn. `game/course.ts` is deliberately Phaser free
and deterministic so a submitted input trace could be replayed on the server to
verify it. Not built. Say so if the league wants it.

**Abandoned official runs.** A run that starts and never finishes currently
stays incomplete. The rule from the spec, score 0 after the deadline and flagged
for the commissioner, belongs with the Phase 5 ranking work.

**Backgrounding pauses the run.** Phaser stops when the tab is hidden. Harmless
in practice but worth closing before official runs.

**Team names are not used, by decision.** Managers are identified by first name
throughout. The team field is nullable and every screen renders correctly
without one, which is verified. The final reveal in Phase 5 will show names
alone.

**The roster is live.** Twelve managers, with Nicholas as both commissioner and
player. Access codes are generated into `db/pins.local.json`, which is gitignored
because this repository is public.

## What is still open

Two things are blocked on account access and are described step by step in
[SETUP_TASKS.md](SETUP_TASKS.md):

1. Provision a hosted Postgres and connect it to Vercel.
2. Push the access codes to production and hand them out.

Neither blocks Phase 4, which can be built and tested against the local
database.
