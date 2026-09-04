/**
 * Applies every SQL file in db/migrations in name order, once.
 * Run with: npm run db:migrate
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pool, query } from '../lib/db';

async function main() {
  await query(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const dir = join(process.cwd(), 'db', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied = new Set(
    (await query<{ name: string }>('select name from schema_migrations')).map((r) => r.name),
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file}`);
      continue;
    }
    process.stdout.write(`apply ${file} ... `);
    await query(readFileSync(join(dir, file), 'utf8'));
    await query('insert into schema_migrations (name) values ($1)', [file]);
    console.log('ok');
  }

  await pool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
