import { assert, layer } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { describe } from 'vitest';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import {
  maintenanceAffected,
  ownerAffected,
  ownerRows,
  refusalOf,
  tenantAffected,
  TestDatabase,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import {
  claimNotification,
  type LatestRelease,
  readDeploymentState,
  readDeploymentStateAsMaintenance,
  readLatestRelease,
  recordUpdateCheck,
  releaseNotificationClaim,
  setMaintenance,
} from '../deployment-state.ts';
import { MaintenanceScope, UntenantedScope } from '../tenant.ts';

const RELEASE: LatestRelease = {
  version: '1.2.3',
  releasedAt: new Date('2026-10-06T14:30:00.000Z'),
  notesUrl: 'https://releases.networkcanvas.com/studio/1.2.3/notes',
  schemaChange: true,
};

const CLEAR_UPDATE_STATE = `update deployment_state
   set latest_version = null, latest_released_at = null,
       latest_notes_url = null, latest_schema_change = null,
       checked_at = null, notified_version = null,
       maintenance = false, reason = null`;

const storedNotified = ownerRows<{ notified_version: string | null }>(
  'select notified_version from deployment_state',
);

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

      it.effect(
        'gives up a read queued behind a held lock on the server, within its second',
        () =>
          Effect.scoped(
            Effect.gen(function* () {
              const harness = yield* TestDatabase;
              const held = yield* harness.owner.sql.reserve;
              yield* Effect.acquireRelease(held.executeRaw('BEGIN', []), () =>
                Effect.ignore(held.executeRaw('ROLLBACK', [])),
              );
              yield* held.executeRaw(
                'LOCK TABLE deployment_state IN ACCESS EXCLUSIVE MODE',
                [],
              );

              const refusal = yield* refusalOf(
                readDeploymentState().pipe(Effect.timeout('5 seconds')),
              );
              assert.strictEqual(refusal.state, '57014');
              assert.match(refusal.message, /statement timeout/);
            }),
          ),
        { timeout: 30_000 },
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

      // The api of a new image boots between `up -d` and `migrate`, against the
      // older schema. A release that adds or renames a `latest_*` column must
      // not make the maintenance flag unreadable then: the gate would answer
      // OFF and readiness would name the schema, not the window (#1901).
      it.effect(
        'reads the flag against a schema whose release columns have changed',
        () =>
          Effect.gen(function* () {
            yield* ownerAffected(CLEAR_UPDATE_STATE);
            yield* MaintenanceScope.open(
              setMaintenance({ maintenance: true, reason: 'Upgrading' }),
            );
            yield* ownerAffected(
              'alter table deployment_state rename column latest_schema_change to latest_schema_change_renamed',
            );
            const restore = Effect.orDie(
              ownerAffected(
                'alter table deployment_state rename column latest_schema_change_renamed to latest_schema_change',
              ),
            );
            const [flag, asMaintenance, release] = yield* Effect.all([
              Effect.exit(readDeploymentState()),
              Effect.exit(readDeploymentStateAsMaintenance()),
              Effect.exit(readLatestRelease()),
            ]).pipe(Effect.ensuring(restore));
            yield* ownerAffected(CLEAR_UPDATE_STATE);

            assert.isTrue(Exit.isSuccess(flag), 'the application role read');
            assert.isTrue(
              Exit.isSuccess(asMaintenance),
              'the maintenance role read',
            );
            if (Exit.isSuccess(flag)) {
              assert.strictEqual(flag.value.maintenance, true);
              assert.strictEqual(flag.value.reason, 'Upgrading');
            }
            // The release read is the one that depends on the release columns.
            assert.isTrue(Exit.isFailure(release));
          }),
      );

      it.effect('reads as no release until a check has recorded one', () =>
        Effect.gen(function* () {
          yield* ownerAffected(CLEAR_UPDATE_STATE);
          assert.isNull(yield* readLatestRelease());
        }),
      );

      it.effect(
        'records a release as the maintenance role and reads it as the application role',
        () =>
          Effect.gen(function* () {
            yield* ownerAffected(CLEAR_UPDATE_STATE);
            yield* MaintenanceScope.open(recordUpdateCheck(RELEASE));

            assert.deepStrictEqual(yield* readLatestRelease(), RELEASE);
            const rows = yield* ownerRows<{ checked_at: Date | null }>(
              'select checked_at from deployment_state',
            );
            assert.instanceOf(rows[0]?.checked_at, Date);
            yield* ownerAffected(CLEAR_UPDATE_STATE);
          }),
      );

      it.effect(
        'records a release without touching the flag, its reason or its date',
        () =>
          Effect.gen(function* () {
            yield* ownerAffected(CLEAR_UPDATE_STATE);
            yield* MaintenanceScope.open(
              setMaintenance({ maintenance: true, reason: 'Upgrading' }),
            );
            const before = yield* readDeploymentState();

            yield* MaintenanceScope.open(recordUpdateCheck(RELEASE));

            assert.deepStrictEqual(yield* readDeploymentState(), before);
            assert.strictEqual(before.maintenance, true);
            assert.strictEqual(before.reason, 'Upgrading');
            yield* ownerAffected(CLEAR_UPDATE_STATE);
          }),
      );

      it.effect(
        'is not written, in any column of it, by the application role',
        () =>
          Effect.gen(function* () {
            yield* ownerAffected(CLEAR_UPDATE_STATE);
            const writes = {
              'the release columns': recordUpdateCheck(RELEASE),
              'the claim': Effect.asVoid(claimNotification('1.2.3')),
              'the claim’s release': releaseNotificationClaim('1.2.3', {
                previous: null,
              }),
            };
            for (const [name, write] of Object.entries(writes)) {
              const refusal = yield* refusalOf(UntenantedScope.open(write));
              assert.strictEqual(refusal.state, '42501', name);
            }
            assert.isNull(yield* readLatestRelease());
            assert.isNull((yield* storedNotified)[0]?.notified_version);
          }),
      );

      it.effect(
        'claims a version once, a later version again, and never one older than the newest claimed',
        () =>
          Effect.gen(function* () {
            yield* ownerAffected(CLEAR_UPDATE_STATE);
            const claim = (version: string) =>
              MaintenanceScope.open(claimNotification(version));

            assert.deepStrictEqual(yield* claim('1.2.3'), { previous: null });
            assert.isNull(yield* claim('1.2.3'));
            assert.deepStrictEqual(yield* claim('1.2.4'), {
              previous: '1.2.3',
            });
            assert.isNull(yield* claim('1.2.4'));
            // The manifest went back — a stale CDN answer, a withdrawn
            // release — to one already mailed: not again.
            assert.isNull(yield* claim('1.2.3'));
            assert.isNull(yield* claim('1.1.9'));
            assert.strictEqual(
              (yield* storedNotified)[0]?.notified_version,
              '1.2.4',
            );
            yield* ownerAffected(CLEAR_UPDATE_STATE);
          }),
      );

      it.effect(
        'gives back only the claim it is asked about, to the version mailed before it',
        () =>
          Effect.gen(function* () {
            yield* ownerAffected(CLEAR_UPDATE_STATE);
            yield* MaintenanceScope.open(claimNotification('1.2.3'));
            const taken = yield* MaintenanceScope.open(
              claimNotification('1.2.4'),
            );
            assert.deepStrictEqual(taken, { previous: '1.2.3' });
            if (taken === null) throw new Error('unreachable');

            yield* MaintenanceScope.open(
              releaseNotificationClaim('1.2.5', taken),
            );
            assert.strictEqual(
              (yield* storedNotified)[0]?.notified_version,
              '1.2.4',
            );

            yield* MaintenanceScope.open(
              releaseNotificationClaim('1.2.4', taken),
            );
            assert.strictEqual(
              (yield* storedNotified)[0]?.notified_version,
              '1.2.3',
            );
            // Given back, 1.2.4 can be claimed again; 1.2.3 still cannot.
            assert.isNull(
              yield* MaintenanceScope.open(claimNotification('1.2.3')),
            );
            assert.deepStrictEqual(
              yield* MaintenanceScope.open(claimNotification('1.2.4')),
              { previous: '1.2.3' },
            );
            yield* ownerAffected(CLEAR_UPDATE_STATE);
          }),
      );

      it.effect(
        'keeps the four release columns together, the version x.y.z and the link https',
        () =>
          Effect.gen(function* () {
            yield* ownerAffected(CLEAR_UPDATE_STATE);
            const refused = [
              "update deployment_state set latest_version = '1.2.3'",
              "update deployment_state set latest_version = 'v1.2.3', latest_released_at = now(), latest_notes_url = 'https://x.test/', latest_schema_change = false",
              "update deployment_state set latest_version = '1.2.3', latest_released_at = now(), latest_notes_url = 'http://x.test/', latest_schema_change = false",
            ];
            for (const statement of refused) {
              const refusal = yield* refusalOf(ownerAffected(statement));
              assert.strictEqual(
                refusal.constraint,
                'deployment_state_latest_release_check',
                statement,
              );
            }
            assert.isNull(yield* readLatestRelease());
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
