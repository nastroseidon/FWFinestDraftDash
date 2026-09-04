/**
 * Integration tests for the commissioner dashboard and the final reveal.
 *
 * The rules worth proving: no normal manager can reach any of it, and the
 * reveal stays sealed until the commissioner opens it.
 *
 * Run with: npm run test:admin   (dev server must be up on BASE)
 */
import { pool, query } from '../lib/db';
import { loadPins } from './pins';
import { MEMBERS, players } from './roster';

const BASE = process.env.TEST_BASE ?? 'http://localhost:3000';
const PINS = loadPins();
const ROSTER = players();

const ADMIN = (() => {
  const m = MEMBERS.find((x) => x.admin);
  if (!m) throw new Error('Roster has no admin.');
  return { name: m.name, pin: PINS[m.name] };
})();
const PLAYER = (() => {
  const m = ROSTER.find((x) => !x.admin);
  if (!m) throw new Error('Roster has no non-admin player.');
  return { name: m.name, pin: PINS[m.name] };
})();

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
  constructor(readonly name?: string) {}

  async signIn(name: string, pin: string) {
    await this.send('/api/login', 'POST', { name, pin });
    return this;
  }

  get(path: string) {
    return this.send(path, 'GET');
  }

  post(path: string, body: unknown = {}) {
    return this.send(path, 'POST', body);
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

const ADMIN_ROUTES: [string, 'GET' | 'POST', unknown][] = [
  ['/api/admin/overview', 'GET', undefined],
  ['/api/admin/window', 'POST', { which: 'official', value: true }],
  ['/api/admin/reset-attempt', 'POST', { memberId: '00000000-0000-0000-0000-000000000000' }],
  ['/api/admin/assign-slot', 'POST', { memberId: '00000000-0000-0000-0000-000000000000', slot: 1 }],
  ['/api/admin/reveal', 'POST', { released: true }],
  ['/api/admin/reset-league', 'POST', { confirm: 'RESET' }],
];

async function resetAll(admin: Client) {
  await admin.post('/api/admin/reset-league', { confirm: 'RESET' });
}

async function setScores(scores: Record<string, number | null>) {
  for (const [name, score] of Object.entries(scores)) {
    if (score === null) continue;
    await query(
      `update league_members
          set official_started_at = now(), official_completed_at = now(), official_score = $2
        where display_name = $1`,
      [name, score],
    );
  }
}

async function main() {
  console.log(`Testing ${BASE}\n`);

  const admin = await new Client().signIn(ADMIN.name, ADMIN.pin);
  const player = await new Client().signIn(PLAYER.name, PLAYER.pin);
  const anon = new Client();

  console.log('Admin routes are closed to everyone else');
  {
    for (const [path, method, body] of ADMIN_ROUTES) {
      const res =
        method === 'GET' ? await player.get(path) : await player.post(path, body);
      check(`a normal manager cannot reach ${path}`, res.status === 404, `got ${res.status}`);
    }
    for (const [path, method, body] of ADMIN_ROUTES) {
      const res = method === 'GET' ? await anon.get(path) : await anon.post(path, body);
      check(`a signed out visitor cannot reach ${path}`, res.status === 401, `got ${res.status}`);
    }

    const denied = await player.get('/api/admin/overview');
    check(
      'the refusal does not admit an admin area exists',
      denied.body.error === 'Not found.',
      JSON.stringify(denied.body),
    );
  }

  console.log('\nThe overview shows the commissioner what they need');
  {
    await resetAll(admin);
    const names = ROSTER.map((m) => m.name);
    await setScores({ [names[0]]: 4000, [names[1]]: 3000 });
    // One manager starts and walks away.
    await query(
      `update league_members
          set official_started_at = now(), official_completed_at = null, official_score = null
        where display_name = $1`,
      [names[2]],
    );

    const res = await admin.get('/api/admin/overview');
    check('the overview loads', res.status === 200, `got ${res.status}`);
    check('it lists every manager', res.body.members?.length === MEMBERS.length);
    check('it counts completed runs', res.body.counts?.completed === 2, `${res.body.counts?.completed}`);
    check('it flags an abandoned run', res.body.counts?.abandoned === 1, `${res.body.counts?.abandoned}`);
    check(
      'it flags managers who never ran',
      res.body.counts?.neverRan === MEMBERS.length - 3,
      `${res.body.counts?.neverRan}`,
    );
    check('it reports league size', res.body.league?.leagueSize === players().length);
  }

  console.log('\nOpening and closing the windows');
  {
    await admin.post('/api/admin/window', { which: 'official', value: true });
    let res = await admin.get('/api/admin/overview');
    check('the official window can be forced open', res.body.league?.phase === 'official');

    await admin.post('/api/admin/window', { which: 'official', value: false });
    res = await admin.get('/api/admin/overview');
    check('it can be forced shut', res.body.league?.phase !== 'official', res.body.league?.phase);

    await admin.post('/api/admin/window', { which: 'official', value: null });
    await admin.post('/api/admin/window', { which: 'selection', value: true });
    res = await admin.get('/api/admin/overview');
    check('selection can be forced open', res.body.league?.phase === 'selection');

    const bad = await admin.post('/api/admin/window', { which: 'nonsense', value: true });
    check('an unknown window is refused', bad.status === 400);
  }

  console.log('\nThe dashboard settles the ranking itself');
  {
    await resetAll(admin);
    const names = ROSTER.map((m) => m.name);
    await setScores(Object.fromEntries(names.map((n, i) => [n, 1000 + i * 100])));
    await admin.post('/api/admin/window', { which: 'selection', value: true });

    // Nobody has opened a draft page, so nothing has triggered ranking yet.
    const unranked = await query<{ n: string }>(
      'select count(*)::text as n from league_members where selection_priority is not null',
    );
    check('nothing is ranked before the dashboard is opened', unranked[0].n === '0');

    const res = await admin.get('/api/admin/overview');
    check('the dashboard freezes the ranking', res.body.league?.rankingsFrozen === true);
    check(
      'and every manager has a priority',
      res.body.members.every((m: { selection_priority: number | null }) => m.selection_priority !== null),
    );
    check(
      'the highest score is ranked first',
      res.body.members[0]?.display_name === names[names.length - 1],
      res.body.members[0]?.display_name,
    );
    check('it names who is on the clock', res.body.onTheClock?.display_name === names[names.length - 1]);
  }

  console.log('\nResetting an official attempt');
  {
    await resetAll(admin);
    const names = ROSTER.map((m) => m.name);
    await setScores(Object.fromEntries(names.map((n, i) => [n, 5000 - i * 100])));
    await admin.post('/api/admin/window', { which: 'selection', value: true });

    const before = await admin.get('/api/admin/overview');
    const target = before.body.members.find(
      (m: { display_name: string }) => m.display_name === names[3],
    );

    const res = await admin.post('/api/admin/reset-attempt', { memberId: target.id });
    check('an attempt can be reset before anyone picks', res.status === 200, `got ${res.status}`);

    // Read straight from the database. Opening the dashboard while selection
    // is forced open would itself re-rank, and assign the zero we are checking
    // is absent.
    const reset = (
      await query<{ official_score: number | null; official_started_at: string | null }>(
        `select official_score, official_started_at::text as official_started_at
           from league_members where display_name = $1`,
        [names[3]],
      )
    )[0];
    check('their score is cleared', reset.official_score === null);
    check('their attempt is cleared', reset.official_started_at === null);

    const frozen = await query<{ n: string }>(
      'select count(*)::text as n from league_settings where rankings_frozen_at is not null',
    );
    check('rankings were unfrozen', frozen[0].n === '0');

    // The point of a reset is that they can run again. That means the league
    // has to come out of selection phase, or official runs stay shut.
    await admin.post('/api/admin/window', { which: 'selection', value: null });
    const back = await admin.get('/api/admin/overview');
    check(
      'the league returns to taking official runs',
      back.body.league?.phase === 'official',
      back.body.league?.phase,
    );

    const them = await new Client().signIn(names[3], PINS[names[3]]);
    const rerun = await them.post('/api/official/start');
    check('the reset manager can actually run again', rerun.status === 200, `got ${rerun.status}`);
    const redone = await them.post('/api/official/complete', { score: 2222 });
    check('and lock a new score', redone.status === 200 && redone.body.score === 2222);
    check(
      'which completes the set again and reopens selection',
      redone.body.allRunsComplete === true,
      JSON.stringify(redone.body),
    );
  }

  console.log('\nA reset cannot corrupt a draft already under way');
  {
    await resetAll(admin);
    const names = ROSTER.map((m) => m.name);
    await setScores(Object.fromEntries(names.map((n, i) => [n, 5000 - i * 100])));
    await admin.post('/api/admin/window', { which: 'selection', value: true });

    // The top ranked manager picks, which starts the draft for real.
    const top = await new Client().signIn(names[0], PINS[names[0]]);
    await top.get('/api/draft/status');
    const claim = await top.post('/api/draft/claim', { slot: 5 });
    check('the first pick lands', claim.status === 200, `got ${claim.status}`);

    const overview = await admin.get('/api/admin/overview');
    const someoneElse = overview.body.members.find(
      (m: { display_name: string }) => m.display_name === names[6],
    );
    const res = await admin.post('/api/admin/reset-attempt', { memberId: someoneElse.id });
    check('resetting a run mid draft is refused', res.status === 409, `got ${res.status}`);
    check('the refusal explains why', /already been claimed/i.test(res.body.error ?? ''));
  }

  console.log('\nAssigning a draft position by hand');
  {
    const overview = await admin.get('/api/admin/overview');
    const names = ROSTER.map((m) => m.name);
    const member = overview.body.members.find(
      (m: { display_name: string }) => m.display_name === names[1],
    );

    const clash = await admin.post('/api/admin/assign-slot', { memberId: member.id, slot: 5 });
    check('a taken position is refused', clash.status === 409, `got ${clash.status}`);

    const oor = await admin.post('/api/admin/assign-slot', { memberId: member.id, slot: 99 });
    check('a position beyond league size is refused', oor.status === 409);

    const ok = await admin.post('/api/admin/assign-slot', { memberId: member.id, slot: 1 });
    check('a free position can be assigned', ok.status === 200, `got ${ok.status}`);

    const again = await admin.post('/api/admin/assign-slot', { memberId: member.id, slot: 2 });
    check('a manager cannot be given two positions', again.status === 409);
  }

  console.log('\nThe reveal opens itself when the last pick lands');
  {
    await resetAll(admin);
    const names = ROSTER.map((m) => m.name);
    await setScores(Object.fromEntries(names.map((n, i) => [n, 5000 - i * 100])));
    await admin.post('/api/admin/window', { which: 'selection', value: true });

    // Every manager but the last one picks.
    for (let i = 0; i < names.length - 1; i += 1) {
      const c = await new Client().signIn(names[i], PINS[names[i]]);
      const st = await c.get('/api/draft/status');
      const free = st.body.board
        .filter((x: { available: boolean }) => x.available)
        .map((x: { slot: number }) => x.slot);
      await c.post('/api/draft/claim', { slot: free[0] });
    }

    const beforeLast = await player.get('/api/reveal');
    check('sealed while one pick is outstanding', beforeLast.body.released === false);

    const lastName = names[names.length - 1];
    const last = await new Client().signIn(lastName, PINS[lastName]);
    const st = await last.get('/api/draft/status');
    const free = st.body.board
      .filter((x: { available: boolean }) => x.available)
      .map((x: { slot: number }) => x.slot);
    const claim = await last.post('/api/draft/claim', { slot: free[0] });
    check('the last pick lands', claim.status === 200, `got ${claim.status}`);

    const afterLast = await player.get('/api/reveal');
    check(
      'the draft order opens to everyone with no commissioner action',
      afterLast.body.released === true,
    );
    check('and it is complete', afterLast.body.order?.length === players().length);

    const session = await player.get('/api/session');
    check('the session advertises it', session.body.league?.revealAvailable === true);

    // A commissioner assignment must open it too.
    await resetAll(admin);
    await setScores(Object.fromEntries(names.map((n, i) => [n, 5000 - i * 100])));
    await admin.post('/api/admin/window', { which: 'selection', value: true });
    const overview = await admin.get('/api/admin/overview');
    for (let i = 0; i < overview.body.members.length; i += 1) {
      await admin.post('/api/admin/assign-slot', {
        memberId: overview.body.members[i].id,
        slot: i + 1,
      });
    }
    const assigned = await player.get('/api/reveal');
    check(
      'assigning the final position also opens it',
      assigned.body.released === true,
    );
  }

  console.log('\nThe reveal stays sealed');
  {
    await resetAll(admin);
    const names2 = ROSTER.map((m) => m.name);
    await setScores(Object.fromEntries(names2.map((n, i) => [n, 5000 - i * 100])));
    await admin.post('/api/admin/window', { which: 'selection', value: true });

    const early = await admin.post('/api/admin/reveal', { released: true });
    check('the reveal cannot open before every pick is in', early.status === 409, `got ${early.status}`);

    const seen = await player.get('/api/reveal');
    check('players see nothing while it is sealed', seen.body.released === false);
    check('no draft order leaks while sealed', seen.body.order === undefined);

    // Fill the remaining slots so the reveal becomes legal.
    const overview = await admin.get('/api/admin/overview');
    const free: number[] = [];
    for (let s = 1; s <= overview.body.league.leagueSize; s += 1) {
      if (!overview.body.takenSlots.includes(s)) free.push(s);
    }
    const unplaced = overview.body.members.filter(
      (m: { selected_draft_slot: number | null }) => m.selected_draft_slot === null,
    );
    for (let i = 0; i < unplaced.length && i < free.length; i += 1) {
      await admin.post('/api/admin/assign-slot', { memberId: unplaced[i].id, slot: free[i] });
    }

    const now = await admin.post('/api/admin/reveal', { released: true });
    check('the reveal opens once every pick is in', now.status === 200, `got ${now.status}`);
  }

  console.log('\nThe released reveal');
  {
    const res = await player.get('/api/reveal');
    check('players can now see it', res.body.released === true);
    check('every position is listed', res.body.order?.length === players().length);
    check(
      'it is ordered by draft position',
      res.body.order.every((r: { slot: number }, i: number) => r.slot === i + 1),
    );

    const first = res.body.order[0];
    check('each row names the manager', typeof first.manager === 'string');
    check('each row carries the official score', typeof first.score === 'number');
    check('each row carries the Draft Dash rank', typeof first.rank === 'number');

    const ranks = res.body.order.map((r: { rank: number }) => r.rank).sort((a: number, b: number) => a - b);
    check(
      'ranks are a clean one to league size',
      ranks.join(',') === players().map((_, i) => i + 1).join(','),
      ranks.join(','),
    );

    await admin.post('/api/admin/reveal', { released: false });
    const resealed = await player.get('/api/reveal');
    check('the reveal can be sealed again', resealed.body.released === false);
  }

  console.log('\nResetting the league for testing');
  {
    const noConfirm = await admin.post('/api/admin/reset-league', {});
    check('a reset without confirmation is refused', noConfirm.status === 400);

    const done = await admin.post('/api/admin/reset-league', { confirm: 'RESET' });
    check('a confirmed reset succeeds', done.status === 200);

    const after = await admin.get('/api/admin/overview');
    check('all scores are cleared', after.body.counts.completed === 0);
    check('all positions are cleared', after.body.counts.slotsTaken === 0);
    check('the reveal is sealed again', after.body.league.revealReleased === false);
    check('the roster survives', after.body.members.length === MEMBERS.length);

    // A stale completion stamp would leave the league stuck in selection.
    const stamps = await query<{ n: string }>(`
      select count(*)::text as n from league_settings
       where all_runs_complete_at is not null or completion_notified_at is not null
    `);
    check('the completion stamps are cleared', stamps[0].n === '0');
    check(
      'the league is back to taking official runs',
      after.body.league.phase === 'official',
      after.body.league.phase,
    );

    const stillWorks = await new Client().signIn(PLAYER.name, PLAYER.pin);
    const session = await stillWorks.get('/api/session');
    check('access codes survive a reset', session.body.signedIn === true);
  }

  await resetAll(admin);
  await admin.post('/api/admin/window', { which: 'official', value: null });
  await admin.post('/api/admin/window', { which: 'selection', value: null });

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
