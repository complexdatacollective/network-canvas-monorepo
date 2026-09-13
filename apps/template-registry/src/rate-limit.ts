import type pg from 'pg';

import { RegistryError } from './problems.ts';

/** Admission survives failed commands and is shared by every service replica. */
export async function admitRegistryRate(
  pool: Pick<pg.Pool, 'query'>,
  scope: string,
  maximum: number,
  seconds: number,
): Promise<void> {
  const result = await pool.query(
    `WITH boundary AS (SELECT to_timestamp(floor(extract(epoch FROM statement_timestamp()) / $3) * $3) AS start)
    INSERT INTO registry_rate_counters(scope, window_start, expires_at, count)
    SELECT $1, start, start + $3 * interval '1 second', 1 FROM boundary
    ON CONFLICT (scope, window_start) DO UPDATE SET count = registry_rate_counters.count + 1
      WHERE registry_rate_counters.count < $2 RETURNING count`,
    [scope, maximum, seconds],
  );
  if (!result.rowCount)
    throw new RegistryError('RATE_LIMITED', { retry_after_seconds: seconds });
}

export const REGISTRY_SEARCH_ADMISSION_SCOPE =
  'template-registry/public-search/v1';

/**
 * One scan per replica and a small database-wide slot set prevent anonymous
 * search from occupying every connection used by readiness and account reads.
 */
export class RegistrySharedSearchAdmission {
  readonly #pool: pg.Pool;
  #active = false;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async run<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    if (this.#active)
      throw new RegistryError('RATE_LIMITED', { retry_after_seconds: 1 });
    this.#active = true;
    let client: pg.PoolClient | undefined;
    let slot: number | undefined;
    let discard = false;
    try {
      client = await this.#pool.connect();
      for (const candidate of [0, 1]) {
        const acquired = await client.query<{ acquired: boolean }>(
          'SELECT pg_try_advisory_lock(hashtext($1), $2) AS acquired',
          [REGISTRY_SEARCH_ADMISSION_SCOPE, candidate],
        );
        if (acquired.rows[0]?.acquired) {
          slot = candidate;
          break;
        }
      }
      if (slot === undefined)
        throw new RegistryError('RATE_LIMITED', { retry_after_seconds: 1 });
      return await work(client);
    } finally {
      if (client) {
        if (slot !== undefined) {
          try {
            const unlocked = await client.query<{ unlocked: boolean }>(
              'SELECT pg_advisory_unlock(hashtext($1), $2) AS unlocked',
              [REGISTRY_SEARCH_ADMISSION_SCOPE, slot],
            );
            discard = unlocked.rows[0]?.unlocked !== true;
          } catch {
            discard = true;
          }
        }
        client.release(discard);
      }
      this.#active = false;
    }
  }
}
