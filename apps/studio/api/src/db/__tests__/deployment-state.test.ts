import { assert, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { describe } from 'vitest';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import {
  maintenanceAffected,
  ownerAffected,
  ownerRows,
  refusalOf,
  tenantAffected,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import { readDeploymentState, setMaintenance } from '../deployment-state.ts';
import { MaintenanceScope, UntenantedScope } from '../tenant.ts';

const storedRow = ownerRows<{ maintenance: boolean; reason: string | null }>(
  'select maintenance, reason from deployment_state',
);

describe.skipIf(!testDb)('deployment_state', () => {
  layer(TestDatabaseLive, { excludeTestServices: true })(
    'over a scratch schema',
    (it) => {
      it.effect('is read by the application role', () =>
        Effect.gen(function* () {
          const state = yield* readDeploymentState();
          assert.strictEqual(state.maintenance, false);
          assert.isNull(state.reason);
          assert.instanceOf(state.updatedAt, Date);
        }),
      );

      it.effect('is read under the application role’s grants', () =>
        Effect.gen(function* () {
          yield* ownerAffected(
            `revoke select on deployment_state from ${TENANT_ROLES.app}`,
          );
          const refusal = yield* refusalOf(readDeploymentState()).pipe(
            Effect.ensuring(
              Effect.orDie(
                ownerAffected(
                  `grant select on deployment_state to ${TENANT_ROLES.app}`,
                ),
              ),
            ),
          );
          assert.strictEqual(refusal.state, '42501');
        }),
      );

      it.effect('is not written by the application role', () =>
        Effect.gen(function* () {
          const refusal = yield* refusalOf(
            UntenantedScope.open(
              setMaintenance({ maintenance: true, reason: 'Upgrading' }),
            ),
          );
          assert.strictEqual(refusal.state, '42501');
          assert.deepStrictEqual(yield* storedRow, [
            { maintenance: false, reason: null },
          ]);
        }),
      );

      it.effect(
        'is written by the maintenance role, answering with the row it wrote',
        () =>
          Effect.gen(function* () {
            const before = yield* readDeploymentState();

            const entered = yield* MaintenanceScope.open(
              setMaintenance({ maintenance: true, reason: 'Upgrading' }),
            );
            assert.strictEqual(entered.maintenance, true);
            assert.strictEqual(entered.reason, 'Upgrading');
            assert.isAbove(
              entered.updatedAt.getTime(),
              before.updatedAt.getTime(),
            );
            assert.deepStrictEqual(yield* storedRow, [
              { maintenance: true, reason: 'Upgrading' },
            ]);
            assert.deepStrictEqual(yield* readDeploymentState(), entered);

            const left = yield* MaintenanceScope.open(
              setMaintenance({ maintenance: false }),
            );
            assert.strictEqual(left.maintenance, false);
            assert.isNull(left.reason);
            assert.deepStrictEqual(yield* storedRow, [
              { maintenance: false, reason: null },
            ]);
          }),
      );

      it.effect('stays one row', () =>
        Effect.gen(function* () {
          const second = yield* refusalOf(
            ownerAffected('insert into deployment_state (id) values (2)'),
          );
          assert.strictEqual(
            second.constraint,
            'deployment_state_singleton_check',
          );

          for (const statement of [
            'insert into deployment_state (id) values (2)',
            'delete from deployment_state',
          ]) {
            const byMaintenance = yield* refusalOf(
              maintenanceAffected(statement),
            );
            assert.strictEqual(byMaintenance.state, '42501', statement);
            const byApplication = yield* refusalOf(
              tenantAffected('team-deployment-state', statement),
            );
            assert.strictEqual(byApplication.state, '42501', statement);
          }

          assert.deepStrictEqual(yield* storedRow, [
            { maintenance: false, reason: null },
          ]);
        }),
      );
    },
  );
});
