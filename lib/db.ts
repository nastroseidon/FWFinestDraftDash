import { Pool, PoolClient } from 'pg';

/**
 * A single pool per process. Works unchanged against local Postgres, Neon,
 * Vercel Postgres, or Supabase — they are all just Postgres over TCP.
 */
declare global {
  var __fwfPool: Pool | undefined;
}

/**
 * Connection string, under whichever name the host happens to use.
 *
 * DATABASE_URL is what this project sets locally. Vercel's Neon integration
 * writes POSTGRES_URL instead, so both are accepted rather than requiring a
 * hand-copied duplicate variable that can silently drift.
 *
 * Pooled connections come first: the app runs as serverless functions, and the
 * unpooled ones exist for migrations and long transactions.
 */
const URL_VARIABLES = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NON_POOLING',
] as const;

export function connectionString(): string {
  for (const name of URL_VARIABLES) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(
    `No database connection string. Set one of: ${URL_VARIABLES.join(', ')}. ` +
      'Locally, copy .env.example to .env.local.',
  );
}

function makePool(): Pool {
  const connection = connectionString();

  return new Pool({
    connectionString: connection,
    // Hosted Postgres requires TLS; a local container does not offer it.
    ssl: /localhost|127\.0\.0\.1/.test(connection)
      ? undefined
      : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 10_000,
  });
}

export function pool(): Pool {
  // Reused across hot reloads in dev, so we do not leak connections.
  globalThis.__fwfPool ??= makePool();
  return globalThis.__fwfPool;
}

export async function query<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool().query(text, params);
  return result.rows as T[];
}

/**
 * Run `fn` inside a transaction. Used wherever a check and a write must not be
 * separable — starting an official run, claiming a draft slot.
 */
export async function transaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
