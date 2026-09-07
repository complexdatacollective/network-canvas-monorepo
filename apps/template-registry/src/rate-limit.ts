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
