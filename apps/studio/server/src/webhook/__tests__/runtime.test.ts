import { createHmac, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { safe } from '@orpc/client';
import { describe, expect, it } from 'vitest';

import { CreateWebhookSubscriptionInputSchema } from '@codaco/studio-rpc/webhooks';

import { stubAuthService } from '../../__tests__/support/auth.ts';
import { createHttpTestApp } from '../../__tests__/support/http-app.ts';
import { createRpcClient } from '../../__tests__/support/rpc.ts';
import { readEnv } from '../../env.ts';
import { participantFixture } from '../../pii/__tests__/integration-fixture.ts';
import {
  readWebhookSecretForDelivery,
  setWebhookSecret,
} from '../../pii/webhooks.ts';
import { createAuditedStudy } from '../../study/commands.ts';
import {
  beginWebhookHandoff,
  consumeWebhookResponse,
  createPinnedLookup,
  createStandardWebhookSender,
  createWebhookDeliveryDispatcher,
  normalizeDnsHostname,
  startWebhookDeliveryWorker,
  WebhookDeliveryAdapter,
  type WebhookRequest,
} from '../delivery.ts';
import {
  createWebhookSubscription,
  disableWebhookSubscription,
  enqueueWebhookEvent,
  listWebhookSubscriptions,
} from '../subscriptions.ts';

const secretBytes = Buffer.alloc(32, 71);
const secret = `whsec_${secretBytes.toString('base64url')}`;

async function addSubscription(
  input: Parameters<Parameters<typeof participantFixture>[0]>[0],
  studyId: string | null = null,
) {
  const subscriptionId = randomUUID();
  await createWebhookSubscription(input.keys, input.context, {
    subscriptionId,
    studyId,
    url: 'https://hooks.example.org/studio',
    eventTypes: ['study.created'],
    secret,
  });
  return subscriptionId;
}

async function enqueue(
  input: Parameters<Parameters<typeof participantFixture>[0]>[0],
) {
  const client = await input.scratch.pool.connect();
  try {
    return await enqueueWebhookEvent(client, {
      type: 'study.created',
      teamId: input.context.tenantDb.teamId,
      studyId: input.target.studyId,
      resourceId: input.target.studyId,
    });
  } finally {
    client.release();
  }
}

describe('webhook runtime', () => {
  it('rejects creation subscriptions for an existing study and callback URLs outside database bounds', async () => {
    await participantFixture(async (fixture) => {
      const input = {
        teamId: fixture.context.tenantDb.teamId,
        subscriptionId: randomUUID(),
        url: 'https://hooks.example.org/studio',
        eventTypes: ['study.created' as const],
        secret,
      };
      expect(
        CreateWebhookSubscriptionInputSchema.safeParse(input).success,
      ).toBe(true);
      expect(
        CreateWebhookSubscriptionInputSchema.safeParse({
          ...input,
          studyId: fixture.target.studyId,
        }).success,
      ).toBe(false);
      await expect(
        createWebhookSubscription(fixture.keys, fixture.context, {
          ...input,
          studyId: fixture.target.studyId,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      const maximum = 'https://example.test/' + 'x'.repeat(1979);
      expect(maximum).toHaveLength(2000);
      expect(
        CreateWebhookSubscriptionInputSchema.safeParse({
          ...input,
          url: maximum,
        }).success,
      ).toBe(true);
      expect(
        CreateWebhookSubscriptionInputSchema.safeParse({
          ...input,
          url: maximum + 'x',
        }).success,
      ).toBe(false);
      await expect(
        createWebhookSubscription(fixture.keys, fixture.context, {
          ...input,
          url: maximum + 'x',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });

  it('preserves the disabling failure history when an already handed-off request succeeds', async () => {
    await participantFixture(async (fixture) => {
      const subscriptionId = await addSubscription(fixture);
      await enqueue(fixture);
      const dispatcher = createWebhookDeliveryDispatcher({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
        sender: {
          async send() {
            await fixture.scratch.pool.query(
              `UPDATE webhook_subscriptions SET state = 'disabled', disabled_at = clock_timestamp(), consecutive_failures = 5, last_failure_at = clock_timestamp() WHERE id = $1`,
              [subscriptionId],
            );
            return 204;
          },
        },
      });
      expect(await dispatcher.runOnce()).toMatchObject({ completed: 1 });
      expect(
        (
          await fixture.scratch.pool.query(
            `SELECT state, consecutive_failures, last_failure_at IS NOT NULL AS evidence FROM webhook_subscriptions WHERE id = $1`,
            [subscriptionId],
          )
        ).rows,
      ).toEqual([
        { state: 'disabled', consecutive_failures: 5, evidence: true },
      ]);
    });
  });

  it('retries a ciphertext rotation that commits between the initial secret select and its locked recheck', async () => {
    await participantFixture(async (fixture) => {
      const subscriptionId = await addSubscription(fixture);
      await enqueue(fixture);
      const adapter = new WebhookDeliveryAdapter({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
      });
      const lease = { owner: randomUUID(), durationMs: 10_000 };
      const claim = await adapter.claim(lease, 3);
      if (!claim) throw new Error('expected delivery claim');
      const blocker = await fixture.scratch.pool.connect();
      let delivery: ReturnType<typeof adapter.deliver> | undefined;
      try {
        await blocker.query('BEGIN');
        const pid = (
          await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows[0]!.pid;
        await blocker.query(
          'SELECT id FROM webhook_subscriptions WHERE id = $1 FOR UPDATE',
          [subscriptionId],
        );
        delivery = adapter.deliver(claim);
        // Observe the actual recheck waiter, rather than assume a scheduling delay.
        await expect
          .poll(
            async () =>
              (
                await fixture.scratch.pool.query<{ waiting: boolean }>(
                  `SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid)) AND query LIKE '%secret_ciphertext%FOR UPDATE%') AS waiting`,
                  [pid],
                )
              ).rows[0]!.waiting,
          )
          .toBe(true);
        await blocker.query(
          'UPDATE webhook_subscriptions SET secret_ciphertext = $2 WHERE id = $1',
          [subscriptionId, Buffer.alloc(32, 72)],
        );
        await blocker.query('COMMIT');
        await expect(delivery).rejects.toMatchObject({
          disposition: 'retryable',
        });
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        await delivery?.catch(() => undefined);
      }
    });
  });

  it('matches the Node lookup callback shape and normalizes IPv6 URL literals', async () => {
    const pinnedLookup = createPinnedLookup([
      { address: '2606:4700:4700::1111', family: 6 },
      { address: '8.8.8.8', family: 4 },
    ]);
    await expect(
      new Promise((resolve, reject) => {
        pinnedLookup('ignored.example', { all: true }, (error, addresses) => {
          if (error) reject(error);
          else resolve(addresses);
        });
      }),
    ).resolves.toEqual([
      { address: '2606:4700:4700::1111', family: 6 },
      { address: '8.8.8.8', family: 4 },
    ]);
    expect(normalizeDnsHostname('[2606:4700:4700::1111]')).toBe(
      '2606:4700:4700::1111',
    );
    expect(normalizeDnsHostname('hooks.example.org')).toBe('hooks.example.org');
  });

  it('refuses loopback delivery before opening an outbound request', async () => {
    await expect(
      createStandardWebhookSender({ timeoutMs: 100 }).send({
        id: randomUUID(),
        url: 'https://127.0.0.1/private',
        timestamp: '1',
        signature: 'v1,synthetic',
        body: '{}',
      }),
    ).rejects.toMatchObject({ disposition: 'permanent' });
  });

  it('refuses a DNS answer set containing any private address', async () => {
    await expect(
      createStandardWebhookSender({
        lookupAddress: async () => [
          { address: '8.8.8.8', family: 4 },
          { address: '169.254.169.254', family: 4 },
        ],
      }).send({
        id: randomUUID(),
        url: 'https://hooks.example.org/studio',
        timestamp: '1',
        signature: 'v1,synthetic',
        body: '{}',
      }),
    ).rejects.toMatchObject({ disposition: 'permanent' });
  });

  it('bounds DNS inside the absolute deadline and destroys a response after its headers', async () => {
    const started = Date.now();
    await expect(
      createStandardWebhookSender({
        timeoutMs: 20,
        lookupAddress: () =>
          new Promise<{ address: string; family: 4 | 6 }[]>(() => undefined),
      }).send({
        id: randomUUID(),
        url: 'https://hooks.example.org/studio',
        timestamp: '1',
        signature: 'v1,synthetic',
        body: '{}',
      }),
    ).rejects.toMatchObject({ disposition: 'retryable' });
    expect(Date.now() - started).toBeLessThan(500);

    let destroyed = false;
    expect(
      consumeWebhookResponse({
        statusCode: 204,
        destroy(_error?: Error) {
          destroyed = true;
          return this;
        },
      }),
    ).toBe(204);
    expect(destroyed).toBe(true);
  });

  it.each([99, 600, 700, 200.5, Number.NaN])(
    'rejects an out-of-range or non-integer response status %s after closing its stream',
    (statusCode) => {
      let destroyed = false;
      expect(() =>
        consumeWebhookResponse({
          statusCode,
          destroy() {
            destroyed = true;
          },
        }),
      ).toThrow('webhook delivery retryable');
      expect(destroyed).toBe(true);
    },
  );

  it('retries an invalid sender status without poisoning persisted delivery state', async () => {
    await participantFixture(async (fixture) => {
      await addSubscription(fixture);
      await enqueue(fixture);
      const statuses = [700, 204];
      const worker = startWebhookDeliveryWorker({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
        leaseMs: 5_000,
        retryBaseMs: 0,
        retryMaxMs: 0,
        pollIntervalMs: 2,
        sender: {
          async send() {
            return statuses.shift() ?? 204;
          },
        },
      });
      try {
        await expect
          .poll(
            async () =>
              (
                await fixture.scratch.pool.query<{
                  delivered: boolean;
                  attempt_count: number;
                  last_status_code: number | null;
                }>(
                  'SELECT delivered_at IS NOT NULL AS delivered,attempt_count,last_status_code FROM webhook_deliveries',
                )
              ).rows[0],
            { timeout: 5_000 },
          )
          .toEqual({
            delivered: true,
            attempt_count: 2,
            last_status_code: 204,
          });
      } finally {
        await worker.stop();
      }
    });
  });

  it('rechecks administration and never exposes stored secret material', async () => {
    await participantFixture(async (fixture) => {
      const auth = stubAuthService({
        getSession: () => Promise.resolve(fixture.context.principal),
        getMembership: () => Promise.resolve({ role: 'owner' }),
        listMemberships: () =>
          Promise.resolve([
            { teamId: fixture.context.tenantDb.teamId, role: 'owner' },
          ]),
      });
      const rpc = createRpcClient(
        createHttpTestApp(readEnv(), {
          auth,
          pool: fixture.scratch.app,
          encryptionKeys: fixture.keys,
        }),
      );
      const subscriptionId = randomUUID();
      await expect(
        rpc.webhooks.create({
          teamId: fixture.context.tenantDb.teamId,
          subscriptionId,
          studyId: null,
          url: 'https://hooks.example.org/studio',
          eventTypes: ['study.created'],
          secret,
        }),
      ).resolves.toMatchObject({ subscription: { id: subscriptionId } });
      const stored = await fixture.scratch.pool.query<{
        secret_ciphertext: Buffer;
      }>('SELECT secret_ciphertext FROM webhook_subscriptions WHERE id = $1', [
        subscriptionId,
      ]);
      expect(stored.rows[0]?.secret_ciphertext.includes(secretBytes)).toBe(
        false,
      );

      const demoted = await fixture.scratch.pool.query<{ role: string }>(
        "UPDATE team_members SET role = 'member' WHERE user_id = $1 RETURNING role",
        [fixture.context.principal.userId],
      );
      expect(demoted.rows).toEqual([{ role: 'member' }]);
      const denied = await safe(
        rpc.webhooks.create({
          teamId: fixture.context.tenantDb.teamId,
          subscriptionId: randomUUID(),
          url: 'https://hooks.example.org/refused',
          eventTypes: ['study.created'],
          secret,
        }),
      );
      expect(denied.error).toMatchObject({ code: 'FORBIDDEN' });
      expect(
        (
          await fixture.scratch.pool.query(
            'SELECT count(*)::int AS count FROM webhook_subscriptions',
          )
        ).rows[0],
      ).toEqual({ count: 1 });
    });
  });

  it('renders historical seed event types without accepting them for new subscriptions', async () => {
    await participantFixture(async (fixture) => {
      const subscriptionId = await addSubscription(fixture);
      await fixture.scratch.pool.query(
        `UPDATE webhook_subscriptions
         SET event_types = ARRAY['interview.completed', 'session.completed', 'study.created']
         WHERE id = $1`,
        [subscriptionId],
      );
      await expect(
        listWebhookSubscriptions(fixture.context),
      ).resolves.toMatchObject([
        {
          eventTypes: [
            'interview.completed',
            'session.completed',
            'study.created',
          ],
        },
      ]);
      expect(
        CreateWebhookSubscriptionInputSchema.safeParse({
          teamId: fixture.context.tenantDb.teamId,
          subscriptionId: randomUUID(),
          url: 'https://hooks.example.org/new',
          eventTypes: ['interview.completed'],
          secret,
        }).success,
      ).toBe(false);
    });
  });

  it('queues a thin payload and delivers through the shared worker with a stable signed id across factual retries', async () => {
    await participantFixture(async (fixture) => {
      const subscriptionId = await addSubscription(fixture, null);
      const studyId = randomUUID();
      await createAuditedStudy(fixture.context, {
        name: 'Webhook producer study',
        studyId,
        protocolId: randomUUID(),
        draftId: randomUUID(),
      });
      const requests: WebhookRequest[] = [];
      const statuses = [503, 204];
      const worker = startWebhookDeliveryWorker({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
        leaseMs: 5_000,
        retryBaseMs: 0,
        retryMaxMs: 0,
        pollIntervalMs: 2,
        sender: {
          async send(request) {
            requests.push(request);
            return statuses.shift() ?? 204;
          },
        },
      });
      try {
        await expect
          .poll(
            async () =>
              (
                await fixture.scratch.pool.query<{ delivered: boolean }>(
                  'SELECT delivered_at IS NOT NULL AS delivered FROM webhook_deliveries',
                )
              ).rows[0]?.delivered,
            { timeout: 5_000 },
          )
          .toBe(true);
      } finally {
        await worker.stop();
      }

      expect(requests).toHaveLength(2);
      expect(requests[0]?.id).toBe(requests[1]?.id);
      for (const request of requests) {
        expect(JSON.parse(request.body)).toEqual({
          resourceId: studyId,
          studyId,
          teamId: fixture.context.tenantDb.teamId,
          type: 'study.created',
        });
        expect(request.signature).toBe(
          `v1,${createHmac('sha256', secretBytes)
            .update(`${request.id}.${request.timestamp}.${request.body}`)
            .digest('base64')}`,
        );
      }
      const row = await fixture.scratch.pool.query(
        `SELECT subscription_id, attempt_count, delivered_at IS NOT NULL AS delivered,
                failed_at, uncertain_at, send_started_at IS NOT NULL AS handed_off
         FROM webhook_deliveries`,
      );
      expect(row.rows).toEqual([
        {
          subscription_id: subscriptionId,
          attempt_count: 2,
          delivered: true,
          failed_at: null,
          uncertain_at: null,
          handed_off: true,
        },
      ]);
      expect(
        (
          await fixture.scratch.pool.query<{ event_type: string }>(
            `SELECT event_type FROM audit_events
             WHERE event_type LIKE 'webhook.%' ORDER BY sequence`,
          )
        ).rows.map(({ event_type }) => event_type),
      ).toEqual([
        'webhook.subscription.created',
        'webhook.secret.read',
        'webhook.secret.read',
        'webhook.delivery.delivered',
      ]);
    });
  });

  it('retries an ambiguous post-handoff result with the stable id and suppresses a disabled subscription before handoff', async () => {
    await participantFixture(async (fixture) => {
      const subscriptionId = await addSubscription(fixture);
      await enqueue(fixture);
      let sends = 0;
      const requests: WebhookRequest[] = [];
      const dispatcher = createWebhookDeliveryDispatcher({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
        retryBaseMs: 0,
        retryMaxMs: 0,
        maxAttempts: 2,
        leaseMs: 5_000,
        sender: {
          async send(request) {
            sends += 1;
            requests.push(request);
            throw new Error('synthetic connection loss after request handoff');
          },
        },
      });
      expect(await dispatcher.runOnce()).toMatchObject({ retried: 1 });
      await setWebhookSecret(
        fixture.keys,
        fixture.context,
        subscriptionId,
        Buffer.alloc(32, 72),
      );
      expect(await dispatcher.runOnce()).toMatchObject({ failed: 1 });
      expect(await dispatcher.runOnce()).toMatchObject({ claimed: 0 });
      expect(sends).toBe(2);
      // Retries use the currently configured signing key; receivers deduplicate
      // the possible duplicate by the stable Standard Webhooks id.
      expect(requests[0]?.id).toBe(requests[1]?.id);
      expect(requests[1]).toBeDefined();
      expect(requests[1]?.signature).toBe(
        `v1,${createHmac('sha256', Buffer.alloc(32, 72))
          .update(
            `${requests[1]!.id}.${requests[1]!.timestamp}.${requests[1]!.body}`,
          )
          .digest('base64')}`,
      );

      await enqueue(fixture);
      await disableWebhookSubscription(fixture.context, subscriptionId);
      expect(await dispatcher.runOnce()).toMatchObject({ suppressed: 1 });
      expect(sends).toBe(2);
      expect(
        (
          await fixture.scratch.pool.query<{
            uncertain: number;
            failed: number;
          }>(
            `SELECT count(*) FILTER (WHERE uncertain_at IS NOT NULL)::int AS uncertain,
                    count(*) FILTER (WHERE failed_at IS NOT NULL)::int AS failed
             FROM webhook_deliveries`,
          )
        ).rows[0],
      ).toEqual({ uncertain: 0, failed: 2 });
    });
  });

  it('reconciles expired leases according to the durable handoff marker', async () => {
    await participantFixture(async (fixture) => {
      await addSubscription(fixture);
      await enqueue(fixture);
      const adapter = new WebhookDeliveryAdapter({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
      });
      const firstOwner = randomUUID();
      const first = await adapter.claim(
        { owner: firstOwner, durationMs: 5_000 },
        3,
      );
      if (!first) throw new Error('expected first delivery claim');
      await fixture.scratch.pool.query(
        `UPDATE webhook_deliveries
         SET send_started_at = now(), lease_expires_at = now() - interval '1 second'
         WHERE id = $1`,
        [first.id],
      );
      expect(await adapter.reconcileExpiredRetries()).toBe(1);
      const secondOwner = randomUUID();
      const second = await adapter.claim(
        { owner: secondOwner, durationMs: 5_000 },
        3,
      );
      if (!second) throw new Error('expected second delivery claim');
      expect(second.id).toBe(first.id);
      await fixture.scratch.pool.query(
        `UPDATE webhook_deliveries
         SET attempt_count = 3, send_started_at=now(), lease_expires_at = now() - interval '1 second'
         WHERE id = $1`,
        [second.id],
      );
      expect(await adapter.failExhaustedLeases(3)).toBe(1);

      await enqueue(fixture);
      await fixture.scratch.pool.query(
        `UPDATE webhook_deliveries
         SET attempt_count = 3, lease_owner = NULL, lease_expires_at = NULL
         WHERE failed_at IS NULL`,
      );
      expect(await adapter.failExhaustedLeases(3)).toBe(1);
      expect(
        (
          await fixture.scratch.pool.query(
            `SELECT count(*) FILTER (WHERE uncertain_at IS NOT NULL)::int AS uncertain,
                    count(*) FILTER (WHERE failed_at IS NOT NULL)::int AS failed
             FROM webhook_deliveries`,
          )
        ).rows[0],
      ).toEqual({ uncertain: 0, failed: 2 });
    });
  });

  it('refuses handoff after the audited secret snapshot is rotated', async () => {
    await participantFixture(async (fixture) => {
      const subscriptionId = await addSubscription(fixture);
      await enqueue(fixture);
      const adapter = new WebhookDeliveryAdapter({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
      });
      const owner = randomUUID();
      const claim = await adapter.claim({ owner, durationMs: 5_000 }, 3);
      if (!claim) throw new Error('expected delivery claim');
      const read = await readWebhookSecretForDelivery(
        fixture.keys,
        subscriptionId,
        {
          kind: 'delivery',
          maintenancePool: fixture.scratch.maintenance,
          teamId: fixture.context.tenantDb.teamId,
          deliveryId: claim.id,
          leaseOwner: owner,
        },
      );
      try {
        await setWebhookSecret(
          fixture.keys,
          fixture.context,
          subscriptionId,
          Buffer.alloc(32, 72),
        );
        await expect(
          beginWebhookHandoff(
            fixture.scratch.maintenance,
            claim,
            read.snapshot,
          ),
        ).resolves.toBe('retry');
        const current = await readWebhookSecretForDelivery(
          fixture.keys,
          subscriptionId,
          {
            kind: 'delivery',
            maintenancePool: fixture.scratch.maintenance,
            teamId: fixture.context.tenantDb.teamId,
            deliveryId: claim.id,
            leaseOwner: owner,
          },
        );
        try {
          await fixture.scratch.pool.query(
            "UPDATE webhook_deliveries SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
            [claim.id],
          );
          await expect(
            beginWebhookHandoff(
              fixture.scratch.maintenance,
              claim,
              current.snapshot,
            ),
          ).resolves.toBe('lease-lost');
        } finally {
          current.secret.fill(0);
        }
      } finally {
        read.secret.fill(0);
      }
    });
  });

  it('serializes handoff behind a concurrent disable before sending', async () => {
    await participantFixture(async (fixture) => {
      const subscriptionId = await addSubscription(fixture);
      await enqueue(fixture);
      const adapter = new WebhookDeliveryAdapter({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
      });
      const owner = randomUUID();
      const claim = await adapter.claim({ owner, durationMs: 5_000 }, 3);
      if (!claim) throw new Error('expected delivery claim');
      const read = await readWebhookSecretForDelivery(
        fixture.keys,
        subscriptionId,
        {
          kind: 'delivery',
          maintenancePool: fixture.scratch.maintenance,
          teamId: fixture.context.tenantDb.teamId,
          deliveryId: claim.id,
          leaseOwner: owner,
        },
      );
      try {
        const blocker = await fixture.scratch.pool.connect();
        try {
          await blocker.query('BEGIN');
          await blocker.query(
            'SELECT id FROM webhook_subscriptions WHERE id = $1 FOR UPDATE',
            [subscriptionId],
          );
          const handoff = beginWebhookHandoff(
            fixture.scratch.maintenance,
            claim,
            read.snapshot,
          );
          // There is no database event exposed for a waiter on a row lock;
          // this bounded pause is the negative oracle that proves the old
          // unlocked handoff would have completed before the mutation.
          await delay(50);
          await blocker.query(
            `UPDATE webhook_subscriptions
             SET state = 'disabled', disabled_at = clock_timestamp()
             WHERE id = $1`,
            [subscriptionId],
          );
          await blocker.query('COMMIT');
          await expect(handoff).resolves.toBe('suppressed');
        } finally {
          await blocker.query('ROLLBACK').catch(() => undefined);
          blocker.release();
        }
      } finally {
        read.secret.fill(0);
      }
    });
  });

  it('serializes handoff behind a concurrent secret rotation before sending', async () => {
    await participantFixture(async (fixture) => {
      const subscriptionId = await addSubscription(fixture);
      await enqueue(fixture);
      const adapter = new WebhookDeliveryAdapter({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
      });
      const owner = randomUUID();
      const claim = await adapter.claim({ owner, durationMs: 5_000 }, 3);
      if (!claim) throw new Error('expected delivery claim');
      const read = await readWebhookSecretForDelivery(
        fixture.keys,
        subscriptionId,
        {
          kind: 'delivery',
          maintenancePool: fixture.scratch.maintenance,
          teamId: fixture.context.tenantDb.teamId,
          deliveryId: claim.id,
          leaseOwner: owner,
        },
      );
      try {
        const blocker = await fixture.scratch.pool.connect();
        try {
          await blocker.query('BEGIN');
          await blocker.query(
            'SELECT id FROM webhook_subscriptions WHERE id = $1 FOR UPDATE',
            [subscriptionId],
          );
          const handoff = beginWebhookHandoff(
            fixture.scratch.maintenance,
            claim,
            read.snapshot,
          );
          // Keep the lock held while changing the ciphertext, then let the
          // handoff observe the committed new key and retry the old read.
          await delay(50);
          await blocker.query(
            `UPDATE webhook_subscriptions
             SET secret_ciphertext = $2, updated_at = clock_timestamp()
             WHERE id = $1`,
            [subscriptionId, Buffer.alloc(32, 72)],
          );
          await blocker.query('COMMIT');
          await expect(handoff).resolves.toBe('retry');
        } finally {
          await blocker.query('ROLLBACK').catch(() => undefined);
          blocker.release();
        }
      } finally {
        read.secret.fill(0);
      }
    });
  });

  it('retries a secret snapshot race and signs once with the current secret', async () => {
    await participantFixture(async (fixture) => {
      const subscriptionId = await addSubscription(fixture);
      await enqueue(fixture);
      const currentSecret = Buffer.alloc(32, 72);
      const requests: WebhookRequest[] = [];
      let rotateBeforeFirstHandoff = true;
      const dispatcher = createWebhookDeliveryDispatcher({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
        retryBaseMs: 0,
        retryMaxMs: 0,
        maxAttempts: 1,
        leaseMs: 5_000,
        handoff: async (pool, claim, snapshot) => {
          if (rotateBeforeFirstHandoff) {
            rotateBeforeFirstHandoff = false;
            await setWebhookSecret(
              fixture.keys,
              fixture.context,
              subscriptionId,
              currentSecret,
            );
          }
          return beginWebhookHandoff(pool, claim, snapshot);
        },
        sender: {
          async send(request) {
            requests.push(request);
            return 204;
          },
        },
      });

      expect(await dispatcher.runOnce()).toMatchObject({ retried: 1 });
      expect(requests).toHaveLength(0);
      expect(await dispatcher.runOnce()).toMatchObject({ completed: 1 });
      expect(requests).toHaveLength(1);
      const request = requests[0]!;
      expect(request.signature).toBe(
        `v1,${createHmac('sha256', currentSecret)
          .update(`${request.id}.${request.timestamp}.${request.body}`)
          .digest('base64')}`,
      );
      expect(
        (
          await fixture.scratch.pool.query<{ attempt_count: number }>(
            'SELECT attempt_count FROM webhook_deliveries',
          )
        ).rows,
      ).toEqual([{ attempt_count: 1 }]);
    });
  });

  it('keeps a delivery recoverable when its lease expires during the audited secret read', async () => {
    await participantFixture(async (fixture) => {
      const subscriptionId = await addSubscription(fixture);
      await enqueue(fixture);
      const adapter = new WebhookDeliveryAdapter({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
      });
      const lease = { owner: randomUUID(), durationMs: 40 };
      const claim = await adapter.claim(lease, 3);
      if (!claim) throw new Error('expected delivery claim');
      const blocker = await fixture.scratch.pool.connect();
      try {
        await blocker.query('BEGIN');
        await blocker.query(
          'SELECT id FROM webhook_subscriptions WHERE id = $1 FOR UPDATE',
          [subscriptionId],
        );
        const delivery = adapter.deliver(claim);
        await expect
          .poll(async () => {
            const result = await fixture.scratch.pool.query<{
              waiting: boolean;
            }>(
              `SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%secret_ciphertext%FOR UPDATE%') AS waiting`,
            );
            return result.rows[0]?.waiting;
          })
          .toBe(true);
        await delay(60);
        await blocker.query('COMMIT');
        await expect(delivery).rejects.toThrow('webhook delivery lease lost');
        await expect(adapter.suppressClaim(claim, lease)).resolves.toBe(false);
      } finally {
        await blocker.query('ROLLBACK').catch(() => undefined);
        blocker.release();
      }
      expect(
        (
          await fixture.scratch.pool.query(
            `SELECT delivered_at, failed_at, uncertain_at, last_error
             FROM webhook_deliveries WHERE id = $1`,
            [claim.id],
          )
        ).rows,
      ).toEqual([
        {
          delivered_at: null,
          failed_at: null,
          uncertain_at: null,
          last_error: null,
        },
      ]);
    });
  });

  it('fails a pending historical event without invoking the transport', async () => {
    await participantFixture(async (fixture) => {
      const subscriptionId = await addSubscription(fixture);
      await fixture.scratch.pool.query(
        `UPDATE webhook_subscriptions
         SET event_types = ARRAY['session.completed']
         WHERE id = $1`,
        [subscriptionId],
      );
      await fixture.scratch.pool.query(
        `INSERT INTO webhook_deliveries
           (id, team_id, subscription_id, webhook_id, event_type, payload)
         VALUES ($1, $2, $3, $4, 'session.completed', $5)`,
        [
          randomUUID(),
          fixture.context.tenantDb.teamId,
          subscriptionId,
          `whk_${randomUUID()}`,
          { type: 'session.completed' },
        ],
      );
      let sends = 0;
      const dispatcher = createWebhookDeliveryDispatcher({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
        maxAttempts: 1,
        sender: {
          async send() {
            sends += 1;
            return 204;
          },
        },
      });
      expect(await dispatcher.runOnce()).toMatchObject({ failed: 1 });
      expect(sends).toBe(0);
      await expect(
        fixture.scratch.pool.query(
          `SELECT failed_at IS NOT NULL AS failed, last_error
           FROM webhook_deliveries`,
        ),
      ).resolves.toMatchObject({
        rows: [{ failed: true, last_error: 'delivery_failed' }],
      });
    });
  });

  it('disables an endpoint after five terminal delivery failures', async () => {
    await participantFixture(async (fixture) => {
      const subscriptionId = await addSubscription(fixture);
      let sends = 0;
      const dispatcher = createWebhookDeliveryDispatcher({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
        sender: {
          async send() {
            sends += 1;
            return 400;
          },
        },
      });
      for (let index = 0; index < 5; index += 1) {
        expect(await enqueue(fixture)).toBe(1);
        expect(await dispatcher.runOnce()).toMatchObject({ failed: 1 });
      }
      expect(sends).toBe(5);
      expect(await enqueue(fixture)).toBe(0);
      expect(
        (
          await fixture.scratch.pool.query(
            `SELECT state, consecutive_failures FROM webhook_subscriptions
             WHERE id = $1`,
            [subscriptionId],
          )
        ).rows,
      ).toEqual([{ state: 'disabled', consecutive_failures: 5 }]);
      expect(
        (
          await fixture.scratch.pool.query<{ count: number }>(
            `SELECT count(*)::int AS count FROM audit_events
             WHERE event_type = 'webhook.subscription.disabled'
               AND details->>'reason' = 'consecutive_failures'`,
          )
        ).rows[0],
      ).toEqual({ count: 1 });
    });
  });
});
