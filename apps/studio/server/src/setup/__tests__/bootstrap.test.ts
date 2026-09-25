// The token half of first-run bootstrap (#1909): what the schema step writes
// into the installation row, what it prints, and — the property the whole
// scheme rests on — that the row never holds the value it printed.
//
// Which identity runs which statement is half of what is asserted here, and
// the scopes are how the suite picks one: a bare statement outside a
// transaction runs as the connecting login whatever client sent it, because
// rc.115 has no startup parameter to pin a role with (fallback A). So every
// case that means "the application role may not do this" opens
// `UntenantedScope`, and every case that means "maintenance may not" opens
// `MaintenanceScope` — the same seams production uses.
import { assert, layer } from '@effect/vitest';
import { Cause, Effect, Exit } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  TestDatabase,
  TestDatabaseLive,
  testDb,
  maintenanceRows,
} from '../../__tests__/support/database.ts';
import { sqlState } from '../../db/errors.ts';
import {
  MaintenanceScope,
  OwnerScope,
  Transaction,
  UntenantedScope,
} from '../../db/tenant.ts';
import {
  bootstrapTokenMatches,
  hashBootstrapToken,
  issueBootstrapToken,
  printBootstrapToken,
  readInstallation,
} from '../bootstrap.ts';

/** The SQLSTATE a refusal carries, or undefined when nothing was refused. */
const refusal = (exit: Exit.Exit<unknown, unknown>): string | undefined =>
  Exit.isFailure(exit) ? sqlState(Cause.squash(exit.cause)) : undefined;

const INSUFFICIENT_PRIVILEGE = '42501';
const CHECK_VIOLATION = '23514';
const RAISE_EXCEPTION = 'P0001';

/** One statement as the application role, which is what `/setup` is served as. */
const asApplication = (statement: string) =>
  UntenantedScope.open(
    Effect.flatMap(Transaction, ({ sql }) => sql.unsafe(statement)),
  );

