import type { HourlyWindow, LimiterStore } from './limiter.ts';

/**
 * The limiter's state in a Durable Object's SQLite storage. The tables hold
 * only keys (hashes), times and counts: no request content and no address.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS hourly_windows (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,
  count INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS hourly_windows_end ON hourly_windows (window_end);
CREATE TABLE IF NOT EXISTS daily_spend (
  day TEXT PRIMARY KEY,
  committed_micros INTEGER NOT NULL
);
`;

type WindowRow = {
  key: string;
  window_start: number;
  window_end: number;
  count: number;
};

type SpendRow = { committed_micros: number };

export const createSqlStore = (sql: SqlStorage): LimiterStore => {
  sql.exec(SCHEMA);

  return {
    getWindow(key) {
      const [row] = sql
        .exec<WindowRow>(
          'SELECT key, window_start, window_end, count FROM hourly_windows WHERE key = ?',
          key,
        )
        .toArray();
      if (!row) return null;
      const window: HourlyWindow = {
        key: row.key,
        windowStart: row.window_start,
        windowEnd: row.window_end,
        count: row.count,
      };
      return window;
    },
    putWindow({ key, windowStart, windowEnd, count }) {
      sql.exec(
        `INSERT INTO hourly_windows (key, window_start, window_end, count) VALUES (?, ?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET window_start = excluded.window_start, window_end = excluded.window_end, count = excluded.count`,
        key,
        windowStart,
        windowEnd,
        count,
      );
    },
    deleteWindow(key) {
      sql.exec('DELETE FROM hourly_windows WHERE key = ?', key);
    },
    deleteExpiredWindows(now) {
      sql.exec('DELETE FROM hourly_windows WHERE window_end <= ?', now);
    },
    getCommitted(day) {
      const [row] = sql
        .exec<SpendRow>(
          'SELECT committed_micros FROM daily_spend WHERE day = ?',
          day,
        )
        .toArray();
      return row?.committed_micros ?? 0;
    },
    setCommitted(day, micros) {
      sql.exec(
        `INSERT INTO daily_spend (day, committed_micros) VALUES (?, ?)
         ON CONFLICT (day) DO UPDATE SET committed_micros = excluded.committed_micros`,
        day,
        micros,
      );
    },
    getCommittedSince(day) {
      const [row] = sql
        .exec<SpendRow>(
          'SELECT COALESCE(SUM(committed_micros), 0) AS committed_micros FROM daily_spend WHERE day >= ?',
          day,
        )
        .toArray();
      return row?.committed_micros ?? 0;
    },
    deleteDaysBefore(day) {
      sql.exec('DELETE FROM daily_spend WHERE day < ?', day);
    },
  };
};
