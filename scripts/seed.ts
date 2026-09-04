/**
 * Seeds league settings and members. Safe to re-run: members are matched on
 * display name and their scores are left alone.
 *
 * Run with: npm run db:seed
 */
import { hashAccessCode } from '../lib/auth';
import { pool, query } from '../lib/db';

/** Edit this list, then re-run. PINs are printed once and stored hashed. */
const MEMBERS: { name: string; team?: string; pin: string; admin?: boolean }[] = [
  { name: 'Commissioner', team: 'League Office', pin: '4242', admin: true },
  { name: 'Manager 1', pin: '1001' },
  { name: 'Manager 2', pin: '1002' },
  { name: 'Manager 3', pin: '1003' },
  { name: 'Manager 4', pin: '1004' },
  { name: 'Manager 5', pin: '1005' },
  { name: 'Manager 6', pin: '1006' },
  { name: 'Manager 7', pin: '1007' },
  { name: 'Manager 8', pin: '1008' },
  { name: 'Manager 9', pin: '1009' },
  { name: 'Manager 10', pin: '1010' },
  { name: 'Manager 11', pin: '1011' },
  { name: 'Manager 12', pin: '1012' },
];

async function main() {
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
     on conflict (id) do nothing`,
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