describe.skipIf(!testDb)('the bootstrap token', () => {
  layer(TestDatabaseLive)('over a provisioned schema', (suite) => {
    /** Each case starts from the state a freshly applied database is in. */
    const fresh = Effect.gen(function* () {
      const harness = yield* TestDatabase;
      yield* harness.onOwner(harness.owner.sql`delete from installation`);
      return harness;
    });

    /**
     * The row as the database holds it.
     *
     * `bootstrap_token_issued_at` is read as a boolean rather than as an
     * instant: this is a raw statement, and rc.115 decodes `timestamptz` as
     * epoch milliseconds rather than as a `Date` (fallback A). "There is an
     * issue time" is what every case here means by it anyway.
     */
    const storedRow = Effect.fnUntraced(function* () {
      const harness = yield* TestDatabase;
      const rows = yield* harness.onOwner(
        harness.owner.sql<{
          bootstrap_token_hash: string | null;
          issued: boolean;
          owner_user_id: string | null;
          name: string | null;
        }>`select bootstrap_token_hash,
                  bootstrap_token_issued_at is not null as issued,
                  owner_user_id, name
             from installation where id = 1`,
      );
      return rows[0];
    });

    const seedUser = Effect.fnUntraced(function* (id: string) {
      const harness = yield* TestDatabase;
      yield* harness.onOwner(
        harness.owner
          .sql`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
               values (${id}, 'Owner', ${`${id}@example.test`}, true, now(), now())`,
      );
      return id;
    });

    /** The schema step's own call: the connecting login, in one transaction. */
    const issue = OwnerScope.open(issueBootstrapToken());

    suite.effect('creates the installation row and arms it', () =>
      Effect.gen(function* () {
        yield* fresh;
        assert.isNull(yield* OwnerScope.open(readInstallation()));

        const outcome = yield* issue;

        assert.strictEqual(outcome.kind, 'issued');
        const row = yield* storedRow();
        assert.isDefined(row);
        assert.isNull(row?.owner_user_id ?? null);
        assert.isNull(row?.name ?? null);
        assert.isTrue(row?.issued);
      }),
    );

    suite.effect('stores the hash and never the token', () =>
      Effect.gen(function* () {
        yield* fresh;
        const outcome = yield* issue;
        if (outcome.kind !== 'issued') throw new Error('expected a token');

        const stored = (yield* storedRow())?.bootstrap_token_hash ?? null;
        // The stored value is not the token, is not derivable by reading it,
        // and is the hash the verifier computes. A hash function swapped for
        // the identity function fails all three.
        assert.notStrictEqual(stored, outcome.token);
        assert.notInclude(stored ?? '', outcome.token);
        assert.strictEqual(stored, hashBootstrapToken(outcome.token));
        assert.match(stored ?? '', /^[0-9a-f]{64}$/);
        // 32 CSPRNG bytes, base64url.
        assert.match(outcome.token, /^[A-Za-z0-9_-]{43}$/);
        assert.isTrue(bootstrapTokenMatches(outcome.token, stored));
        assert.isFalse(bootstrapTokenMatches(`${outcome.token}x`, stored));
      }),
    );

    suite.effect(
      'rotates the token when run again on an ownerless instance',
      () =>
        Effect.gen(function* () {
          yield* fresh;
          const first = yield* issue;
          if (first.kind !== 'issued') throw new Error('expected a token');
          const firstHash = (yield* storedRow())?.bootstrap_token_hash ?? null;

          const second = yield* issue;
          if (second.kind !== 'issued') throw new Error('expected a token');

          // A lost token is recoverable by running the schema step again — and
          // the one it replaces stops working, which is what makes that safe.
          assert.notStrictEqual(second.token, first.token);
          const secondHash = (yield* storedRow())?.bootstrap_token_hash ?? null;
          assert.notStrictEqual(secondHash, firstHash);
          assert.isFalse(bootstrapTokenMatches(first.token, secondHash));
          assert.isTrue(bootstrapTokenMatches(second.token, secondHash));
        }),
    );

    suite.effect('issues nothing once the instance has an owner', () =>
      Effect.gen(function* () {
        const harness = yield* fresh;
        yield* issue;
        const ownerId = yield* seedUser('owner-1');
        yield* harness.onOwner(
          harness.owner.sql`update installation
                               set owner_user_id = ${ownerId},
                                   name = 'Owned',
                                   bootstrap_token_hash = null,
                                   bootstrap_token_issued_at = null
                             where id = 1`,
        );

        assert.deepStrictEqual(yield* issue, { kind: 'owned' });
        const row = yield* storedRow();
        assert.isNull(row?.bootstrap_token_hash ?? null);
        assert.isFalse(row?.issued);
        assert.strictEqual(row?.owner_user_id, ownerId);
        assert.strictEqual(row?.name, 'Owned');
      }),
    );

    suite.effect('refuses to hold a token on an owned instance', () =>
      Effect.gen(function* () {
        const harness = yield* fresh;
        yield* issue;
        const ownerId = yield* seedUser('owner-2');
        // The constraint, not the command: re-arming a live instance is
        // refused by the database, so no later write can reopen first-run
        // setup.
        const claimed = yield* Effect.exit(
          harness.onOwner(
            harness.owner
              .sql`update installation set owner_user_id = ${ownerId}`,
          ),
        );
        assert.strictEqual(refusal(claimed), CHECK_VIOLATION);
      }),
    );

    suite.effect('reads back as the domain layer sees it', () =>
      Effect.gen(function* () {
        yield* fresh;
        const outcome = yield* issue;
        if (outcome.kind !== 'issued') throw new Error('expected a token');

        assert.deepStrictEqual(yield* OwnerScope.open(readInstallation()), {
          name: null,
          ownerUserId: null,
          bootstrapTokenHash: hashBootstrapToken(outcome.token),
        });
      }),
    );

    suite.effect(
      'is issued by the schema step alone, never by the server',
      () =>
        Effect.gen(function* () {
          yield* fresh;
          // The application role serves `/setup`, so it may UPDATE the row — but
          // it must not be able to create one, which is what arming an instance
          // is.
          assert.strictEqual(
            refusal(
              yield* Effect.exit(
                asApplication('insert into installation (id) values (1)'),
              ),
            ),
            INSUFFICIENT_PRIVILEGE,
          );
          yield* issue;
          assert.strictEqual(
            refusal(
              yield* Effect.exit(asApplication('delete from installation')),
            ),
            INSUFFICIENT_PRIVILEGE,
          );
          assert.strictEqual(
            refusal(
              yield* Effect.exit(
                maintenanceRows(
                  `update installation set name = 'Renamed' where id = 1`,
                ),
              ),
            ),
            INSUFFICIENT_PRIVILEGE,
          );
          // Maintenance reads it: readiness and garbage collection run as that
          // role.
          assert.isNotNull(yield* MaintenanceScope.open(readInstallation()));
        }),
    );

    suite.effect(
      'refuses to let the application reopen a closed instance',
      () =>
        Effect.gen(function* () {
          yield* fresh;
          yield* issue;
          const ownerId = yield* seedUser('owner-3');
          // Claiming the instance is the application's own legitimate write, so
          // it has to go through the application role for this case to mean
          // anything.
          yield* asApplication(
            `update installation
              set owner_user_id = '${ownerId}',
                  name = 'Owned',
                  bootstrap_token_hash = null,
                  bootstrap_token_issued_at = null
            where id = 1 and owner_user_id is null`,
          );
          assert.strictEqual(
            (yield* OwnerScope.open(readInstallation()))?.ownerUserId,
            ownerId,
          );

          // Table-level UPDATE is column-blind, so the grant alone would let the
          // web process return the instance to first-run state and then set
          // itself up again. Both halves of that are refused in the database.
          assert.strictEqual(
            refusal(
              yield* Effect.exit(
                asApplication('update installation set owner_user_id = null'),
              ),
            ),
            RAISE_EXCEPTION,
          );
          assert.strictEqual(
            refusal(
              yield* Effect.exit(
                asApplication(
                  `update installation
                    set bootstrap_token_hash = repeat('a', 64),
                        bootstrap_token_issued_at = now()`,
                ),
              ),
            ),
            RAISE_EXCEPTION,
          );

          // Nothing moved, and the instance is still owned by the same account.
          assert.deepStrictEqual(yield* OwnerScope.open(readInstallation()), {
            name: 'Owned',
            ownerUserId: ownerId,
            bootstrapTokenHash: null,
          });
          // The login is unaffected — but an owned instance still issues
          // nothing, so the two refusals together are what close the loop.
          assert.deepStrictEqual(yield* issue, { kind: 'owned' });
        }),
    );

    suite.effect('lets the login re-arm an instance nobody has claimed', () =>
      Effect.gen(function* () {
        yield* fresh;
        // The other side of the trigger: the schema step connects as the
        // login, whose writes are exactly what first-run bootstrap depends on.
        const first = yield* issue;
        if (first.kind !== 'issued') throw new Error('expected a token');
        assert.strictEqual((yield* issue).kind, 'issued');
        assert.isNotNull(
          (yield* OwnerScope.open(readInstallation()))?.bootstrapTokenHash ??
            null,
        );
      }),
    );
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
