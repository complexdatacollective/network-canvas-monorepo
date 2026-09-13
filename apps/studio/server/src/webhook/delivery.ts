import { createHmac, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';

import ipaddr from 'ipaddr.js';
import type pg from 'pg';
import { z } from 'zod';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  runAuditedSystemMutation,
  type SystemAuditEventContext,
} from '../audit/command.ts';
import type { AuditEventInput } from '../audit/events.ts';
import {
  OutboxDispatcher,
  type OutboxAdapter,
  type OutboxLease,
  type OutboxRetryOptions,
} from '../outbox/dispatcher.ts';
import type { OutboxObserver } from '../outbox/instrumentation.ts';
import { startOutboxWorker, type OutboxWorker } from '../outbox/worker.ts';
import type { EncryptionKeys } from '../pii/keys.ts';
import { ProtectedDataError } from '../pii/protection.ts';
import { readWebhookSecret } from '../pii/webhooks.ts';

const QUEUE = 'webhook_deliveries';
const PENDING =
  'delivered_at IS NULL AND failed_at IS NULL AND uncertain_at IS NULL';
const OWNED = `id = $1 AND lease_owner = $2 AND ${PENDING}`;
const FAILURE_DISABLE_THRESHOLD = 5;

const WebhookPayloadSchema = z.strictObject({
  type: z.literal('study.created'),
  teamId: z.string().min(1).max(255),
  studyId: z.uuid(),
  resourceId: z.uuid(),
});

export type ClaimedWebhookDelivery = {
  id: string;
  teamId: string;
  subscriptionId: string;
  webhookId: string;
  eventType: string;
  payload: unknown;
  url: string;
  attemptCount: number;
  leaseOwner: string;
  sendStartedAt: Date | null;
  responseStatus?: number;
};

export class WebhookDeliveryError extends Error {
  readonly disposition: 'retryable' | 'permanent' | 'uncertain';
  readonly statusCode: number | null;

  constructor(
    disposition: 'retryable' | 'permanent' | 'uncertain',
    statusCode: number | null = null,
  ) {
    super(`webhook delivery ${disposition}`);
    this.name = 'WebhookDeliveryError';
    this.disposition = disposition;
    this.statusCode = statusCode;
  }
}

export type WebhookRequest = Readonly<{
  id: string;
  url: string;
  timestamp: string;
  signature: string;
  body: string;
}>;

export type WebhookSender = {
  send(input: WebhookRequest): Promise<number>;
};

function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

/** Resolve once, reject any mixed/private answer, and pin the selected address. */
async function resolvePublicAddress(hostname: string) {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicAddress(address))
  )
    throw new WebhookDeliveryError('permanent');
  return addresses[0]!;
}

export function createStandardWebhookSender(
  options: { timeoutMs?: number } = {},
): WebhookSender {
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error('webhook timeout must be a positive finite number');
  return {
    async send(input) {
      let url: URL;
      try {
        url = new URL(input.url);
      } catch {
        throw new WebhookDeliveryError('permanent');
      }
      if (
        url.protocol !== 'https:' ||
        url.username !== '' ||
        url.password !== '' ||
        url.hash !== ''
      )
        throw new WebhookDeliveryError('permanent');
      let pinned: Awaited<ReturnType<typeof resolvePublicAddress>>;
      try {
        pinned = await resolvePublicAddress(url.hostname);
      } catch (error) {
        if (error instanceof WebhookDeliveryError) throw error;
        throw new WebhookDeliveryError('retryable');
      }
      return new Promise<number>((resolve, reject) => {
        const outgoing = request(
          url,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(input.body),
              'webhook-id': input.id,
              'webhook-timestamp': input.timestamp,
              'webhook-signature': input.signature,
            },
            lookup: (_hostname, _options, callback) =>
              callback(null, pinned.address, pinned.family),
          },
          (response) => {
            const status = response.statusCode;
            response.resume();
            if (status === undefined) {
              reject(new WebhookDeliveryError('uncertain'));
              return;
            }
            resolve(status);
          },
        );
        outgoing.setTimeout(timeoutMs, () =>
          outgoing.destroy(new WebhookDeliveryError('uncertain')),
        );
        outgoing.once('error', () =>
          reject(new WebhookDeliveryError('uncertain')),
        );
        outgoing.end(input.body);
      });
    },
  };
}

