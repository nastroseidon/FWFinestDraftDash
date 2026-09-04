/**
 * Lists league members that are in the database but not in the roster in
 * scripts/seed.ts, and optionally deletes them.
 *
 * Re-seeding never removes anyone, so a placeholder left behind could still
 * sign in and take a draft slot. This is how you clear them out.
 *
 * Dry run:  npm run db:prune
 * Delete:   npm run db:prune -- --yes
 */
import { pool, query } from '../lib/db';
import { MEMBERS } from './roster';

type Row = {
  display_name: string;
  official_score: number | null;
  selected_draft_slot: number | null;
};

async function main() {
  const keep = MEMBERS.map((m) => m.name.toLowerCase());

  const extra = await query<Row>(
    `select display_name, official_score, selected_draft_slot
       from league_members
      where lower(display_name) <> all($1::text[])
      order by display_name`,
    [keep],
  );

  if (extra.length === 0) {
    console.log('Nothing to prune. The database matches the roster.');
    await pool().end();
    return;
  }

  console.log(`${extra.length} member(s) in the database but not in the roster:\n`);
  console.table(extra);

  // Refuse to silently discard anything that already means something.
  const withHistory = extra.filter(
    (r) => r.official_score !== null || r.selected_draft_slot !== null,
  );
  if (withHistory.length > 0) {
    console.log('\nRefusing to delete: some of these have an official score or a draft slot.');
    console.log('Remove them by hand if that is really what you want.');
    process.exitCode = 1;
    await pool().end();
    return;
  }

  if (!process.argv.includes('--yes')) {
    console.log('\nDry run. Re-run with --yes to delete them:');
    console.log('  npm run db:prune -- --yes');
    await pool().end();
    return;
  }

  const deleted = await query<{ display_name: string }>(
    `delete from league_members
      where lower(display_name) <> all($1::text[])
        and official_score is null
        and selected_draft_slot is null
      returning display_name`,
    [keep],
  );

  console.log(`\nDeleted ${deleted.length} member(s).`);
  await pool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
