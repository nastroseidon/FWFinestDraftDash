/**
 * Integration tests against a running dev server and a real Postgres.
 * These cover the rules that must not be client-controllable.
 *
 * Run with: npm run test:api   (dev server must be up on BASE)
 */
import { pool, query } from '../lib/db';
import { loadPins } from './pins';
import { MEMBERS, players } from './roster';

// Tests run against whatever roster is configured, so swapping the league does
// not break them.
const PINS = loadPins();
const ROSTER = players();
const P = (i: number) => {
  const m = ROSTER[i];
  if (!m) throw new Error(`Roster has no player at index ${i}. Need at least 5.`);
  const pin = PINS[m.name];
  if (!pin) throw new Error(`No access code for ${m.name}. Run npm run db:seed.`);
  return { name: m.name, pin };
};
const [P1, P2, P3, P4, P5] = [0, 1, 2, 3, 4].map(P);

const ADMIN = (() => {
  const m = MEMBERS.find((x) => x.admin);
  if (!m) throw new Error('Roster has no admin.');
  return { name: m.name, pin: PINS[m.name], plays: m.plays !== false };
})();

const BASE = process.env.TEST_BASE ?? 'http://localhost:3000';

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

/** Minimal cookie jar so each "device" keeps its own session. */
class Client {
  private cookie = '';

  async post(path: string, body: unknown = {}) {
    return this.send(path, 'POST', body);
  }

  async get(path: string) {
    return this.send(path, 'GET');
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

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];

    return { status: res.status, body: await res.json().catch(() => ({})) };
  }
}

async function resetMember(name: string) {
  await query(
    `update league_members
        set practice_best = 0, official_started_at = null,
            official_completed_at = null, official_score = null
      where lower(display_name) = lower($1)`,
    [name],
  );
  await query(
    `delete from run_events where member_id =
       (select id from league_members where lower(display_name) = lower($1))`,
    [name],
  );
}

async function setOfficialWindow(open: boolean | null) {
  await query('update league_settings set official_open_override = $1 where id = 1', [open]);
}

