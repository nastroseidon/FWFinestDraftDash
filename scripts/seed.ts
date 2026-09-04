/**
 * Seeds league settings and members. Safe to re-run: members are matched on
 * display name and their scores are left alone.
 *
 * Edit the roster in scripts/roster.ts, not here.
 *
 * Run with: npm run db:seed
 */
import { hashAccessCode } from '../lib/auth';
import { pool, query } from '../lib/db';
import { MEMBERS } from './roster';

/** Catches roster mistakes with a readable message rather than a Postgres dump. */
function validateRoster() {
  const problems: string[] = [];

  const admins = MEMBERS.filter((m) => m.admin);
  if (admins.length !== 1) {
    problems.push(`Expected exactly one admin, found ${admins.length}.`);
  }

  const players = MEMBERS.filter((m) => !m.admin);
  if (players.length < 4 || players.length > 16) {
    problems.push(
      `League size is ${players.length}. It must be between 4 and 16 (admins do not count).`,
    );
  }

  const seen = new Map<string, number>();
  for (const m of MEMBERS) {
    if (!m.name?.trim()) problems.push('A member has a blank name.');
    if (!m.pin?.trim()) problems.push(`${m.name} has a blank PIN.`);
    const key = m.name.trim().toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [name, count] of seen) {
    if (count > 1) problems.push(`Duplicate name "${name}" appears ${count} times.`);
  }

  if (problems.length) {
    console.error('Roster is not valid. Fix scripts/roster.ts:\n');
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }

  const weak = MEMBERS.filter((m) => m.pin.trim().length < 6);
  if (weak.length) {
    console.warn(
      `Warning: ${weak.length} PIN(s) are shorter than 6 characters. ` +
        'There is no login rate limiting yet, so short PINs are guessable.\n',
    );
  }
}

async function main() {
  validateRoster();

  // Times are written with the IANA zone so Postgres resolves the offset. The
  // schedule is 12:00 AM to 5:00 PM on 7 September 2026, then selection to 6 PM.
  await query(
    `insert into league_settings (
       id, league_name, timezone,
       official_open_at, official_close_at, selection_open_at, selection_close_at,
       official_seed, league_size
     ) values (
       1, 'Fort Wayne Finest', 'America/Indiana/Indianapolis',
       timestamptz '2026-09-07 00:00:00 America/Indiana/Indianapolis',
       timestamptz '2026-09-07 17:00:00 America/Indiana/Indianapolis',
       timestamptz '2026-09-07 17:00:00 America/Indiana/Indianapolis',
       timestamptz '2026-09-07 18:00:00 America/Indiana/Indianapolis',
       $1, $2
     )
     on conflict (id) do update
       set league_name = excluded.league_name,
           timezone    = excluded.timezone,
           -- Keeps league_size in step when the roster below changes. The
           -- schedule is deliberately left alone so re-seeding cannot clobber
           -- dates the commissioner has already adjusted.
           league_size = excluded.league_size`,
    [20260907, MEMBERS.filter((m) => !m.admin).length],
  );

  for (const m of MEMBERS) {
    const hash = await hashAccessCode(m.pin);
    await query(
      `insert into league_members (display_name, team_name, access_code_hash, is_admin)
       values ($1, $2, $3, $4)
       on conflict (lower(display_name)) do update
         set team_name = excluded.team_name,
             access_code_hash = excluded.access_code_hash,
             is_admin = excluded.is_admin`,
      [m.name, m.team ?? null, hash, m.admin ?? false],
    );
  }

  console.log(`Seeded ${MEMBERS.length} members.`);
  console.table(MEMBERS.map((m) => ({ name: m.name, pin: m.pin, admin: !!m.admin })));
  await pool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
