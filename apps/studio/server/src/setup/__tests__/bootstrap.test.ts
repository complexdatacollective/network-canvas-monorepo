// The token half of first-run bootstrap (#1909): what the schema step writes
// into the installation row, what it prints, and — the property the whole
// scheme rests on — that the row never holds the value it printed.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import {
  bootstrapTokenMatches,
  hashBootstrapToken,
  issueBootstrapToken,
  printBootstrapToken,
  readInstallation,
} from '../bootstrap.ts';

const db = await reachableDb();

describe.skipIf(!db)('the bootstrap token', () => {
  let scratch: Awaited<ReturnType<typeof createScratchSchema>>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    scratch = await createScratchSchema(db);
    await provisionScratchSchema(scratch.pool);
  });
  afterAll(async () => {
    await scratch.dispose();
  });

  beforeEach(async () => {
    // Each case starts from the state a freshly applied database is in: the
    // DDL alone, with no installation row at all.
    await scratch.pool.query('delete from installation');
  });

  const storedRow = async () =>
    await scratch.pool.query<{
      bootstrap_token_hash: string | null;
      bootstrap_token_issued_at: Date | null;
      owner_user_id: string | null;
      name: string | null;
    }>('select * from installation where id = 1');

  const seedUser = async (id: string): Promise<string> => {
    await scratch.pool.query(
      `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       values ($1, 'Owner', $2, true, now(), now())`,
      [id, `${id}@example.test`],
    );
    return id;
  };

  it('creates the installation row and arms it', async () => {
    expect(await readInstallation(scratch.pool)).toBeNull();

    const outcome = await issueBootstrapToken(scratch.pool);

    expect(outcome.kind).toBe('issued');
    const row = (await storedRow()).rows[0];
    expect(row).toBeDefined();
    expect(row?.owner_user_id).toBeNull();
    expect(row?.name).toBeNull();
    expect(row?.bootstrap_token_issued_at).toBeInstanceOf(Date);
  });

  it('stores the hash and never the token', async () => {
    const outcome = await issueBootstrapToken(scratch.pool);
    if (outcome.kind !== 'issued') throw new Error('expected a token');

    const stored = (await storedRow()).rows[0]?.bootstrap_token_hash;
    // The stored value is not the token, is not derivable by reading it, and
    // is the hash the verifier computes. A hash function swapped for the
    // identity function fails all three.
    expect(stored).not.toBe(outcome.token);
    expect(stored).not.toContain(outcome.token);
    expect(stored).toBe(hashBootstrapToken(outcome.token));
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    // 32 CSPRNG bytes, base64url.
    expect(outcome.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(bootstrapTokenMatches(outcome.token, stored ?? null)).toBe(true);
    expect(bootstrapTokenMatches(`${outcome.token}x`, stored ?? null)).toBe(
      false,
    );
  });

  it('rotates the token when run again on an ownerless instance', async () => {
    const first = await issueBootstrapToken(scratch.pool);
    if (first.kind !== 'issued') throw new Error('expected a token');
    const firstHash = (await storedRow()).rows[0]?.bootstrap_token_hash;

    const second = await issueBootstrapToken(scratch.pool);
    if (second.kind !== 'issued') throw new Error('expected a token');

    // A lost token is recoverable by running the schema step again — and the
    // one it replaces stops working, which is what makes that safe.
    expect(second.token).not.toBe(first.token);
    const secondHash = (await storedRow()).rows[0]?.bootstrap_token_hash;
    expect(secondHash).not.toBe(firstHash);
    expect(bootstrapTokenMatches(first.token, secondHash ?? null)).toBe(false);
    expect(bootstrapTokenMatches(second.token, secondHash ?? null)).toBe(true);
  });

  it('issues nothing once the instance has an owner', async () => {
    await issueBootstrapToken(scratch.pool);
    const ownerId = await seedUser('owner-1');
    await scratch.pool.query(
      `update installation
          set owner_user_id = $1,
              name = 'Owned',
              bootstrap_token_hash = null,
              bootstrap_token_issued_at = null
        where id = 1`,
      [ownerId],
    );

    const outcome = await issueBootstrapToken(scratch.pool);

    expect(outcome).toEqual({ kind: 'owned' });
    const row = (await storedRow()).rows[0];
    expect(row?.bootstrap_token_hash).toBeNull();
    expect(row?.bootstrap_token_issued_at).toBeNull();
    expect(row?.owner_user_id).toBe(ownerId);
    expect(row?.name).toBe('Owned');
  });

  it('refuses to hold a token on an owned instance', async () => {
    await issueBootstrapToken(scratch.pool);
    const ownerId = await seedUser('owner-2');
    // The constraint, not the command: re-arming a live instance is refused by
    // the database, so no later write can reopen first-run setup.
    await expect(
      scratch.pool.query(`update installation set owner_user_id = $1`, [
        ownerId,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('reads back as the domain layer sees it', async () => {
    const outcome = await issueBootstrapToken(scratch.pool);
    if (outcome.kind !== 'issued') throw new Error('expected a token');

    expect(await readInstallation(scratch.pool)).toEqual({
      name: null,
      ownerUserId: null,
      bootstrapTokenHash: hashBootstrapToken(outcome.token),
    });
  });

  it('is issued by the schema step alone, never by the server', async () => {
    // The application role serves `/setup`, so it may UPDATE the row — but it
    // must not be able to create one, which is what arming an instance is.
    await expect(
      scratch.app.query('insert into installation (id) values (1)'),
    ).rejects.toMatchObject({ code: '42501' });
    await issueBootstrapToken(scratch.pool);
    await expect(
      scratch.app.query('delete from installation'),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      scratch.maintenance.query(
        `update installation set name = 'Renamed' where id = 1`,
      ),
    ).rejects.toMatchObject({ code: '42501' });
    // Maintenance reads it: readiness and garbage collection run as that role.
    expect(await readInstallation(scratch.maintenance)).not.toBeNull();
  });

  it('refuses to let the application reopen a closed instance', async () => {
    await issueBootstrapToken(scratch.pool);
    const ownerId = await seedUser('owner-3');
    // Claiming the instance is the application's own legitimate write, so it
    // has to go through the application role for this case to mean anything.
    const claimed = await scratch.app.query(
      `update installation
          set owner_user_id = $1,
              name = 'Owned',
              bootstrap_token_hash = null,
              bootstrap_token_issued_at = null
        where id = 1 and owner_user_id is null`,
      [ownerId],
    );
    expect(claimed.rowCount).toBe(1);

    // Table-level UPDATE is column-blind, so the grant alone would let the web
    // process return the instance to first-run state and then set itself up
    // again. Both halves of that are refused in the database.
    await expect(
      scratch.app.query('update installation set owner_user_id = null'),
    ).rejects.toMatchObject({ code: 'P0001' });
    await expect(
      scratch.app.query(
        `update installation
            set bootstrap_token_hash = repeat('a', 64),
                bootstrap_token_issued_at = now()`,
      ),
    ).rejects.toMatchObject({ code: 'P0001' });

    // Nothing moved, and the instance is still owned by the same account.
    expect(await readInstallation(scratch.pool)).toEqual({
      name: 'Owned',
      ownerUserId: ownerId,
      bootstrapTokenHash: null,
    });
    // The login is unaffected — but an owned instance still issues nothing, so
    // the two refusals together are what close the loop.
    expect(await issueBootstrapToken(scratch.pool)).toEqual({ kind: 'owned' });
  });

  it('lets the login re-arm an instance nobody has claimed', async () => {
    // The other side of the trigger: the schema step connects as the login,
    // whose writes are exactly what first-run bootstrap depends on.
    const first = await issueBootstrapToken(scratch.pool);
    if (first.kind !== 'issued') throw new Error('expected a token');
    const again = await issueBootstrapToken(scratch.pool);
    expect(again.kind).toBe('issued');
    expect(
      (await readInstallation(scratch.pool))?.bootstrapTokenHash,
    ).not.toBeNull();
  });
});

describe('the printed block', () => {
  const printed = (
    outcome: Parameters<typeof printBootstrapToken>[0],
    publicUrl?: string,
  ): string => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      printBootstrapToken(outcome, publicUrl);
      return log.mock.calls.map((call) => String(call[0])).join('\n');
    } finally {
      log.mockRestore();
    }
  };

  it('names the token, where it is spent, and that it is shown once', () => {
    // Printing is the token's only channel, so what the block says is part of
    // the contract an operator follows.
    const block = printed(
      { kind: 'issued', token: 'a-token' },
      'https://studio.example.org/',
    );

    expect(block).toContain('a-token');
    expect(block).toContain('https://studio.example.org/setup');
    expect(block).toContain('only time it is shown');
  });

  it('still names the path with no public URL configured', () => {
    const block = printed({ kind: 'issued', token: 'a-token' });

    expect(block).toContain('/setup');
    expect(block).not.toContain('undefined');
  });

  it('prints nothing for an owned instance', () => {
    // Every later deploy runs the schema step again; an instance somebody owns
    // has no token, and must not print a line suggesting otherwise.
    expect(printed({ kind: 'owned' })).toBe('');
  });
});
