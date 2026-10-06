import { describe, expect, it } from 'vitest';

import { commitFailed } from '../migrate.ts';

// A failed COMMIT is reported as rolled back only on a refusal Postgres sent.
// A `code` raised on this side of the connection is not a SQLSTATE, so the
// commit may have happened and the outcome is unknown.
const failure = (code: string, message: string) =>
  new Error('COMMIT failed', {
    cause: Object.assign(new Error(message), { code }),
  });

describe('a failed COMMIT', () => {
  it.each([
    ['a socket reset', 'ECONNRESET', 'read ECONNRESET'],
    ['a broken pipe', 'EPIPE', 'write EPIPE'],
    ['a connection exception Postgres sent', '08006', 'connection failure'],
  ])('is an unknown outcome after %s', (_, code, message) => {
    const reported = commitFailed(failure(code, message));
    expect(reported.rolledBack).toBe(false);
    expect(reported.message).toContain(
      'whether the release was applied is unknown',
    );
    expect(reported.message).toContain(message);
  });

  it('is rolled back on a refusal Postgres sent, its message shown for a named-object class', () => {
    const reported = commitFailed(
      failure(
        '23514',
        'new row for relation "probe" violates check constraint "probe_check"',
      ),
    );
    expect(reported.rolledBack).toBe(true);
    expect(reported.code).toBe('23514');
    expect(reported.message).toContain(
      'violates check constraint "probe_check"',
    );
    expect(reported.message).toContain('Nothing was applied');
  });

  it('is rolled back on a PL/pgSQL raise, reported by its code alone', () => {
    const reported = commitFailed(failure('P0001', 'grant for Alice Example'));
    expect(reported.rolledBack).toBe(true);
    expect(reported.message).not.toContain('Alice Example');
  });
});
