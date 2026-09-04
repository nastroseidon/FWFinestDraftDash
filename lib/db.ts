import { Pool, PoolClient } from 'pg';

/**
 * A single pool per process. Works unchanged against local Postgres, Neon,
 * Vercel Postgres, or Supabase — they are all just Postgres over TCP.
 */
declare global {
  var __fwfPool: Pool | undefined;
}

function makePool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local.');
  }

  return new Pool({
    connectionString,
    // Hosted Postgres requires TLS; a local container does not offer it.
    ssl: /localhost|127\.0\.0\.1/.test(connectionString)
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
