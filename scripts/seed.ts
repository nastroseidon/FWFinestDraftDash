/**
 * Seeds league settings and members. Safe to re-run: members are matched on
 * display name and their scores and practice bests are left alone.
 *
 * Edit the roster in scripts/roster.ts. Access codes are generated into
 * db/pins.local.json, which is gitignored.
 *
 * Run with: npm run db:seed
 */
import { hashAccessCode } from '../lib/auth';
import { pool, query } from '../lib/db';
import { MEMBERS, players } from './roster';
import { PINS_PATH, generatePin, loadPins, savePins } from './pins';

/** Catches roster mistakes with a readable message rather than a Postgres dump. */
function validateRoster() {
  const problems: string[] = [];

  const admins = MEMBERS.filter((m) => m.admin);
  if (admins.length !== 1) {
    problems.push(`Expected exactly one admin, found ${admins.length}.`);
  }

  const size = players().length;
  if (size < 4 || size > 16) {
    problems.push(`League size is ${size}. It must be between 4 and 16.`);
  }

  const seen = new Map<string, number>();
  for (const m of MEMBERS) {
    if (!m.name?.trim()) problems.push('A member has a blank name.');
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
}

/** Existing codes are kept so re-seeding does not lock anyone out. */
function resolvePins(): { pins: Record<string, string>; created: string[] } {
  const pins = loadPins();
  const created: string[] = [];

  for (const m of MEMBERS) {
    if (!pins[m.name]) {
      pins[m.name] = generatePin();
      created.push(m.name);
    }
  }

  if (created.length) savePins(pins);
  return { pins, created };
}

async function main() {
  validateRoster();
  const { pins, created } = resolvePins();

  await query(
    `insert into league_settings (
       id, league_name, timezone,
       official_open_at, official_close_at, practice_close_at,
       selection_open_at, selection_close_at,
       official_seed, league_size
     ) values (
       1, 'Fort Wayne Finest', 'America/Indiana/Indianapolis',
       -- Official runs are available from the moment the league goes live.
       timestamptz '2026-09-04 00:00:00 America/Indiana/Indianapolis',
       -- Official runs are due by noon on Monday.
       timestamptz '2026-09-07 12:00:00 America/Indiana/Indianapolis',
       -- Practice stops when Monday starts. After that only the official run.
       timestamptz '2026-09-07 00:00:00 America/Indiana/Indianapolis',
       -- Selection opens at the deadline at the latest, or earlier once
       -- everyone has run.
       timestamptz '2026-09-07 12:00:00 America/Indiana/Indianapolis',
       timestamptz '2026-09-07 18:00:00 America/Indiana/Indianapolis',
       $1, $2
     )
     on conflict (id) do update
       set league_name = excluded.league_name,
           timezone    = excluded.timezone,
           official_open_at  = excluded.official_open_at,
           official_close_at = excluded.official_close_at,
           practice_close_at = excluded.practice_close_at,
           selection_open_at = excluded.selection_open_at,
           selection_close_at = excluded.selection_close_at,
           league_size = excluded.league_size`,
    [20260907, players().length],
  );

  for (const m of MEMBERS) {
    const hash = await hashAccessCode(pins[m.name]);
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

  console.log(`Seeded ${MEMBERS.length} members, league size ${players().length}.`);
  if (created.length) {
    console.log(`Generated ${created.length} new access code(s) into ${PINS_PATH}.`);
  }
  console.log('\nAccess codes (hand these out privately):\n');
  console.table(
    MEMBERS.map((m) => ({
      manager: m.name,
      code: pins[m.name],
      admin: m.admin ? 'yes' : '',
    })),
  );

  await pool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
