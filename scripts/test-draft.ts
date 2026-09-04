/**
 * Integration tests for draft position selection.
 *
 * The rules worth proving: rank order is frozen, a player learns nothing about
 * anyone else, and two people can never hold the same slot.
 *
 * Run with: npm run test:draft   (dev server must be up on BASE)
 */
import { pool, query } from '../lib/db';
import { loadPins } from './pins';
import { players } from './roster';

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
  constructor(readonly name: string) {}

  async signIn() {
    await this.send('/api/login', 'POST', { name: this.name, pin: PINS[this.name] });
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

/** Wipes every trace of a draft so each scenario starts clean. */
async function resetDraft(scores: Record<string, number | null>) {
  await query(`
    update league_members
       set official_started_at = null, official_completed_at = null,
           official_score = null, selection_priority = null,
           selected_draft_slot = null, selected_at = null
  `);
  await query('update league_settings set rankings_frozen_at = null where id = 1');

  for (const [name, score] of Object.entries(scores)) {
    if (score === null) continue; // did not complete a run
    await query(
      `update league_members
          set official_started_at = now(), official_completed_at = now(), official_score = $2
        where display_name = $1`,
      [name, score],
    );
  }
}

async function setSelectionOpen(open: boolean | null) {
  await query(
    'update league_settings set selection_open_override = $1, official_open_override = null where id = 1',
    [open],
  );
}

async function priorities(): Promise<{ display_name: string; selection_priority: number }[]> {
  return query('select display_name, selection_priority from league_members order by selection_priority');
}

async function main() {
  console.log(`Testing ${BASE}\n`);

  const names = ROSTER.map((m) => m.name);
  // Descending scores, so the expected rank order is simply this list.
  const scores: Record<string, number | null> = {};
  names.forEach((n, i) => {
    scores[n] = 5000 - i * 100;
  });

  console.log('Ranking');
  {
    await resetDraft(scores);
    await setSelectionOpen(true);
    await new Client(names[0]).signIn().then((c) => c.get('/api/draft/status'));

    const ranked = await priorities();
    check('every member has a priority', ranked.every((r) => r.selection_priority !== null));
    check(
      'highest score picks first',
      ranked[0].display_name === names[0],
      `got ${ranked[0].display_name}`,
    );
    check(
      'rank order follows score descending',
      ranked.map((r) => r.display_name).join(',') === names.join(','),
      ranked.map((r) => r.display_name).join(','),
    );
  }

  console.log('\nA missed run scores zero and ranks last');
  {
    const withMisses = { ...scores };
    withMisses[names[1]] = null; // never completed
    withMisses[names[2]] = 0; // completed, ran nowhere
    await resetDraft(withMisses);
    await setSelectionOpen(true);
    await new Client(names[0]).signIn().then((c) => c.get('/api/draft/status'));

    const ranked = await priorities();
    const posOf = (n: string) => ranked.findIndex((r) => r.display_name === n);
    check('a completed zero outranks a missed run', posOf(names[2]) < posOf(names[1]));
    check('the missed run is ranked last', posOf(names[1]) === ranked.length - 1);

    const stored = await query<{ official_score: number; completed: boolean }>(
      `select official_score, (official_completed_at is not null) as completed
         from league_members where display_name = $1`,
      [names[1]],
    );
    check('a missed run is recorded as a real zero', stored[0].official_score === 0);
    check('a missed run stays distinguishable from a completed zero', stored[0].completed === false);
  }

  console.log('\nTies break on the stored value, not on finishing time');
  {
    const tied: Record<string, number> = {};
    names.forEach((n) => {
      tied[n] = 1000;
    });
    await resetDraft(tied);
    await setSelectionOpen(true);
    await new Client(names[0]).signIn().then((c) => c.get('/api/draft/status'));
    const first = (await priorities()).map((r) => r.display_name).join(',');

    // Re-freeze from scratch and confirm the same order comes back.
    await query('update league_settings set rankings_frozen_at = null where id = 1');
    await query('update league_members set selection_priority = null');
    await new Client(names[0]).signIn().then((c) => c.get('/api/draft/status'));
    const second = (await priorities()).map((r) => r.display_name).join(',');

    check('an all-tie ranking is stable across freezes', first === second, `${first} vs ${second}`);
  }

  console.log('\nRankings are frozen once written');
  {
    await resetDraft(scores);
    await setSelectionOpen(true);
    await new Client(names[0]).signIn().then((c) => c.get('/api/draft/status'));
    const before = (await priorities()).map((r) => r.display_name).join(',');

    // Someone edits a score afterwards. Rank order must not move.
    await query(
      'update league_members set official_score = 999999 where display_name = $1',
      [names[11]],
    );
    const reread = await new Client(names[0]).signIn().then((c) => c.get('/api/draft/status'));
    const after = (await priorities()).map((r) => r.display_name).join(',');

    // Asserted separately, so "the order held" cannot be satisfied by the
    // request having crashed and written nothing.
    check('re-reading status after a score edit still succeeds', reread.status === 200,
      `got ${reread.status}`);
    check('a later score change cannot reorder the draft', before === after);
  }

  console.log('\nRe-ranking is possible when the commissioner needs it');
  {
    await resetDraft(scores);
    await setSelectionOpen(true);
    await new Client(names[0]).signIn().then((c) => c.get('/api/draft/status'));
    const before = (await priorities()).map((r) => r.display_name).join(',');

    // Unfreeze, change a score, and rank again, which is what a manual reset
    // amounts to. selection_priority carries a unique index, so a naive
    // reassignment trips over its own transient duplicates.
    await query(
      'update league_members set official_score = 999999 where display_name = $1',
      [names[11]],
    );
    await query('update league_settings set rankings_frozen_at = null where id = 1');
    const res = await new Client(names[0]).signIn().then((c) => c.get('/api/draft/status'));
    const after = (await priorities()).map((r) => r.display_name).join(',');

    check('re-ranking succeeds rather than erroring', res.status === 200, `got ${res.status}`);
    check('the re-ranked order reflects the new score', after.startsWith(names[11]), after);
    check('re-ranking actually changed the order', before !== after);
    check(
      'priorities remain a clean one to twelve',
      (await priorities()).map((r) => r.selection_priority).join(',') ===
        names.map((_, i) => i + 1).join(','),
    );
  }

  console.log('\nTurn gating');
  {
    await resetDraft(scores);
    await setSelectionOpen(true);

    const first = await new Client(names[0]).signIn();
    const second = await new Client(names[1]).signIn();
    const last = await new Client(names[11]).signIn();

    const a = await first.get('/api/draft/status');
    const b = await second.get('/api/draft/status');
    const z = await last.get('/api/draft/status');

    check('the top ranked player is on the clock', a.body.onTheClock === true);
    check('the second is not', b.body.onTheClock === false);
    check('the last is not', z.body.onTheClock === false);
    check('the player on the clock gets a board', Array.isArray(a.body.board));
    check('a waiting player gets no board at all', b.body.board === null);
    check(
      'the board offers exactly league size slots',
      a.body.board.length === a.body.leagueSize,
      `${a.body.board?.length} vs ${a.body.leagueSize}`,
    );
  }

  console.log('\nA waiting player learns nothing about anyone else');
  {
    const waiting = await new Client(names[5]).signIn();
    const res = await waiting.get('/api/draft/status');
    const text = JSON.stringify(res.body);

    const others = names.filter((n) => n !== names[5]);
    check('no other manager is named', !others.some((n) => text.includes(n)));
    check('no rank is exposed', !/priority|rank/i.test(text));
    check('no other score is exposed', !/5000|4900|4800/.test(text));
    check('nothing says who is currently picking', !/onTheClockMember|currentSelector/i.test(text));
  }

  console.log('\nClaiming a slot');
  {
    await resetDraft(scores);
    await setSelectionOpen(true);

    const onClock = await new Client(names[0]).signIn();
    const waiting = await new Client(names[1]).signIn();

    const notYours = await waiting.post('/api/draft/claim', { slot: 5 });
    check('a waiting player cannot claim', notYours.status === 400, `got ${notYours.status}`);

    const bad = await onClock.post('/api/draft/claim', { slot: 99 });
    check('a slot beyond league size is refused', bad.status === 400);

    const zero = await onClock.post('/api/draft/claim', { slot: 0 });
    check('slot zero is refused', zero.status === 400);

    const ok = await onClock.post('/api/draft/claim', { slot: 4 });
    check('the player on the clock can claim', ok.status === 200 && ok.body.slot === 4);

    const again = await onClock.post('/api/draft/claim', { slot: 6 });
    check('a selection cannot be changed', again.status === 400, `got ${again.status}`);

    const after = await onClock.get('/api/draft/status');
    check('their own slot is reported back', after.body.selectedSlot === 4);
    check('they are no longer on the clock', after.body.onTheClock === false);

    const next = await waiting.get('/api/draft/status');
    check('the next ranked player is now on the clock', next.body.onTheClock === true);
    check(
      'the taken slot shows as unavailable',
      next.body.board.find((s: { slot: number }) => s.slot === 4)?.available === false,
    );
    check(
      'the taken slot is not attributed to anyone',
      !JSON.stringify(next.body.board).includes(names[0]),
    );
  }

  console.log('\nA stale board cannot steal a taken slot');
  {
    await resetDraft(scores);
    await setSelectionOpen(true);

    const first = await new Client(names[0]).signIn();
    const second = await new Client(names[1]).signIn();

    // Second loads the board early, while every slot still looks free.
    await second.get('/api/draft/status');

    await first.post('/api/draft/claim', { slot: 7 });

    // Now it is second's turn, but their page still shows 7 as available.
    const stale = await second.post('/api/draft/claim', { slot: 7 });
    check('a stale confirm is rejected', stale.status === 409, `got ${stale.status}`);
    check('the rejection is snarky rather than technical', /faster|gone/i.test(stale.body.error ?? ''));
    check('the rejection carries a refreshed board', Array.isArray(stale.body.status?.board));
    check(
      'the refreshed board shows the slot as gone',
      stale.body.status.board.find((s: { slot: number }) => s.slot === 7)?.available === false,
    );

    const recover = await second.post('/api/draft/claim', { slot: 8 });
    check('they can still take a free slot', recover.status === 200 && recover.body.slot === 8);
  }

  console.log('\nSimultaneous claims');
  {
    await resetDraft(scores);
    await setSelectionOpen(true);

    // Same manager, two devices, both hammering different slots at once.
    const phone = await new Client(names[0]).signIn();
    const laptop = await new Client(names[0]).signIn();
    const [r1, r2] = await Promise.all([
      phone.post('/api/draft/claim', { slot: 2 }),
      laptop.post('/api/draft/claim', { slot: 9 }),
    ]);
    const wins = [r1, r2].filter((r) => r.status === 200).length;
    check('exactly one of two simultaneous claims wins', wins === 1, `wins=${wins}`);

    const held = await query<{ n: string }>(
      `select count(*)::text as n from league_members
        where display_name = $1 and selected_draft_slot is not null`,
      [names[0]],
    );
    check('the manager holds exactly one slot', held[0].n === '1');
  }

  console.log('\nA full draft, start to finish');
  {
    await resetDraft(scores);
    await setSelectionOpen(true);

    const order: { name: string; slot: number }[] = [];
    for (let i = 0; i < names.length; i += 1) {
      const c = await new Client(names[i]).signIn();
      const status = await c.get('/api/draft/status');
      if (!status.body.onTheClock) {
        check(`${names[i]} is on the clock at position ${i + 1}`, false, 'not on the clock');
        break;
      }
      // Everyone takes the highest numbered slot still free, so the mapping
      // between rank and slot is deliberately not the identity.
      const free = status.body.board
        .filter((s: { available: boolean }) => s.available)
        .map((s: { slot: number }) => s.slot);
      const pick = free[free.length - 1];
      const res = await c.post('/api/draft/claim', { slot: pick });
      if (res.status !== 200) {
        check(`${names[i]} could claim slot ${pick}`, false, `status ${res.status}`);
        break;
      }
      order.push({ name: names[i], slot: pick });
    }

    check('all twelve picked in rank order', order.length === names.length, `${order.length}`);
    check(
      'selection followed the ranking exactly',
      order.map((o) => o.name).join(',') === names.join(','),
    );

    const slots = await query<{ selected_draft_slot: number }>(
      'select selected_draft_slot from league_members where selected_draft_slot is not null',
    );
    const unique = new Set(slots.map((s) => s.selected_draft_slot));
    check('every slot is held exactly once', unique.size === names.length, `${unique.size}`);
    check(
      'slots one through league size are all taken',
      [...unique].sort((a, b) => a - b).join(',') ===
        names.map((_, i) => i + 1).join(','),
    );

    const done = await new Client(names[0]).signIn().then((c) => c.get('/api/draft/status'));
    check('selection reports complete', done.body.selectionComplete === true);
  }

  console.log('\nManagers who never ran do not get a turn');
  {
    // Nine run, three do not.
    const partial: Record<string, number | null> = {};
    names.forEach((n, i) => {
      partial[n] = i < 9 ? 5000 - i * 100 : null;
    });
    await resetDraft(partial);
    await setSelectionOpen(true);
    // The official window has to be shut, or the no-show set is not final.
    await query('update league_settings set official_open_override = false where id = 1');

    const ranAndWaiting = await new Client(names[0]).signIn();
    const first = await ranAndWaiting.get('/api/draft/status');
    check('a manager who ran is on the clock', first.body.onTheClock === true);

    const noShow = await new Client(names[11]).signIn();
    const theirs = await noShow.get('/api/draft/status');
    check('a no-show is never on the clock', theirs.body.onTheClock === false);
    check('a no-show gets no board', theirs.body.board === null);

    const sneak = await noShow.post('/api/draft/claim', { slot: 1 });
    check('a no-show cannot claim a position', sneak.status === 400, `got ${sneak.status}`);

    // The nine who ran pick, each taking the highest free position, so the
    // leftovers are the low numbers.
    const picked: string[] = [];
    for (let i = 0; i < 9; i += 1) {
      const c = await new Client(names[i]).signIn();
      const st = await c.get('/api/draft/status');
      if (!st.body.onTheClock) {
        check(`${names[i]} was on the clock at turn ${i + 1}`, false);
        break;
      }
      const free = st.body.board
        .filter((x: { available: boolean }) => x.available)
        .map((x: { slot: number }) => x.slot);
      await c.post('/api/draft/claim', { slot: free[free.length - 1] });
      picked.push(names[i]);
    }
    check('only the nine who ran got a turn', picked.length === 9, `${picked.length}`);

    const dealt = await query<{ display_name: string; selected_draft_slot: number }>(`
      select display_name, selected_draft_slot from league_members
       where official_completed_at is null
       order by selected_draft_slot
    `);
    check('all three no-shows were dealt a position', dealt.length === 3, `${dealt.length}`);
    check(
      'they got the positions nobody chose',
      dealt.every((d) => d.selected_draft_slot <= 3),
      dealt.map((d) => d.selected_draft_slot).join(','),
    );

    const all = await query<{ n: string }>(
      'select count(*)::text as n from league_members where selected_draft_slot is null',
    );
    check('every position is filled', all[0].n === '0');

    const reveal = await query<{ released: boolean }>(
      'select reveal_released as released from league_settings',
    );
    check('the draft order opened once the board filled', reveal[0].released === true);
  }

  console.log('\nDealing is stable and cannot be nudged');
  {
    const before = await query<{ display_name: string; selected_draft_slot: number }>(`
      select display_name, selected_draft_slot from league_members
       where official_completed_at is null order by display_name
    `);
    // Re-running the deal must not move anybody.
    await new Client(names[0]).signIn().then((c) => c.get('/api/draft/status'));
    const after = await query<{ display_name: string; selected_draft_slot: number }>(`
      select display_name, selected_draft_slot from league_members
       where official_completed_at is null order by display_name
    `);
    check(
      'a second pass changes nothing',
      JSON.stringify(before) === JSON.stringify(after),
      JSON.stringify(after),
    );
  }

  console.log('\nNobody runs at all');
  {
    await resetDraft({});
    await setSelectionOpen(true);
    await query('update league_settings set official_open_override = false where id = 1');

    const c = await new Client(names[0]).signIn();
    const st = await c.get('/api/draft/status');
    check('nobody is on the clock', st.body.onTheClock === false);

    const filled = await query<{ n: string }>(
      'select count(*)::text as n from league_members where selected_draft_slot is not null',
    );
    check('the whole board is dealt at random', filled[0].n === String(names.length), filled[0].n);

    const slots = await query<{ selected_draft_slot: number }>(
      'select selected_draft_slot from league_members where selected_draft_slot is not null',
    );
    check(
      'every position used exactly once',
      new Set(slots.map((s) => s.selected_draft_slot)).size === names.length,
    );
    await query('update league_settings set official_open_override = null where id = 1');
  }

  console.log('\nDealing waits for the deadline');
  {
    // Nine have run AND all nine have already picked, but the official window
    // is still open, so those three could still turn up and run. Nothing may be
    // dealt yet. Without every runner already placed, the pending-runner guard
    // would block dealing on its own and this would prove nothing.
    const partial: Record<string, number | null> = {};
    names.forEach((n, i) => {
      partial[n] = i < 9 ? 5000 - i * 100 : null;
    });
    await resetDraft(partial);
    await query(
      'update league_settings set official_open_override = true, selection_open_override = true where id = 1',
    );

    for (let i = 0; i < 9; i += 1) {
      const c = await new Client(names[i]).signIn();
      const st = await c.get('/api/draft/status');
      if (!st.body.onTheClock) break;
      const free = st.body.board
        .filter((x: { available: boolean }) => x.available)
        .map((x: { slot: number }) => x.slot);
      await c.post('/api/draft/claim', { slot: free[free.length - 1] });
    }

    const placedRunners = await query<{ n: string }>(`
      select count(*)::text as n from league_members
       where official_completed_at is not null and selected_draft_slot is not null
    `);
    check('all nine runners have picked', placedRunners[0].n === '9', placedRunners[0].n);

    const c = await new Client(names[0]).signIn();
    await c.get('/api/draft/status');
    const dealtEarly = await query<{ n: string }>(`
      select count(*)::text as n from league_members
       where official_completed_at is null and selected_draft_slot is not null
    `);
    check(
      'nothing is dealt while a run is still possible',
      dealtEarly[0].n === '0',
      dealtEarly[0].n,
    );

    // And a no-show is still not given a turn, even though they are next in
    // rank order and nothing has been dealt.
    const noShow = await new Client(names[11]).signIn();
    const theirs = await noShow.get('/api/draft/status');
    check('a no-show is not on the clock even when next in line', theirs.body.onTheClock === false);
    check('and still gets no board', theirs.body.board === null);
    const sneak = await noShow.post('/api/draft/claim', { slot: 1 });
    check('and still cannot claim', sneak.status === 400, `got ${sneak.status}`);

    // Shutting the window is what releases the deal.
    await query('update league_settings set official_open_override = false where id = 1');
    await c.get('/api/draft/status');
    const dealtNow = await query<{ n: string }>(`
      select count(*)::text as n from league_members
       where official_completed_at is null and selected_draft_slot is not null
    `);
    check('closing the window deals the remainder', dealtNow[0].n === '3', dealtNow[0].n);
    await query('update league_settings set official_open_override = null where id = 1');
  }

  console.log('\nSelection is closed outside the window');
  {
    await resetDraft(scores);
    await setSelectionOpen(null); // follow the schedule, which is in the future
    const c = await new Client(names[0]).signIn();

    const status = await c.get('/api/draft/status');
    check('nobody is on the clock before the window', status.body.onTheClock === false);
    check('no board is handed out before the window', status.body.board === null);

    const claim = await c.post('/api/draft/claim', { slot: 1 });
    check('a claim before the window is refused', claim.status === 400, `got ${claim.status}`);

    const ranked = await query<{ n: string }>(
      'select count(*)::text as n from league_members where selection_priority is not null',
    );
    check('rankings are not frozen early', ranked[0].n === '0', `${ranked[0].n} ranked`);
  }

  // Leave the league as we found it.
  await resetDraft({});
  await setSelectionOpen(null);

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
