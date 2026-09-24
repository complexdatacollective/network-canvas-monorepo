// The webhook module's database-enforced promises: the https-only callback
// URL, the bounded event filter, the disable/failure bookkeeping, the
// Standard Webhooks dedup key, the composite foreign keys that keep a
// subscription and its deliveries inside one team, and the two sidecar
// triggers that freeze a queued delivery's payload and addressing and admit a
// delivery only for an active subscription that asks for its event type.
//
// Every case asserts the rejection Postgres actually raises — the constraint
// name for a CHECK, unique or foreign-key violation, the message for a trigger
// — so a guard that stopped firing cannot pass as "no error".
import { randomBytes, randomUUID } from 'node:crypto';

import { layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { describe, expect } from 'vitest';

import {
  insertTeam,
  ownerAffected,
  ownerRows,
  refusalOf,
  TestDatabaseLive,
  testDb,
  ownerInsert,
  tenantRows,
} from '../../__tests__/support/database.ts';
import { MaintenanceScope, Transaction } from '../../db/tenant.ts';

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

type Row = Record<string, unknown>;

/** One study per team, for the optional study-scoped subscription pin. */
const studyOf: Record<string, string> = {
  [TEAM_A]: randomUUID(),
  [TEAM_B]: randomUUID(),
};
/** One subscription per team, so cross-team delivery pins have a target. */
const subscriptionOf: Record<string, string> = {
  [TEAM_A]: randomUUID(),
  [TEAM_B]: randomUUID(),
};

const subscriptionRow = (overrides: Row = {}): Row => ({
  id: randomUUID(),
  team_id: TEAM_A,
  url: 'https://hooks.example.org/studio',
  event_types: ['interview.completed'],
  secret_ciphertext: randomBytes(48),
  secret_key_id: 'integration-key-1',
  created_by_user_id: 'user-1',
  ...overrides,
});

const deliveryRow = (subscriptionId: string, overrides: Row = {}): Row => ({
  id: randomUUID(),
  team_id: TEAM_A,
  subscription_id: subscriptionId,
  webhook_id: `msg_${randomUUID().replaceAll('-', '')}`,
  event_type: 'interview.completed',
  payload: JSON.stringify({ sessionId: randomUUID(), teamId: TEAM_A }),
  ...overrides,
});

const newSubscription = (overrides: Row = {}) => {
  const row = subscriptionRow(overrides);
  return Effect.as(ownerInsert('webhook_subscriptions', row), row.id as string);
};

const newDelivery = (subscriptionId: string, overrides: Row = {}) => {
  const row = deliveryRow(subscriptionId, overrides);
  return Effect.as(ownerInsert('webhook_deliveries', row), row.id as string);
};

/** Both teams, with a study and a subscription each, once for the file. */
const Fixtures = Layer.effectDiscard(
  Effect.forEach([TEAM_A, TEAM_B], (teamId) =>
    Effect.gen(function* () {
      yield* insertTeam(teamId);
      yield* ownerInsert('studies', {
        id: studyOf[teamId],
        team_id: teamId,
        name: `${teamId} study`,
      });
      yield* ownerInsert(
        'webhook_subscriptions',
        subscriptionRow({ id: subscriptionOf[teamId], team_id: teamId }),
      );
    }),
  ),
).pipe(Layer.provideMerge(TestDatabaseLive));

const UUID = /^[0-9a-f-]{36}$/;

describe.skipIf(!testDb)('webhook schema', () => {
  layer(Fixtures)('over a provisioned schema', (it) => {
    describe('webhook_subscriptions', () => {
      it.effect('applies the documented defaults', () =>
        Effect.gen(function* () {
          const id = yield* newSubscription();

          const rows = yield* ownerRows(
            `SELECT study_id, description, state, consecutive_failures,
                    last_failure_at, disabled_at
             FROM webhook_subscriptions WHERE id = $1`,
            [id],
          );
          expect(rows[0]).toEqual({
            study_id: null,
            description: null,
            state: 'active',
            consecutive_failures: 0,
            last_failure_at: null,
            disabled_at: null,
          });
        }),
      );

      it.effect.each<
        readonly [label: string, overrides: Row, constraint: string]
      >([
        [
          'a plaintext callback',
          { url: 'http://hooks.example.org/studio' },
          'webhook_subscriptions_url_check',
        ],
        [
          'a scheme-relative callback',
          { url: '//hooks.example.org/studio' },
          'webhook_subscriptions_url_check',
        ],
        [
          'a url too short to carry a host',
          { url: 'https://' },
          'webhook_subscriptions_url_check',
        ],
        [
          'a url past 2000 characters',
          { url: `https://hooks.example.org/${'x'.repeat(2000)}` },
          'webhook_subscriptions_url_check',
        ],
        [
          'no event filter at all',
          // The array literal node-postgres sent for `[]`: the driver cannot
          // infer an element type for an empty array, but binds a string
          // untyped, so the backend reads this as the column's `text[]`.
          { event_types: '{}' },
          'webhook_subscriptions_event_types_check',
        ],
        [
          'more than fifty event types',
          { event_types: Array.from({ length: 51 }, (_, i) => `event.${i}`) },
          'webhook_subscriptions_event_types_check',
        ],
        [
          'a null element in the event filter',
          { event_types: ['interview.completed', null] },
          'webhook_subscriptions_event_types_check',
        ],
        [
          'an unknown state',
          { state: 'paused' },
          'webhook_subscriptions_state_check',
        ],
        [
          'a disabled state with no disable timestamp',
          { state: 'disabled' },
          'webhook_subscriptions_state_check',
        ],
        [
          'a disable timestamp on an active subscription',
          { disabled_at: new Date() },
          'webhook_subscriptions_state_check',
        ],
        [
          'a negative failure count',
          { consecutive_failures: -1 },
          'webhook_subscriptions_failures_check',
        ],
        [
          'an empty signing secret',
          { secret_ciphertext: Buffer.alloc(0) },
          'webhook_subscriptions_lengths_check',
        ],
        [
          'a signing secret past 512 bytes',
          { secret_ciphertext: randomBytes(513) },
          'webhook_subscriptions_lengths_check',
        ],
        [
          'a key id past 64 characters',
          { secret_key_id: 'k'.repeat(65) },
          'webhook_subscriptions_lengths_check',
        ],
        [
          'an empty key id',
          { secret_key_id: '' },
          'webhook_subscriptions_lengths_check',
        ],
        [
          'an empty description',
          { description: '' },
          'webhook_subscriptions_lengths_check',
        ],
        [
          'a description past 500 characters',
          { description: 'd'.repeat(501) },
          'webhook_subscriptions_lengths_check',
        ],
        [
          'an author id past 255 characters',
          { created_by_user_id: 'u'.repeat(256) },
          'webhook_subscriptions_lengths_check',
        ],
      ])('rejects %s', ([_label, overrides, constraint]) =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert('webhook_subscriptions', subscriptionRow(overrides)),
          );
          expect(refused.constraint).toBe(constraint);
        }),
      );

      it.effect('accepts the filter bounds the check exists to admit', () =>
        Effect.gen(function* () {
          expect(
            yield* ownerInsert(
              'webhook_subscriptions',
              subscriptionRow({ event_types: ['interview.completed'] }),
            ),
          ).toBe(1);
          expect(
            yield* ownerInsert(
              'webhook_subscriptions',
              subscriptionRow({
                event_types: Array.from({ length: 50 }, (_, i) => `event.${i}`),
              }),
            ),
          ).toBe(1);
        }),
      );

      it.effect('keeps the signing secret recoverable rather than hashed', () =>
        Effect.gen(function* () {
          const secret = randomBytes(60);
          const id = yield* newSubscription({ secret_ciphertext: secret });

          // A verifier could be stored as a digest; a signing key cannot,
          // because every outgoing request has to reproduce it.
          const rows = yield* ownerRows<{ secret_ciphertext: Uint8Array }>(
            `SELECT secret_ciphertext FROM webhook_subscriptions WHERE id = $1`,
            [id],
          );
          // `bytea` decodes as a plain `Uint8Array`; compare the bytes.
          expect(Buffer.from(rows[0]?.secret_ciphertext ?? [])).toEqual(secret);
        }),
      );

      it.effect('moves the state and the disable timestamp together', () =>
        Effect.gen(function* () {
          const id = yield* newSubscription();

          const disabledAlone = yield* refusalOf(
            ownerAffected(
              `UPDATE webhook_subscriptions SET state = 'disabled' WHERE id = $1`,
              [id],
            ),
          );
          expect(disabledAlone.constraint).toBe(
            'webhook_subscriptions_state_check',
          );
          expect(
            yield* ownerAffected(
              `UPDATE webhook_subscriptions
               SET state = 'disabled', disabled_at = now() WHERE id = $1`,
              [id],
            ),
          ).toBe(1);

          // Re-enabling has to clear the marker, or a disabled row and an
          // active one become indistinguishable in the worklist.
          const activeAlone = yield* refusalOf(
            ownerAffected(
              `UPDATE webhook_subscriptions SET state = 'active' WHERE id = $1`,
              [id],
            ),
          );
          expect(activeAlone.constraint).toBe(
            'webhook_subscriptions_state_check',
          );
          expect(
            yield* ownerAffected(
              `UPDATE webhook_subscriptions
               SET state = 'active', disabled_at = NULL, consecutive_failures = 0
               WHERE id = $1`,
              [id],
            ),
          ).toBe(1);
        }),
      );

      it.effect(
        'counts consecutive failures while the subscription stays active',
        () =>
          Effect.gen(function* () {
            const id = yield* newSubscription();

            expect(
              yield* ownerAffected(
                `UPDATE webhook_subscriptions
                 SET consecutive_failures = consecutive_failures + 3,
                     last_failure_at = now()
                 WHERE id = $1`,
                [id],
              ),
            ).toBe(1);
            const counted = yield* ownerRows<{ consecutive_failures: number }>(
              `SELECT consecutive_failures FROM webhook_subscriptions WHERE id = $1`,
              [id],
            );
            expect(counted[0]?.consecutive_failures).toBe(3);

            const refused = yield* refusalOf(
              ownerAffected(
                `UPDATE webhook_subscriptions SET consecutive_failures = -1 WHERE id = $1`,
                [id],
              ),
            );
            expect(refused.constraint).toBe(
              'webhook_subscriptions_failures_check',
            );
          }),
      );

      it.effect('refuses a study pin from another team', () =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert(
              'webhook_subscriptions',
              subscriptionRow({ team_id: TEAM_A, study_id: studyOf[TEAM_B] }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'webhook_subscriptions_study_fk',
            detail: expect.stringContaining(
              'is not present in table "studies"',
            ),
          });
        }),
      );

      it.effect('refuses a subscription written into another team', () =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            tenantRows(
              TEAM_A,
              `INSERT INTO webhook_subscriptions
                 (id, team_id, url, event_types, secret_ciphertext, secret_key_id, created_by_user_id)
               VALUES ($1, $2, 'https://hooks.example.org/x', ARRAY['interview.completed'], $3, 'k', 'u')`,
              [randomUUID(), TEAM_B, randomBytes(32)],
            ),
          );
          expect(refused.state).toBe('42501');
        }),
      );
    });

    describe('webhook_deliveries', () => {
      it.effect('applies the documented defaults', () =>
        Effect.gen(function* () {
          const id = yield* newDelivery(subscriptionOf[TEAM_A] as string);

          const rows = yield* ownerRows(
            `SELECT attempt_count, delivered_at, failed_at, last_status_code,
                    last_error
             FROM webhook_deliveries WHERE id = $1`,
            [id],
          );
          expect(rows[0]).toEqual({
            attempt_count: 0,
            delivered_at: null,
            failed_at: null,
            last_status_code: null,
            last_error: null,
          });
        }),
      );

      it.effect.each<
        readonly [label: string, overrides: Row, constraint: string]
      >([
        [
          'a scalar payload',
          { payload: JSON.stringify(3) },
          'webhook_deliveries_payload_object_check',
        ],
        [
          'an array payload',
          { payload: JSON.stringify([1, 2]) },
          'webhook_deliveries_payload_object_check',
        ],
        [
          'a payload past four kibibytes',
          { payload: JSON.stringify({ body: 'x'.repeat(8000) }) },
          'webhook_deliveries_payload_object_check',
        ],
        [
          'an empty webhook id',
          { webhook_id: '' },
          'webhook_deliveries_lengths_check',
        ],
        [
          'a webhook id past 128 characters',
          { webhook_id: 'w'.repeat(129) },
          'webhook_deliveries_lengths_check',
        ],
        [
          'an event type past 128 characters',
          { event_type: 'e'.repeat(129) },
          'webhook_deliveries_lengths_check',
        ],
        [
          'a negative attempt count',
          { attempt_count: -1 },
          'webhook_deliveries_lengths_check',
        ],
        [
          'a status code below the http range',
          { last_status_code: 99 },
          'webhook_deliveries_lengths_check',
        ],
        [
          'a status code above the http range',
          { last_status_code: 600 },
          'webhook_deliveries_lengths_check',
        ],
        [
          'an error past 1000 characters',
          { last_error: 'e'.repeat(1001) },
          'webhook_deliveries_lengths_check',
        ],
        [
          'both terminal timestamps at once',
          { delivered_at: new Date(), failed_at: new Date() },
          'webhook_deliveries_terminal_state_check',
        ],
      ])('rejects %s', ([_label, overrides, constraint]) =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert(
              'webhook_deliveries',
              deliveryRow(subscriptionOf[TEAM_A] as string, overrides),
            ),
          );
          expect(refused.constraint).toBe(constraint);
        }),
      );

      it.effect(
        'deduplicates on the Standard Webhooks id, per subscription',
        () =>
          Effect.gen(function* () {
            const webhookId = `msg_${randomUUID().replaceAll('-', '')}`;
            yield* newDelivery(subscriptionOf[TEAM_A] as string, {
              webhook_id: webhookId,
            });

            const refused = yield* refusalOf(
              ownerInsert(
                'webhook_deliveries',
                deliveryRow(subscriptionOf[TEAM_A] as string, {
                  webhook_id: webhookId,
                }),
              ),
            );
            expect(refused).toMatchObject({
              state: '23505',
              constraint:
                'webhook_deliveries_subscription_id_webhook_id_unique',
            });

            // The dedup key is the subscriber's, so the same id may
            // legitimately reach a different subscriber.
            const other = yield* newSubscription();
            expect(
              yield* ownerInsert(
                'webhook_deliveries',
                deliveryRow(other, { webhook_id: webhookId }),
              ),
            ).toBe(1);
          }),
      );

      it.effect.each<readonly [label: string, assignment: string]>([
        ['the payload', `payload = '{"tampered":true}'::jsonb`],
        ['the webhook id', `webhook_id = 'msg_rewritten'`],
        ['the event type', `event_type = 'interview.started'`],
        ['the creation timestamp', `created_at = now()`],
      ])('freezes %s of a queued delivery', ([_label, assignment]) =>
        Effect.gen(function* () {
          const id = yield* newDelivery(subscriptionOf[TEAM_A] as string);

          const refused = yield* refusalOf(
            ownerAffected(
              `UPDATE webhook_deliveries SET ${assignment} WHERE id = $1`,
              [id],
            ),
          );
          expect(refused.message).toContain(
            'webhook delivery payload is immutable',
          );
        }),
      );

      it.effect(
        'freezes the subscription a queued delivery is addressed to',
        () =>
          Effect.gen(function* () {
            const id = yield* newDelivery(subscriptionOf[TEAM_A] as string);
            const other = yield* newSubscription();

            const refused = yield* refusalOf(
              ownerAffected(
                `UPDATE webhook_deliveries SET subscription_id = $2 WHERE id = $1`,
                [id, other],
              ),
            );
            expect(refused.message).toContain(
              'webhook delivery payload is immutable',
            );
          }),
      );

      it.effect('leaves the worker free to advance delivery state', () =>
        Effect.gen(function* () {
          const id = yield* newDelivery(subscriptionOf[TEAM_A] as string);

          expect(
            yield* ownerAffected(
              `UPDATE webhook_deliveries
               SET attempt_count = attempt_count + 1,
                   last_status_code = 503,
                   last_error = 'upstream unavailable'
               WHERE id = $1`,
              [id],
            ),
          ).toBe(1);
          expect(
            yield* ownerAffected(
              `UPDATE webhook_deliveries
               SET delivered_at = now(), last_status_code = 200, last_error = NULL
               WHERE id = $1`,
              [id],
            ),
          ).toBe(1);
        }),
      );

      it.effect(
        'lets the maintenance worker advance a delivery without team context',
        () =>
          Effect.gen(function* () {
            const teamBDelivery = randomUUID();
            yield* ownerInsert(
              'webhook_deliveries',
              deliveryRow(subscriptionOf[TEAM_B] as string, {
                id: teamBDelivery,
                team_id: TEAM_B,
                payload: JSON.stringify({ teamId: TEAM_B }),
              }),
            );

            const claimed = yield* MaintenanceScope.open(
              Effect.flatMap(Transaction, ({ sql }) =>
                sql.unsafe<Row>(
                  `UPDATE webhook_deliveries
                   SET attempt_count = attempt_count + 1
                   WHERE id = $1 RETURNING team_id`,
                  [teamBDelivery],
                ),
              ),
            );
            expect(claimed).toEqual([{ team_id: TEAM_B }]);

            // The application role, stamped with team A, cannot see the row
            // at all.
            const invisible = yield* tenantRows(
              TEAM_A,
              `SELECT id FROM webhook_deliveries WHERE id = $1`,
              [teamBDelivery],
            );
            expect(invisible).toHaveLength(0);
          }),
      );

      it.effect('refuses a subscription from another team', () =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert(
              'webhook_deliveries',
              deliveryRow(subscriptionOf[TEAM_B] as string, {
                team_id: TEAM_A,
              }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'webhook_deliveries_subscription_fk',
            detail: expect.stringContaining(
              'is not present in table "webhook_subscriptions"',
            ),
          });
        }),
      );
    });

    // The key proves the subscription is the team's and stops there. These two
    // are what makes the queued delivery one the subscriber actually asked for,
    // and the payload trigger above then freezes whatever gets in.
    describe('webhook_deliveries_subscription_wants_event', () => {
      it.effect('refuses a delivery queued for a disabled subscription', () =>
        Effect.gen(function* () {
          const id = yield* newSubscription();
          yield* ownerAffected(
            `UPDATE webhook_subscriptions
             SET state = 'disabled', disabled_at = now() WHERE id = $1`,
            [id],
          );

          const refused = yield* refusalOf(newDelivery(id));
          expect(refused.message).toContain(
            'a webhook delivery may only be queued for an active subscription',
          );
        }),
      );

      it.effect('refuses an event type the subscription does not ask for', () =>
        Effect.gen(function* () {
          const id = yield* newSubscription({
            event_types: ['interview.completed', 'participant.enrolled'],
          });

          const refused = yield* refusalOf(
            newDelivery(id, { event_type: 'consent.withdrawn' }),
          );
          expect(refused.message).toContain(
            'the subscription does not ask for consent.withdrawn events',
          );
          // Every type in the filter is admitted, not just the first.
          expect(
            yield* newDelivery(id, { event_type: 'participant.enrolled' }),
          ).toMatch(UUID);
        }),
      );

      it.effect('lets a re-enabled subscription receive deliveries again', () =>
        Effect.gen(function* () {
          const id = yield* newSubscription();
          yield* ownerAffected(
            `UPDATE webhook_subscriptions
             SET state = 'disabled', disabled_at = now() WHERE id = $1`,
            [id],
          );
          const refused = yield* refusalOf(newDelivery(id));
          expect(refused.message).toContain(
            'a webhook delivery may only be queued for an active subscription',
          );

          yield* ownerAffected(
            `UPDATE webhook_subscriptions
             SET state = 'active', disabled_at = NULL, consecutive_failures = 0
             WHERE id = $1`,
            [id],
          );
          expect(yield* newDelivery(id)).toMatch(UUID);
        }),
      );
    });
  });
});
