import { describe, expect, it } from 'vitest';

import {
  assertSchemaName,
  dropJobSchemaSql,
  jobNotifyChannel,
  jobSchemaSql,
} from '../schema.ts';

const LIMIT = 63;

const name = (length: number) => `s${'x'.repeat(length - 1)}`;

describe('the schema name the DDL is allowed to interpolate', () => {
  it('accepts a name of exactly Postgres’s identifier limit', () => {
    const longest = name(LIMIT);
    expect(longest).toHaveLength(LIMIT);
    expect(assertSchemaName(longest)).toBe(longest);
    expect(jobNotifyChannel(longest)).toBe(longest);
    expect(jobSchemaSql(longest)).toContain(
      `CREATE SCHEMA IF NOT EXISTS ${longest};`,
    );
    expect(dropJobSchemaSql(longest)).toContain(longest);
  });

  it('refuses one byte more', () => {
    const tooLong = name(LIMIT + 1);
    expect(tooLong).toHaveLength(LIMIT + 1);
    expect(() => assertSchemaName(tooLong)).toThrow(/63-byte identifier limit/);
    expect(() => jobNotifyChannel(tooLong)).toThrow(/63-byte identifier limit/);
    expect(() => jobSchemaSql(tooLong)).toThrow(/63-byte identifier limit/);
  });

  it('still refuses a name that is not an identifier at all', () => {
    expect(() => assertSchemaName('studio jobs')).toThrow(
      /invalid job schema name/,
    );
    expect(() =>
      assertSchemaName('studio_jobs"; DROP SCHEMA public; --'),
    ).toThrow(/invalid job schema name/);
  });

  it('accepts the names this build actually installs under', () => {
    for (const installed of [
      'studio_jobs',
      'studio_test_0123456789ab',
      'studio_test_0123456789ab_ejobs',
    ]) {
      expect(assertSchemaName(installed)).toBe(installed);
    }
  });
});
