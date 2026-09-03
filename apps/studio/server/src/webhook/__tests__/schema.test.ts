// The webhook module's database-enforced promises: the https-only callback
// URL, the bounded event filter, the disable/failure bookkeeping, the
// Standard Webhooks dedup key, the composite foreign keys that keep a
// subscription and its deliveries inside one team, and the sidecar trigger
// that freezes a queued delivery's payload and addressing.
//
// Every case asserts the rejection Postgres actually raises — the constraint
// name for a CHECK, unique or foreign-key violation, the message for a trigger
// — so a guard that stopped firing cannot pass as "no error".
import { randomBytes, randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTenantDb, type TenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';

const db = await reachableDb();

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

type Row = Record<string, unknown>;

describe.skipIf(!db)('webhook schema', () => {
  let pool: pg.Pool;
  let app: pg.Pool;
  let maintenance: pg.Pool;
  let dispose: () => Promise<void>;
  let tenantA: TenantDb;
  /** One study per team, for the optional study-scoped subscription pin. */
  const studyOf: Record<string, string> = {};
  /** One subscription per team, so cross-team delivery pins have a target. */
  const subscriptionOf: Record<string, string> = {};

  // The connecting login is the development superuser, so it bypasses the
  // row-level security policies but not the triggers: exactly the fixture tool
  // these cases want. Role-sensitive probes use the `app` and `maintenance`
  // pools instead.
  const insert = (table: string, row: Row) => {
    const columns = Object.keys(row);
    return pool.query(
      `INSERT INTO ${table} (${columns.map((name) => `"${name}"`).join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(row),
    );
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

  async function newSubscription(overrides: Row = {}): Promise<string> {
    const row = subscriptionRow(overrides);
    await insert('webhook_subscriptions', row);
    return row.id as string;
  }

  async function newDelivery(
    subscriptionId: string,
    overrides: Row = {},
  ): Promise<string> {
    const row = deliveryRow(subscriptionId, overrides);
    await insert('webhook_deliveries', row);
    return row.id as string;
  }

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, app, maintenance, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);
    for (const teamId of [TEAM_A, TEAM_B]) {
      await seedTeam(pool, teamId);
      const studyId = randomUUID();
      studyOf[teamId] = studyId;
      await insert('studies', {
        id: studyId,
        team_id: teamId,
        name: `${teamId} study`,
      });
      const subscriptionId = randomUUID();
      subscriptionOf[teamId] = subscriptionId;
      await insert(
        'webhook_subscriptions',
        subscriptionRow({ id: subscriptionId, team_id: teamId }),
      );
    }
    tenantA = createTenantDb(app, TEAM_A);
  });
  afterAll(async () => {
    await dispose();
  });

  describe('webhook_subscriptions', () => {
    it('applies the documented defaults', async () => {
      const id = await newSubscription();

      const row = await pool.query<Row>(
        `SELECT study_id, description, state, consecutive_failures,
                last_failure_at, disabled_at
         FROM webhook_subscriptions WHERE id = $1`,
        [id],
      );
      expect(row.rows[0]).toEqual({
        study_id: null,
        description: null,
        state: 'active',
        consecutive_failures: 0,
        last_failure_at: null,
        disabled_at: null,
      });
    });

    it.each([
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
        { event_types: [] },
        'webhook_subscriptions_event_types_check',
      ],
      [
        'more than fifty event types',
        { event_types: Array.from({ length: 51 }, (_, i) => `event.${i}`) },
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
    ])('rejects %s', async (_label, overrides, constraint) => {
      await expect(
        insert('webhook_subscriptions', subscriptionRow(overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it('accepts the filter bounds the check exists to admit', async () => {
      await expect(
        insert(
          'webhook_subscriptions',
          subscriptionRow({ event_types: ['interview.completed'] }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        insert(
          'webhook_subscriptions',
          subscriptionRow({
            event_types: Array.from({ length: 50 }, (_, i) => `event.${i}`),
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('keeps the signing secret recoverable rather than hashed', async () => {
      const secret = randomBytes(60);
      const id = await newSubscription({ secret_ciphertext: secret });

      // A verifier could be stored as a digest; a signing key cannot, because
      // every outgoing request has to reproduce it.
      const row = await pool.query<{ secret_ciphertext: Buffer }>(
        `SELECT secret_ciphertext FROM webhook_subscriptions WHERE id = $1`,
        [id],
      );
      expect(row.rows[0]?.secret_ciphertext).toEqual(secret);
    });

    it('moves the state and the disable timestamp together', async () => {
      const id = await newSubscription();

      await expect(
        pool.query(
          `UPDATE webhook_subscriptions SET state = 'disabled' WHERE id = $1`,
          [id],
        ),
      ).rejects.toMatchObject({
        constraint: 'webhook_subscriptions_state_check',
      });
      await expect(
        pool.query(
          `UPDATE webhook_subscriptions
           SET state = 'disabled', disabled_at = now() WHERE id = $1`,
          [id],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });

      // Re-enabling has to clear the marker, or a disabled row and an active
      // one become indistinguishable in the worklist.
      await expect(
        pool.query(
          `UPDATE webhook_subscriptions SET state = 'active' WHERE id = $1`,
          [id],
        ),
      ).rejects.toMatchObject({
        constraint: 'webhook_subscriptions_state_check',
      });
      await expect(
        pool.query(
          `UPDATE webhook_subscriptions
           SET state = 'active', disabled_at = NULL, consecutive_failures = 0
           WHERE id = $1`,
          [id],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('counts consecutive failures while the subscription stays active', async () => {
      const id = await newSubscription();

      await expect(
        pool.query(
          `UPDATE webhook_subscriptions
           SET consecutive_failures = consecutive_failures + 3,
               last_failure_at = now()
           WHERE id = $1`,
          [id],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      const counted = await pool.query<{ consecutive_failures: number }>(
        `SELECT consecutive_failures FROM webhook_subscriptions WHERE id = $1`,
        [id],
      );
      expect(counted.rows[0]?.consecutive_failures).toBe(3);

      await expect(
        pool.query(
          `UPDATE webhook_subscriptions SET consecutive_failures = -1 WHERE id = $1`,
          [id],
        ),
      ).rejects.toMatchObject({
        constraint: 'webhook_subscriptions_failures_check',
      });
    });

    it('refuses a study pin from another team', async () => {
      await expect(
        insert(
          'webhook_subscriptions',
          subscriptionRow({ team_id: TEAM_A, study_id: studyOf[TEAM_B] }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'webhook_subscriptions_study_fk',
        detail: expect.stringContaining('is not present in table "studies"'),
      });
    });

    it('refuses a subscription written into another team', async () => {
      await expect(
        tenantA.query(
          `INSERT INTO webhook_subscriptions
             (id, team_id, url, event_types, secret_ciphertext, secret_key_id, created_by_user_id)
           VALUES ($1, $2, 'https://hooks.example.org/x', ARRAY['interview.completed'], $3, 'k', 'u')`,
          [randomUUID(), TEAM_B, randomBytes(32)],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  describe('webhook_deliveries', () => {
    it('applies the documented defaults', async () => {
      const id = await newDelivery(subscriptionOf[TEAM_A] as string);

      const row = await pool.query<Row>(
        `SELECT attempt_count, lease_owner, lease_expires_at, delivered_at,
                failed_at, last_status_code, last_error
         FROM webhook_deliveries WHERE id = $1`,
        [id],
      );
      expect(row.rows[0]).toEqual({
        attempt_count: 0,
        lease_owner: null,
        lease_expires_at: null,
        delivered_at: null,
        failed_at: null,
        last_status_code: null,
        last_error: null,
      });
    });

    it.each([
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
        'a lease owner with no expiry',
        { lease_owner: randomUUID() },
        'webhook_deliveries_lease_check',
      ],
      [
        'a lease expiry with no owner',
        { lease_expires_at: new Date() },
        'webhook_deliveries_lease_check',
      ],
      [
        'both terminal timestamps at once',
        { delivered_at: new Date(), failed_at: new Date() },
        'webhook_deliveries_terminal_state_check',
      ],
      [
        'a terminal row still holding a lease',
        {
          delivered_at: new Date(),
          lease_owner: randomUUID(),
          lease_expires_at: new Date(),
        },
        'webhook_deliveries_terminal_state_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      await expect(
        insert(
          'webhook_deliveries',
          deliveryRow(subscriptionOf[TEAM_A] as string, overrides),
        ),
      ).rejects.toMatchObject({ constraint });
    });

    it('deduplicates on the Standard Webhooks id, per subscription', async () => {
      const webhookId = `msg_${randomUUID().replaceAll('-', '')}`;
      await newDelivery(subscriptionOf[TEAM_A] as string, {
        webhook_id: webhookId,
      });

      await expect(
        insert(
          'webhook_deliveries',
          deliveryRow(subscriptionOf[TEAM_A] as string, {
            webhook_id: webhookId,
          }),
        ),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: 'webhook_deliveries_subscription_id_webhook_id_unique',
      });

      // The dedup key is the subscriber's, so the same id may legitimately
      // reach a different subscriber.
      const other = await newSubscription();
      await expect(
        insert(
          'webhook_deliveries',
          deliveryRow(other, { webhook_id: webhookId }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it.each([
      ['the payload', `payload = '{"tampered":true}'::jsonb`],
      ['the webhook id', `webhook_id = 'msg_rewritten'`],
      ['the event type', `event_type = 'interview.started'`],
      ['the creation timestamp', `created_at = now()`],
    ])('freezes %s of a queued delivery', async (_label, assignment) => {
      const id = await newDelivery(subscriptionOf[TEAM_A] as string);

      await expect(
        pool.query(
          `UPDATE webhook_deliveries SET ${assignment} WHERE id = $1`,
          [id],
        ),
      ).rejects.toThrow('webhook delivery payload is immutable');
    });

    it('freezes the subscription a queued delivery is addressed to', async () => {
      const id = await newDelivery(subscriptionOf[TEAM_A] as string);
      const other = await newSubscription();

      await expect(
        pool.query(
          `UPDATE webhook_deliveries SET subscription_id = $2 WHERE id = $1`,
          [id, other],
        ),
      ).rejects.toThrow('webhook delivery payload is immutable');
    });

    it('leaves the dispatcher free to advance delivery state', async () => {
      const id = await newDelivery(subscriptionOf[TEAM_A] as string);

      const owner = randomUUID();
      await expect(
        pool.query(
          `UPDATE webhook_deliveries
           SET attempt_count = attempt_count + 1,
               lease_owner = $2,
               lease_expires_at = now() + interval '1 minute',
               available_at = now() + interval '30 seconds',
               last_status_code = 503,
               last_error = 'upstream unavailable'
           WHERE id = $1`,
          [id, owner],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        pool.query(
          `UPDATE webhook_deliveries
           SET delivered_at = now(), lease_owner = NULL, lease_expires_at = NULL,
               last_status_code = 200, last_error = NULL
           WHERE id = $1`,
          [id],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('lets the maintenance dispatcher claim work without team context', async () => {
      const teamBDelivery = randomUUID();
      await insert(
        'webhook_deliveries',
        deliveryRow(subscriptionOf[TEAM_B] as string, {
          id: teamBDelivery,
          team_id: TEAM_B,
          payload: JSON.stringify({ teamId: TEAM_B }),
        }),
      );

      const claimed = await maintenance.query(
        `UPDATE webhook_deliveries
         SET attempt_count = attempt_count + 1
         WHERE id = $1 RETURNING team_id`,
        [teamBDelivery],
      );
      expect(claimed.rows).toEqual([{ team_id: TEAM_B }]);

      // The application role, stamped with team A, cannot see the row at all.
      const invisible = await tenantA.query(
        `SELECT id FROM webhook_deliveries WHERE id = $1`,
        [teamBDelivery],
      );
      expect(invisible.rowCount).toBe(0);
    });

    it('refuses a subscription from another team', async () => {
      await expect(
        insert(
          'webhook_deliveries',
          deliveryRow(subscriptionOf[TEAM_B] as string, { team_id: TEAM_A }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'webhook_deliveries_subscription_fk',
        detail: expect.stringContaining(
          'is not present in table "webhook_subscriptions"',
        ),
      });
    });
  });
});