type Options = OutboxRetryOptions & {
  pool: pg.Pool;
  encryptionKeys: EncryptionKeys;
  sender?: WebhookSender;
  observer?: OutboxObserver;
};

class LeaseLostError extends Error {}

function deliveryEvent(
  context: SystemAuditEventContext<'Webhook delivery'>,
  claim: ClaimedWebhookDelivery,
  type:
    | 'webhook.delivery.delivered'
    | 'webhook.delivery.failed'
    | 'webhook.delivery.uncertain'
    | 'webhook.delivery.suppressed',
  statusCode: number | null,
): AuditEventInput {
  return {
    ...context,
    eventVersion: 1,
    eventType: type,
    category: 'integration',
    outcome: 'succeeded',
    subjectType: null,
    subjectId: null,
    subjectLabel: null,
    resourceType: 'webhook_delivery',
    resourceId: claim.id,
    resourceLabel: null,
    details: {
      subscriptionId: claim.subscriptionId,
      eventType: claim.eventType,
      statusCode,
    },
  };
}

export class WebhookDeliveryAdapter implements OutboxAdapter<ClaimedWebhookDelivery> {
  readonly queue = QUEUE;
  private readonly sender: WebhookSender;
  private readonly options: Options;

  constructor(options: Options) {
    this.options = options;
    this.sender = options.sender ?? createStandardWebhookSender();
  }

  failureDisposition(error: unknown) {
    return error instanceof WebhookDeliveryError
      ? error.disposition
      : 'uncertain';
  }

  async suppressUndeliverable(): Promise<number> {
    return 0;
  }

  async reconcileExpiredUncertainLeases(): Promise<number> {
    const candidates = await this.options.pool.query<ClaimedWebhookDelivery>(
      `SELECT d.id, d.team_id AS "teamId", d.subscription_id AS "subscriptionId",
              d.webhook_id AS "webhookId", d.event_type AS "eventType",
              d.payload, s.url, d.attempt_count AS "attemptCount",
              d.lease_owner AS "leaseOwner", d.send_started_at AS "sendStartedAt"
       FROM webhook_deliveries d
       JOIN webhook_subscriptions s ON s.id = d.subscription_id AND s.team_id = d.team_id
       WHERE ${PENDING} AND d.lease_expires_at <= clock_timestamp()
         AND d.send_started_at IS NOT NULL
       ORDER BY d.created_at, d.id LIMIT 100`,
    );
    let uncertain = 0;
    for (const claim of candidates.rows) {
      if (await this.finishTerminal(claim, 'uncertain', null, 'expired'))
        uncertain += 1;
    }
    return uncertain;
  }

  async failExhaustedLeases(maxAttempts: number): Promise<number> {
    const candidates = await this.options.pool.query<ClaimedWebhookDelivery>(
      `SELECT d.id, d.team_id AS "teamId", d.subscription_id AS "subscriptionId",
              d.webhook_id AS "webhookId", d.event_type AS "eventType",
              d.payload, s.url, d.attempt_count AS "attemptCount",
              d.lease_owner AS "leaseOwner", d.send_started_at AS "sendStartedAt"
       FROM webhook_deliveries d
       JOIN webhook_subscriptions s ON s.id = d.subscription_id AND s.team_id = d.team_id
       WHERE ${PENDING} AND d.lease_expires_at <= clock_timestamp()
         AND d.send_started_at IS NULL AND d.attempt_count >= $1
       ORDER BY d.created_at, d.id LIMIT 100`,
      [maxAttempts],
    );
    let failed = 0;
    for (const claim of candidates.rows) {
      if (await this.finishTerminal(claim, 'failed', null, 'expired'))
        failed += 1;
    }
    return failed;
  }

