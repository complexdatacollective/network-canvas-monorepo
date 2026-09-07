import { Pool, type PoolConfig } from 'pg';

const connections = new WeakMap<Pool, Set<Promise<void>>>();

/** pg-pool removes idle clients before their sockets finish closing. Fixtures
 * must await actual disconnects before DROP DATABASE FORCE can target them. */
export function fixturePool(configuration: PoolConfig): Pool {
  const pool = new Pool(configuration);
  const pending = new Set<Promise<void>>();
  connections.set(pool, pending);
  pool.on('connect', (client) => {
    const disconnected = new Promise<void>((resolve) => {
      client.once('end', resolve);
    });
    pending.add(disconnected);
    void disconnected.then(() => pending.delete(disconnected));
  });
  return pool;
}

export async function closeFixturePool(pool: Pool): Promise<void> {
  const pending = connections.get(pool);
  if (!pending) throw new Error('Not a tracked fixture pool.');
  await pool.end();
  await Promise.all(pending);
}