async function main() {
  console.log(`Testing ${BASE}\n`);

  await resetMember(P1.name);
  await resetMember(P2.name);
  await setOfficialWindow(null);

  console.log('Authentication');
  {
    const c = new Client();
    const bad = await c.post('/api/login', { name: P1.name, pin: 'definitely-wrong' });
    check('wrong PIN is rejected', bad.status === 401, `got ${bad.status}`);

    const unknown = await c.post('/api/login', { name: 'Nobody At All', pin: P1.pin });
    check('unknown manager is rejected', unknown.status === 401, `got ${unknown.status}`);
    check(
      'unknown manager and wrong PIN give the same message',
      unknown.body.error === bad.body.error,
    );

    const ok = await c.post('/api/login', { name: P1.name.toLowerCase(), pin: P1.pin });
    check('correct PIN signs in, case-insensitively', ok.status === 200, `got ${ok.status}`);

    const session = await c.get('/api/session');
    check('session reports the right manager', session.body.member?.displayName === P1.name);
    check('session never leaks the PIN hash', !JSON.stringify(session.body).includes('scrypt$'));
  }

  console.log('\nUnauthenticated access');
  {
    const anon = new Client();
    const practice = await anon.post('/api/practice', { score: 500 });
    check('practice needs a session', practice.status === 401, `got ${practice.status}`);

    const start = await anon.post('/api/official/start');
    check('official start needs a session', start.status === 401, `got ${start.status}`);

    const complete = await anon.post('/api/official/complete', { score: 9999 });
    check('official complete needs a session', complete.status === 401, `got ${complete.status}`);
  }

  console.log('\nOfficial window is server-controlled');
  {
    const c = new Client();
    await c.post('/api/login', { name: P1.name, pin: P1.pin });

    // Official runs are open from the moment the league goes live, so the
    // interesting case is the commissioner shutting the window.
    await setOfficialWindow(null);
    const open = await c.get('/api/session');
    check('phase is official on the schedule', open.body.league?.phase === 'official',
      open.body.league?.phase);
    check('an official run is offered', open.body.league?.officialAvailable === true);

    await setOfficialWindow(false);
    const shut = await c.post('/api/official/start');
    check('a forced-shut window refuses a run', shut.status === 409, `got ${shut.status}`);

    const shutSession = await c.get('/api/session');
    check('and stops offering one', shutSession.body.league?.officialAvailable === false);

    await setOfficialWindow(null);
  }

  console.log('\nOne attempt, no restarts');
  {
    await setOfficialWindow(true);
    const phone = new Client();
    await phone.post('/api/login', { name: P1.name, pin: P1.pin });

    const first = await phone.post('/api/official/start');
    check('first start succeeds', first.status === 200, `got ${first.status}`);
    check('start returns the official seed', typeof first.body.seed === 'number');

    // Simulates a refresh, a force-quit, or a second tab.
    const again = await phone.post('/api/official/start');
    check('second start is refused', again.status === 409, `got ${again.status}`);

    // A different device with the same login must not get a fresh attempt.
    const laptop = new Client();
    await laptop.post('/api/login', { name: P1.name, pin: P1.pin });
    const otherDevice = await laptop.post('/api/official/start');
    check('a second device gets no fresh attempt', otherDevice.status === 409);

    const done = await phone.post('/api/official/complete', { score: 1438 });
    check('score is recorded', done.status === 200 && done.body.score === 1438);

    const overwrite = await phone.post('/api/official/complete', { score: 999999 });
    check('score cannot be overwritten', overwrite.body.score === 1438, `got ${overwrite.body.score}`);
    check('overwrite attempt is flagged as locked', overwrite.body.alreadyLocked === true);

    const stored = await query<{ official_score: number }>(
      `select official_score from league_members where display_name = $1`,
      [P1.name],
    );
    check('database holds the first score only', stored[0].official_score === 1438);

    const restart = await phone.post('/api/official/start');
    check('cannot start again after completing', restart.status === 409);
  }

  console.log('\nConcurrent starts');
  {
    await resetMember(P2.name);
    const a = new Client();
    const b = new Client();
    await a.post('/api/login', { name: P2.name, pin: P2.pin });
    await b.post('/api/login', { name: P2.name, pin: P2.pin });

    const [r1, r2] = await Promise.all([
      a.post('/api/official/start'),
      b.post('/api/official/start'),
    ]);
    const wins = [r1, r2].filter((r) => r.status === 200).length;
    check('exactly one of two simultaneous starts wins', wins === 1, `wins=${wins}`);
  }

  console.log('\nPlayers cannot touch each other');
  {
    const c = new Client();
    await c.post('/api/login', { name: P1.name, pin: P1.pin });
    const session = await c.get('/api/session');
    const text = JSON.stringify(session.body);
    check('session mentions no other manager', !text.includes(P2.name));
    check('session exposes no rank', !/"rank"/.test(text));
    check('session exposes no leaderboard', !/leaderboard/i.test(text));
  }

  console.log('\nThe commissioner gets no special treatment');
  {
    await setOfficialWindow(true);
    await resetMember(ADMIN.name);

    const c = new Client();
    await c.post('/api/login', { name: ADMIN.name, pin: ADMIN.pin });

    const session = await c.get('/api/session');
    check('admin session reports isAdmin', session.body.member?.isAdmin === true);

    if (ADMIN.plays) {
      const first = await c.post('/api/official/start');
      check('admin can start an official run', first.status === 200, `got ${first.status}`);

      const second = await c.post('/api/official/start');
      check('admin gets no restart either', second.status === 409, `got ${second.status}`);

      await c.post('/api/official/complete', { score: 777 });
      const overwrite = await c.post('/api/official/complete', { score: 999999 });
      check('admin score is locked too', overwrite.body.score === 777, `got ${overwrite.body.score}`);
    }

    // Every member who will draft needs a slot on the board. Derived from the
    // database row count rather than players(), so a bug in players() cannot
    // make this assertion agree with itself.
    const size = await query<{ league_size: number }>(
      'select league_size from league_settings where id = 1',
    );
    const memberCount = await query<{ n: string }>(
      'select count(*)::text as n from league_members',
    );
    const nonPlaying = MEMBERS.filter((m) => m.plays === false).length;
    const expectedSlots = Number(memberCount[0].n) - nonPlaying;
    check(
      'league size gives every drafting member a slot',
      size[0].league_size === expectedSlots,
      `league_size=${size[0].league_size} drafting members=${expectedSlots}`,
    );

    await resetMember(ADMIN.name);
    await setOfficialWindow(null);
  }

  console.log('\nPractice');
  {
    await resetMember(P3.name);
    const c = new Client();
    await c.post('/api/login', { name: P3.name, pin: P3.pin });

    const first = await c.post('/api/practice', { score: 640 });
    check('practice score is recorded', first.body.practiceBest === 640);

    const worse = await c.post('/api/practice', { score: 120 });
    check('a worse practice run does not lower the best', worse.body.practiceBest === 640);

    const better = await c.post('/api/practice', { score: 900 });
    check('a better practice run raises the best', better.body.practiceBest === 900);

    const bad = await c.post('/api/practice', { score: -5 });
    check('negative scores are rejected', bad.status === 400, `got ${bad.status}`);

    const huge = await c.post('/api/practice', { score: 10 ** 9 });
    check('absurd scores are rejected', huge.status === 400, `got ${huge.status}`);

    const fractional = await c.post('/api/practice', { score: 12.5 });
    check('non-integer scores are rejected', fractional.status === 400, `got ${fractional.status}`);
  }

  console.log('\nEvery official run uses the same course');
  {
    await resetMember(P4.name);
    await resetMember(P5.name);
    const seeds: number[] = [];
    for (const { name, pin } of [P4, P5]) {
      const c = new Client();
      await c.post('/api/login', { name, pin });
      const r = await c.post('/api/official/start');
      seeds.push(r.body.seed);
    }
    check('both managers get the same official seed', seeds[0] === seeds[1], seeds.join(' vs '));
  }

  // Leave the league as we found it.
  await setOfficialWindow(null);
  for (const p of [P1, P2, P3, P4, P5, ADMIN]) {
    await resetMember(p.name);
  }

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
