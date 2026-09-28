import { assert, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { describe } from 'vitest';

import {
  ownerRows,
  refusalOf,
  TestDatabase,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import { MaintenanceDatabase } from '../../db/client.ts';
import { readDeploymentState } from '../../db/deployment-state.ts';
import { MaintenanceState } from '../../platform/maintenance-state.ts';
import {
  applyMaintenanceWindow,
  parseMaintenanceArguments,
} from '../maintenance.ts';

// `studio-api maintenance on|off` against a scratch schema: the arguments as
// the entry hands them over, and the write on the command's own client. The
// process around it — the environment, the exit codes, what a refusal prints —
// is src/__tests__/command-entrypoints.test.ts's. The cases share one row and
// put it back.

const storedRow = ownerRows<{ maintenance: boolean; reason: string | null }>(
  'select maintenance, reason from deployment_state',
);

/** The command's work from its arguments, as `MaintenanceProgram` runs it. */
const run = (args: ReadonlyArray<string>) =>
  Effect.flatMap(parseMaintenanceArguments(args), applyMaintenanceWindow);

/** The sentence a refused run prints; a run that succeeds fails the case. */
const refusedWith = (args: ReadonlyArray<string>) =>
  Effect.map(Effect.flip(run(args)), (refusal) => refusal.message);

describe.skipIf(!testDb)('the maintenance command', () => {
  layer(TestDatabaseLive, { excludeTestServices: true })(
    'over a scratch schema',
    (it) => {
      it.effect('opens a window with its reason, and closes it', () =>
        Effect.gen(function* () {
          const opened = yield* run(['on', 'Upgrading', 'to', '0.3']);
          assert.strictEqual(opened.maintenance, true);
          assert.strictEqual(opened.reason, 'Upgrading to 0.3');
          assert.deepStrictEqual(yield* storedRow, [
            { maintenance: true, reason: 'Upgrading to 0.3' },
          ]);
          // What the web process reads, as the application role.
          const read = yield* readDeploymentState();
          assert.strictEqual(read.maintenance, true);
          assert.strictEqual(read.reason, 'Upgrading to 0.3');

          const closed = yield* run(['off']);
          assert.strictEqual(closed.maintenance, false);
          assert.isNull(closed.reason);
          assert.deepStrictEqual(yield* storedRow, [
            { maintenance: false, reason: null },
          ]);
        }),
      );

      it.effect('opens a window with no reason', () =>
        Effect.gen(function* () {
          yield* run(['on']);
          assert.deepStrictEqual(yield* storedRow, [
            { maintenance: true, reason: null },
          ]);
          yield* run(['off']);
        }),
      );

      it.effect(
        'refuses a reason the row would refuse, before touching it',
        () =>
          Effect.gen(function* () {
            for (const args of [
              ['on', '   '],
              ['on', 'x'.repeat(281)],
              ['on', '\t', '\n'],
            ]) {
              assert.strictEqual(
                yield* refusedWith(args),
                'The maintenance reason must be 1 to 280 characters and not only whitespace.',
                JSON.stringify(args),
              );
            }
            // The longest reason the check admits is admitted.
            yield* run(['on', 'x'.repeat(280)]);
            yield* run(['off']);
            assert.deepStrictEqual(yield* storedRow, [
              { maintenance: false, reason: null },
            ]);
          }),
      );

      it.effect('refuses anything but on and off', () =>
        Effect.gen(function* () {
          for (const args of [[], ['ON'], ['sideways'], ['off', 'now']]) {
            assert.strictEqual(
              yield* refusedWith(args),
              'Usage: studio-api maintenance on [reason…] | off',
              JSON.stringify(args),
            );
          }
          assert.deepStrictEqual(yield* storedRow, [
            { maintenance: false, reason: null },
          ]);
        }),
      );

      // Both readers see what the command wrote, each on its own client: the
      // web process's gate as the application role, the worker's pause on
      // the maintenance client it runs every job on.
      it.effect('is read by the web process and by the worker', () =>
        Effect.gen(function* () {
          const flags = Effect.gen(function* () {
            const read = MaintenanceState.use((state) => state.read);
            const web = yield* read.pipe(
              Effect.provide(MaintenanceState.layer),
            );
            const worker = yield* read.pipe(
              Effect.provide(MaintenanceState.layerMaintenance),
            );
            return { web, worker };
          });

          yield* run(['on', 'Upgrading']);
          const on = { maintenance: true, reason: 'Upgrading' };
          assert.deepStrictEqual(yield* flags, { web: on, worker: on });

          yield* run(['off']);
          const off = { maintenance: false, reason: null };
          assert.deepStrictEqual(yield* flags, { web: off, worker: off });
        }),
      );

      // The write is the maintenance role's alone: the same command handed
      // the application client in the maintenance client's place is refused
      // by the grants, not by anything the command checks.
      it.effect('cannot be run as the application role', () =>
        Effect.gen(function* () {
          const { app } = yield* TestDatabase;
          const refusal = yield* refusalOf(
            run(['on', 'Upgrading']).pipe(
              Effect.provideService(MaintenanceDatabase, app),
            ),
          );
          assert.strictEqual(refusal.state, '42501');
          assert.deepStrictEqual(yield* storedRow, [
            { maintenance: false, reason: null },
          ]);
        }),
      );
    },
  );
});