  async claim(
    lease: OutboxLease,
    maxAttempts: number,
  ): Promise<ClaimedWebhookDelivery | null> {
    const client = await this.options.pool.connect();
    try {
      await client.query('BEGIN');
      const candidate = await client.query<
        Omit<ClaimedWebhookDelivery, 'leaseOwner' | 'sendStartedAt'>
      >(
        `SELECT d.id, d.team_id AS "teamId", d.subscription_id AS "subscriptionId",
                d.webhook_id AS "webhookId", d.event_type AS "eventType",
                d.payload, s.url, d.attempt_count AS "attemptCount"
         FROM webhook_deliveries d
         JOIN webhook_subscriptions s ON s.id = d.subscription_id AND s.team_id = d.team_id
         WHERE ${PENDING} AND d.send_started_at IS NULL
           AND d.attempt_count < $1 AND d.available_at <= clock_timestamp()
           AND (d.lease_expires_at IS NULL OR d.lease_expires_at <= clock_timestamp())
         ORDER BY d.available_at, d.created_at, d.id
         FOR UPDATE OF d SKIP LOCKED LIMIT 1`,
        [maxAttempts],
      );
      const row = candidate.rows[0];
      if (!row) return null;
      const locked = await client.query<{ locked: boolean }>(
        `SELECT pg_try_advisory_xact_lock(hashtext($1), hashtext($2)) AS locked`,
        [QUEUE, row.subscriptionId],
      );
      if (!locked.rows[0]?.locked) return null;
      const claimed = await client.query(
        `UPDATE webhook_deliveries
         SET lease_owner = $2,
             lease_expires_at = clock_timestamp() + make_interval(secs => $3::float / 1000),
             attempt_count = attempt_count + 1
         WHERE id = $1 AND ${PENDING}`,
        [row.id, lease.owner, lease.durationMs],
      );
      if (claimed.rowCount !== 1)
        throw new Error('webhook delivery claim failed');
      await client.query('COMMIT');
      return {
        ...row,
        attemptCount: row.attemptCount + 1,
        leaseOwner: lease.owner,
        sendStartedAt: null,
      };
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }

  async remainsDeliverable(
    claim: ClaimedWebhookDelivery,
    lease: OutboxLease,
  ): Promise<boolean> {
    const current = await this.options.pool.query(
      `SELECT 1 FROM webhook_deliveries d
       JOIN webhook_subscriptions s ON s.id = d.subscription_id AND s.team_id = d.team_id
       WHERE d.${OWNED} AND s.state = 'active'
         AND d.event_type = ANY(s.event_types)`,
      [claim.id, lease.owner],
    );
    return current.rowCount === 1;
  }

  suppressClaim(
    claim: ClaimedWebhookDelivery,
    lease: OutboxLease,
  ): Promise<boolean> {
    return this.finishTerminal(claim, 'suppressed', null, 'owned', lease.owner);
  }

  async renewLease(
    claim: ClaimedWebhookDelivery,
    lease: OutboxLease,
  ): Promise<boolean> {
    const renewed = await this.options.pool.query(
      `UPDATE webhook_deliveries
       SET lease_expires_at = clock_timestamp() + make_interval(secs => $3::float / 1000)
       WHERE ${OWNED}`,
      [claim.id, lease.owner, lease.durationMs],
    );
    return renewed.rowCount === 1;
  }

  async deliver(claim: ClaimedWebhookDelivery): Promise<void | 'suppressed'> {
    let secret: Buffer | undefined;
    let handedOff = false;
    try {
      const parsed = WebhookPayloadSchema.safeParse(claim.payload);
      if (!parsed.success) throw new WebhookDeliveryError('permanent');
      const payload = parsed.data;
      if (
        payload.type !== claim.eventType ||
        payload.teamId !== claim.teamId ||
        payload.resourceId !== payload.studyId
      )
        throw new WebhookDeliveryError('permanent');
      secret = await readWebhookSecret(
        this.options.encryptionKeys,
        claim.subscriptionId,
        {
          kind: 'delivery',
          maintenancePool: this.options.pool,
          teamId: claim.teamId,
          deliveryId: claim.id,
          leaseOwner: claim.leaseOwner,
        },
      );
      const handoff = await this.options.pool.query(
        `UPDATE webhook_deliveries d SET send_started_at = clock_timestamp()
         FROM webhook_subscriptions s
         WHERE d.${OWNED} AND d.send_started_at IS NULL
           AND s.id = d.subscription_id AND s.team_id = d.team_id
           AND s.state = 'active' AND d.event_type = ANY(s.event_types)`,
        [claim.id, claim.leaseOwner],
      );
      if (handoff.rowCount !== 1) return 'suppressed';
      handedOff = true;
      const body = JSON.stringify(payload, Object.keys(payload).toSorted());
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = `v1,${createHmac('sha256', secret)
        .update(`${claim.webhookId}.${timestamp}.${body}`)
        .digest('base64')}`;
      const status = await this.sender.send({
        id: claim.webhookId,
        url: claim.url,
        timestamp,
        signature,
        body,
      });
      claim.responseStatus = status;
      if (status >= 200 && status < 300) return;
      const retryable =
        status === 408 || status === 425 || status === 429 || status >= 500;
      throw new WebhookDeliveryError(
        retryable ? 'retryable' : 'permanent',
        status,
      );
    } catch (error) {
      if (error instanceof ProtectedDataError) return 'suppressed';
      if (error instanceof WebhookDeliveryError) throw error;
      throw new WebhookDeliveryError(handedOff ? 'uncertain' : 'retryable');
    } finally {
      secret?.fill(0);
    }
  }

  async recordFailure(
    claim: ClaimedWebhookDelivery,
    lease: OutboxLease,
    error: unknown,
    retryDelayMs: number | null,
  ): Promise<boolean> {
    const status =
      error instanceof WebhookDeliveryError ? error.statusCode : null;
    if (retryDelayMs === null)
      return this.finishTerminal(claim, 'failed', status, 'owned');
    const retried = await this.options.pool.query(
      `UPDATE webhook_deliveries
       SET send_started_at = NULL, lease_owner = NULL, lease_expires_at = NULL,
           available_at = clock_timestamp() + make_interval(secs => $3::float / 1000),
           last_status_code = $4, last_error = 'delivery_retryable'
       WHERE ${OWNED}`,
      [claim.id, lease.owner, retryDelayMs, status],
    );
    return retried.rowCount === 1;
  }

  recordComplete(
    claim: ClaimedWebhookDelivery,
    lease: OutboxLease,
  ): Promise<boolean> {
    return this.finishTerminal(
      claim,
      'delivered',
      claim.responseStatus ?? null,
      'owned',
      lease.owner,
    );
  }

  recordUncertain(
    claim: ClaimedWebhookDelivery,
    lease: OutboxLease,
    _error: unknown,
  ): Promise<boolean> {
    return this.finishTerminal(
      claim,
      'uncertain',
      claim.responseStatus ?? null,
      'owned',
      lease.owner,
    );
  }

  private async finishTerminal(
    claim: ClaimedWebhookDelivery,
    outcome: 'delivered' | 'failed' | 'uncertain' | 'suppressed',
    statusCode: number | null,
    ownership: 'owned' | 'expired',
    leaseOwner = claim.leaseOwner,
  ): Promise<boolean> {
    try {
      return await runAuditedSystemMutation(
        {
          tenantDb: createTenantDb(this.options.pool, claim.teamId),
          actorLabel: 'Webhook delivery',
          requestId: randomUUID(),
        },
        async (client, context) => {
          const finished =
            ownership === 'expired'
              ? await this.finishExpired(
                  client,
                  claim,
                  outcome,
                  statusCode,
                  leaseOwner,
                )
              : await this.finishOwned(
                  client,
                  claim.id,
                  outcome,
                  statusCode,
                  leaseOwner,
                );
          if (finished.rowCount !== 1) throw new LeaseLostError();
          const events: [AuditEventInput, ...AuditEventInput[]] = [
            deliveryEvent(
              context,
              claim,
              `webhook.delivery.${outcome}`,
              statusCode,
            ),
          ];
          if (outcome === 'delivered') {
            await client.query(
              `UPDATE webhook_subscriptions
               SET consecutive_failures = 0, last_failure_at = NULL,
                   updated_at = clock_timestamp()
               WHERE id = $1 AND team_id = $2`,
              [claim.subscriptionId, claim.teamId],
            );
          } else if (outcome === 'failed' || outcome === 'uncertain') {
            const subscription = await client.query<{ disabled: boolean }>(
              `UPDATE webhook_subscriptions
               SET consecutive_failures = consecutive_failures + 1,
                   last_failure_at = clock_timestamp(),
                   state = CASE WHEN consecutive_failures + 1 >= $3 THEN 'disabled' ELSE state END,
                   disabled_at = CASE WHEN consecutive_failures + 1 >= $3 THEN clock_timestamp() ELSE disabled_at END,
                   updated_at = clock_timestamp()
               WHERE id = $1 AND team_id = $2 AND state = 'active'
               RETURNING state = 'disabled' AND consecutive_failures = $3 AS disabled`,
              [claim.subscriptionId, claim.teamId, FAILURE_DISABLE_THRESHOLD],
            );
            if (subscription.rows[0]?.disabled) {
              events.push({
                ...context,
                eventVersion: 1,
                eventType: 'webhook.subscription.disabled',
                category: 'integration',
                outcome: 'succeeded',
                subjectType: null,
                subjectId: null,
                subjectLabel: null,
                resourceType: 'webhook_subscription',
                resourceId: claim.subscriptionId,
                resourceLabel: null,
                details: { reason: 'consecutive_failures' },
              });
            }
          }
          return { result: true, events };
        },
      );
    } catch (error) {
      if (error instanceof LeaseLostError) return false;
      throw error;
    }
  }

  private finishOwned(
    client: pg.PoolClient,
    deliveryId: string,
    outcome: 'delivered' | 'failed' | 'uncertain' | 'suppressed',
    statusCode: number | null,
    leaseOwner: string,
  ) {
    return client.query(
      `UPDATE webhook_deliveries
       SET delivered_at = CASE WHEN $3 = 'delivered' THEN clock_timestamp() END,
           uncertain_at = CASE WHEN $3 = 'uncertain' THEN clock_timestamp() END,
           failed_at = CASE WHEN $3 IN ('failed', 'suppressed') THEN clock_timestamp() END,
           lease_owner = NULL, lease_expires_at = NULL,
           last_status_code = $4,
           last_error = CASE WHEN $3 = 'delivered' THEN NULL ELSE 'delivery_' || $3 END
       WHERE id = $1 AND lease_owner = $2 AND ${PENDING}`,
      [deliveryId, leaseOwner, outcome, statusCode],
    );
  }

  private finishExpired(
    client: pg.PoolClient,
    claim: ClaimedWebhookDelivery,
    outcome: 'delivered' | 'failed' | 'uncertain' | 'suppressed',
    statusCode: number | null,
    leaseOwner: string,
  ) {
    return client.query(
      `UPDATE webhook_deliveries
       SET delivered_at = CASE WHEN $3 = 'delivered' THEN clock_timestamp() END,
           uncertain_at = CASE WHEN $3 = 'uncertain' THEN clock_timestamp() END,
           failed_at = CASE WHEN $3 IN ('failed', 'suppressed') THEN clock_timestamp() END,
           lease_owner = NULL, lease_expires_at = NULL,
           last_status_code = $4,
           last_error = CASE WHEN $3 = 'delivered' THEN NULL ELSE 'delivery_' || $3 END
       WHERE id = $1 AND lease_owner = $2
         AND lease_expires_at <= clock_timestamp() AND ${PENDING}`,
      [claim.id, leaseOwner, outcome, statusCode],
    );
  }
}

export function createWebhookDeliveryDispatcher(options: Options) {
  return new OutboxDispatcher({
    ...options,
    adapter: new WebhookDeliveryAdapter(options),
  });
}

export type WebhookDeliveryWorker = OutboxWorker;

export function startWebhookDeliveryWorker(
  options: Options & {
    reportError?: (error: unknown) => void | Promise<void>;
    pollIntervalMs?: number;
    drainLimit?: number;
  },
): WebhookDeliveryWorker {
  const dispatcher = createWebhookDeliveryDispatcher(options);
  return startOutboxWorker({
    queue: QUEUE,
    runOnce: () => dispatcher.runOnce(),
    observer: options.observer,
    onError: options.reportError,
    pollIntervalMs: options.pollIntervalMs,
    drainLimit: options.drainLimit,
  });
}
