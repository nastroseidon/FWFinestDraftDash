/**
 * Integration tests for the open-window schedule.
 *
 * The rules worth proving: official runs are available now, practice has a
 * deadline that official runs do not share, and selection opens the moment the
 * last manager finishes rather than waiting for a wall clock.
 *
 * Run with: npm run test:schedule   (dev server must be up on BASE)
 */
import { pool, query } from '../lib/db';
import { loadPins } from './pins';
import { MEMBERS, players } from './roster';

const BASE = process.env.TEST_BASE ?? 'http://localhost:3000';
const PINS = loadPins();
const ROSTER = players();

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

class Client {
  private cookie = '';
  async signIn(name: string, pin: string) {
    await this.send('/api/login', 'POST', { name, pin });
    return this;
  }
  get(p: string) {
    return this.send(p, 'GET');
  }
  post(p: string, b: unknown = {}) {
    return this.send(p, 'POST', b);
  }
  private async send(path: string, method: string, body?: unknown) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const c = res.headers.get('set-cookie');
    if (c) this.cookie = c.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }
}

async function resetAll() {
  await query('delete from run_events');
  await query(`
    update league_members
       set practice_best = 0, official_started_at = null, official_completed_at = null,
           official_score = null, selection_priority = null,
           selected_draft_slot = null, selected_at = null
  `);
  await query(`
    update league_settings
       set rankings_frozen_at = null, all_runs_complete_at = null,
           completion_notified_at = null, reveal_released = false,
           official_open_override = null, selection_open_override = null
     where id = 1
  `);
}

/** Moves practice_close_at relative to now, to test either side of it. */
async function setPracticeCloses(offsetMinutes: number) {
  await query(
    `update league_settings set practice_close_at = now() + ($1 || ' minutes')::interval where id = 1`,
    [String(offsetMinutes)],
  );
}

async function restoreSchedule() {
  await query(`
    update league_settings
       set practice_close_at = timestamptz '2026-09-07 00:00:00 America/Indiana/Indianapolis'
     where id = 1
  `);
}

async function main() {
  console.log(`Testing ${BASE}\n`);
  const names = ROSTER.map((m) => m.name);

  console.log('Official runs are open right now');
  {
    await resetAll();
    await restoreSchedule();
    const c = await new Client().signIn(names[0], PINS[names[0]]);
    const s = await c.get('/api/session');

    check('phase is official', s.body.league?.phase === 'official', s.body.league?.phase);
    check('an official run is offered', s.body.league?.officialAvailable === true);
    check('practice is open too', s.body.league?.practiceOpen === true);

    const start = await c.post('/api/official/start');
    check('an official run can begin today', start.status === 200, `got ${start.status}`);

    const done = await c.post('/api/official/complete', { score: 1200 });
    check('the score locks', done.status === 200 && done.body.score === 1200);

    const again = await c.post('/api/official/start');
    check('still only one attempt', again.status === 409);
  }

  console.log('\nPractice has its own deadline');
  {
    await resetAll();
    await setPracticeCloses(60);
    const c = await new Client().signIn(names[1], PINS[names[1]]);

    let s = await c.get('/api/session');
    check('practice is open before the deadline', s.body.league?.practiceOpen === true);
    const ok = await c.post('/api/practice', { score: 400 });
    check('a practice score is accepted', ok.status === 200, `got ${ok.status}`);

    await setPracticeCloses(-1);
    s = await c.get('/api/session');
    check('practice closes on schedule', s.body.league?.practiceOpen === false);

    const refused = await c.post('/api/practice', { score: 900 });
    check('a practice score is refused after the deadline', refused.status === 409,
      `got ${refused.status}`);
    check('the refusal explains itself', /only the official run/i.test(refused.body.error ?? ''));

    const best = await query<{ practice_best: number }>(
      'select practice_best from league_members where display_name = $1',
      [names[1]],
    );
    check('the late score was not recorded', best[0].practice_best === 400, `${best[0].practice_best}`);

    // Official runs must be unaffected by the practice deadline.
    const start = await c.post('/api/official/start');
    check('official runs still work after practice closes', start.status === 200,
      `got ${start.status}`);
    await c.post('/api/official/complete', { score: 800 });
    await restoreSchedule();
  }

  console.log('\nSelection opens the moment the last run lands');
  {
    await resetAll();
    await restoreSchedule();

    // Everyone but the last manager finishes.
    for (let i = 0; i < names.length - 1; i += 1) {
      const c = await new Client().signIn(names[i], PINS[names[i]]);
      await c.post('/api/official/start');
      await c.post('/api/official/complete', { score: 5000 - i * 100 });
    }

    const waiting = await new Client().signIn(names[0], PINS[names[0]]);
    let s = await waiting.get('/api/session');
    check('phase is still official with one run outstanding',
      s.body.league?.phase === 'official', s.body.league?.phase);
    check('all-runs-complete is not set yet', s.body.league?.allRunsComplete === false);

    const draftEarly = await waiting.get('/api/draft/status');
    check('no board while a run is outstanding', draftEarly.body.board === null);

    // The last manager finishes.
    const lastName = names[names.length - 1];
    const last = await new Client().signIn(lastName, PINS[lastName]);
    await last.post('/api/official/start');
    const final = await last.post('/api/official/complete', { score: 100 });
    check('the last run reports that it completed the set',
      final.body.allRunsComplete === true, JSON.stringify(final.body));

    s = await waiting.get('/api/session');
    check('phase flips to selection immediately',
      s.body.league?.phase === 'selection', s.body.league?.phase);
    check('all-runs-complete is now set', s.body.league?.allRunsComplete === true);

    const stamped = await query<{ n: string }>(
      'select count(*)::text as n from league_settings where all_runs_complete_at is not null',
    );
    check('the completion moment is recorded', stamped[0].n === '1');

    // And the draft can actually start.
    const top = await new Client().signIn(names[0], PINS[names[0]]);
    const status = await top.get('/api/draft/status');
    check('the highest score is on the clock', status.body.onTheClock === true);
    check('they get a board', Array.isArray(status.body.board));
  }

  console.log('\nThe completion stamp is set exactly once');
  {
    const before = await query<{ at: string }>(
      'select all_runs_complete_at::text as at from league_settings',
    );
    // Another completion attempt must not move the stamp.
    const c = await new Client().signIn(names[0], PINS[names[0]]);
    await c.post('/api/official/complete', { score: 999 });
    const after = await query<{ at: string }>(
      'select all_runs_complete_at::text as at from league_settings',
    );
    check('the stamp does not move', before[0].at === after[0].at);
  }

  console.log('\nPractice is closed once selection starts');
  {
    const c = await new Client().signIn(names[2], PINS[names[2]]);
    const s = await c.get('/api/session');
    check(
      'practice is still governed by its own deadline, not the phase',
      typeof s.body.league?.practiceOpen === 'boolean',
    );
  }

  await resetAll();
  await restoreSchedule();

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
  await pool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
