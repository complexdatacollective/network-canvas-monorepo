import type pg from 'pg';

// Sync and the denial-summary window are process-local. A second web/both
// process must refuse startup, including during a rolling replacement. Worker
// replicas never acquire this lock and coordinate only through durable leases.
const LOCK_SEED = '1677700182879916';

export async function acquireWebLease(pool: pg.Pool, onLost: () => void) {
  const client = await pool.connect();
  try {
    const result = await client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock(hashtextextended(current_schema(), $1::bigint)) AS acquired',
      [LOCK_SEED],
    );
    if (!result.rows[0]?.acquired)
      throw new Error('A Studio web process already owns this database.');
  } catch (error) {
    client.release(true);
    throw error;
  }

  let stopped = false;
  let checking = false;
  const lost = () => {
    if (!stopped) {
      stopped = true;
      clearInterval(timer);
      onLost();
    }
  };
  client.on('error', lost);
  // Detect a broken idle lock connection as well as explicit server errors.
  // The deadline is bounded, so a partition cannot leave this process serving
  // indefinitely after PostgreSQL has released its session lock.
  const timer = setInterval(() => {
    if (checking || stopped) return;
    checking = true;
    const deadline = setTimeout(lost, 3_000);
    deadline.unref();
    void client
      .query('SELECT 1')
      .catch(lost)
      .finally(() => {
        clearTimeout(deadline);
        checking = false;
      });
  }, 2_000);
  timer.unref();

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
      client.off('error', lost);
      // Destroy the dedicated connection instead of returning a session lock
      // to a reusable pool connection. PostgreSQL releases it on disconnect.
      client.release(true);
    },
  };
}
