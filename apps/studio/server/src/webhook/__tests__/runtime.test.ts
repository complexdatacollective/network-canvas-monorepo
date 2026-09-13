import { createHmac, randomUUID } from 'node:crypto';

import { safe } from '@orpc/client';
import { describe, expect, it } from 'vitest';

import { stubAuthService } from '../../__tests__/support/auth.ts';
import { createHttpTestApp } from '../../__tests__/support/http-app.ts';
import { createRpcClient } from '../../__tests__/support/rpc.ts';
import { readEnv } from '../../env.ts';
import { participantFixture } from '../../pii/__tests__/integration-fixture.ts';
import { createAuditedStudy } from '../../study/commands.ts';
import {
  createStandardWebhookSender,
  createWebhookDeliveryDispatcher,
  startWebhookDeliveryWorker,
  WebhookDeliveryAdapter,
  type WebhookRequest,
} from '../delivery.ts';
import {
  createWebhookSubscription,
  disableWebhookSubscription,
  enqueueWebhookEvent,
} from '../subscriptions.ts';

const secretBytes = Buffer.alloc(32, 71);
const secret = `whsec_${secretBytes.toString('base64url')}`;

async function addSubscription(
  input: Parameters<Parameters<typeof participantFixture>[0]>[0],
  studyId: string | null = input.target.studyId,
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
          studyId: fixture.target.studyId,
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

      await fixture.scratch.pool.query(
        "UPDATE team_members SET role = 'member' WHERE user_id = $1",
        [fixture.context.principal.userId],
      );
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

  it('never retries an uncertain post-handoff result and suppresses a disabled subscription before handoff', async () => {
    await participantFixture(async (fixture) => {
      const subscriptionId = await addSubscription(fixture);
      await enqueue(fixture);
      let sends = 0;
      const dispatcher = createWebhookDeliveryDispatcher({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
        retryBaseMs: 0,
        sender: {
          async send() {
            sends += 1;
            throw new Error('synthetic connection loss after request handoff');
          },
        },
      });
      expect(await dispatcher.runOnce()).toMatchObject({ uncertain: 1 });
      expect(await dispatcher.runOnce()).toMatchObject({ claimed: 0 });
      expect(sends).toBe(1);

      await enqueue(fixture);
      await disableWebhookSubscription(fixture.context, subscriptionId);
      expect(await dispatcher.runOnce()).toMatchObject({ suppressed: 1 });
      expect(sends).toBe(1);
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
      ).toEqual({ uncertain: 1, failed: 1 });
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
      expect(await adapter.reconcileExpiredUncertainLeases()).toBe(1);

      await enqueue(fixture);
      const secondOwner = randomUUID();
      const second = await adapter.claim(
        { owner: secondOwner, durationMs: 5_000 },
        3,
      );
      if (!second) throw new Error('expected second delivery claim');
      await fixture.scratch.pool.query(
        `UPDATE webhook_deliveries
         SET attempt_count = 3, lease_expires_at = now() - interval '1 second'
         WHERE id = $1`,
        [second.id],
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
      ).toEqual({ uncertain: 1, failed: 1 });
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
