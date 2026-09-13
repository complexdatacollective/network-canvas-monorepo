import { createHmac, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import type { LookupFunction } from 'node:net';

import ipaddr from 'ipaddr.js';
import type pg from 'pg';

import {
  StudyCreatedWebhookEventSchema,
  WebhookEventTypeSchema,
} from '@codaco/studio-rpc/webhooks';
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
import {
  readWebhookSecretForDelivery,
  type WebhookSecretRead,
} from '../pii/webhooks.ts';

const QUEUE = 'webhook_deliveries';
const PENDING =
  'delivered_at IS NULL AND failed_at IS NULL AND uncertain_at IS NULL';
const OWNED = `id = $1 AND lease_owner = $2 AND ${PENDING}`;
const FAILURE_DISABLE_THRESHOLD = 5;

const WebhookPayloadSchema = StudyCreatedWebhookEventSchema;

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

class WebhookDeliveryError extends Error {
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

export function consumeWebhookResponse(response: {
  statusCode?: number;
  destroy(error?: Error): unknown;
}): number {
  const status = response.statusCode;
  response.destroy();
  if (status === undefined) throw new WebhookDeliveryError('retryable');
  return status;
}

function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

/** Resolve once, reject any mixed/private answer, and pin the selected address. */
type AddressLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<{ address: string; family: number }[]>;

async function resolvePublicAddress(
  hostname: string,
  lookupAddress: AddressLookup,
) {
  const addresses = await lookupAddress(normalizeDnsHostname(hostname), {
    all: true,
    verbatim: true,
  });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicAddress(address))
  )
    throw new WebhookDeliveryError('permanent');
  return addresses[0]!;
}

export function normalizeDnsHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

export function createPinnedLookup(pinned: {
  address: string;
  family: number;
}): LookupFunction {
  const family = pinned.family === 6 ? 6 : 4;
  return (_hostname, options, callback) => {
    if (typeof options === 'object' && options.all) {
      callback(null, [{ address: pinned.address, family }]);
      return;
    }
    callback(null, pinned.address, family);
  };
}

export function createStandardWebhookSender(
  options: { timeoutMs?: number; lookupAddress?: AddressLookup } = {},
): WebhookSender {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const lookupAddress = options.lookupAddress ?? lookup;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error('webhook timeout must be a positive finite number');
  return {
    async send(input) {
      const deadline = Date.now() + timeoutMs;
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
        pinned = await new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new WebhookDeliveryError('retryable')),
            timeoutMs,
          );
          timer.unref();
          void resolvePublicAddress(url.hostname, lookupAddress).then(
            (address) => {
              clearTimeout(timer);
              resolve(address);
              return undefined;
            },
            (error: unknown) => {
              clearTimeout(timer);
              reject(error);
              return undefined;
            },
          );
        });
      } catch (error) {
        if (error instanceof WebhookDeliveryError) throw error;
        throw new WebhookDeliveryError('retryable');
      }
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw new WebhookDeliveryError('retryable');
      return new Promise<number>((resolve, reject) => {
        let settled = false;
        let timer: NodeJS.Timeout;
        const settle = (work: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          work();
        };
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
            lookup: createPinnedLookup(pinned),
          },
          (response) => {
            try {
              const status = consumeWebhookResponse(response);
              settle(() => resolve(status));
            } catch (error) {
              settle(() => reject(error));
            }
          },
        );
        timer = setTimeout(
          () => outgoing.destroy(new WebhookDeliveryError('retryable')),
          remainingMs,
        );
        timer.unref();
        outgoing.once('error', () =>
          settle(() => reject(new WebhookDeliveryError('retryable'))),
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
  handoff?: typeof beginWebhookHandoff;
};

class LeaseLostError extends Error {}

export type WebhookHandoffResult =
  | 'handed-off'
  | 'retry'
  | 'suppressed'
  | 'lease-lost';

export async function beginWebhookHandoff(
  pool: pg.Pool,
  claim: Pick<
    ClaimedWebhookDelivery,
    'id' | 'teamId' | 'subscriptionId' | 'eventType' | 'leaseOwner'
  >,
  snapshot: WebhookSecretRead['snapshot'],
): Promise<WebhookHandoffResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock in the same order as terminal finalization (delivery, then
    // subscription). The lock is held only through this database handoff,
    // never across the outbound request. This gives disable/rotation a clear
    // linearization point: a mutation committed before this check wins, while
    // one that follows the handoff is explicitly an in-flight send.
    const delivery = await client.query<{
      teamId: string;
      subscriptionId: string;
    }>(
      `SELECT team_id AS "teamId", subscription_id AS "subscriptionId"
       FROM webhook_deliveries
       WHERE id = $1 AND team_id = $2 AND subscription_id = $3
         AND lease_owner = $4 AND ${PENDING}
         AND send_started_at IS NULL
         AND lease_expires_at > statement_timestamp()
       FOR UPDATE`,
      [claim.id, claim.teamId, claim.subscriptionId, claim.leaseOwner],
    );
    const row = delivery.rows[0];
    if (!row) {
      await client.query('COMMIT');
      return 'lease-lost';
    }
    const subscription = await client.query<{
      active: boolean;
      subscribed: boolean;
      snapshotMatches: boolean;
    }>(
      `SELECT state = 'active' AS active,
              $3 = ANY(event_types) AS subscribed,
              secret_key_id = $4 AND secret_algorithm = $5
                AND secret_ciphertext = $6 AS "snapshotMatches"
       FROM webhook_subscriptions
       WHERE id = $1 AND team_id = $2
       FOR UPDATE`,
      [
        row.subscriptionId,
        row.teamId,
        claim.eventType,
        snapshot.secretKeyId,
        snapshot.secretAlgorithm,
        snapshot.secretCiphertext,
      ],
    );
    const current = subscription.rows[0];
    if (!current || !current.active || !current.subscribed) {
      await client.query('COMMIT');
      return 'suppressed';
    }
    if (!current.snapshotMatches) {
      await client.query('COMMIT');
      return 'retry';
    }
    const handoff = await client.query(
      `UPDATE webhook_deliveries
       SET send_started_at = clock_timestamp()
       WHERE id = $1 AND lease_owner = $2 AND ${PENDING}
         AND send_started_at IS NULL
         AND lease_expires_at > statement_timestamp()`,
      [claim.id, claim.leaseOwner],
    );
    await client.query('COMMIT');
    return handoff.rowCount === 1 ? 'handed-off' : 'lease-lost';
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

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
  private readonly handoff: typeof beginWebhookHandoff;
  private readonly options: Options;

  constructor(options: Options) {
    this.options = options;
    this.sender = options.sender ?? createStandardWebhookSender();
    this.handoff = options.handoff ?? beginWebhookHandoff;
  }

  failureDisposition(error: unknown) {
    if (!(error instanceof WebhookDeliveryError)) return 'retryable';
    return error.disposition === 'uncertain' ? 'retryable' : error.disposition;
  }

  completionFailureDisposition(): 'retryable' {
    return 'retryable';
  }

  async suppressUndeliverable(): Promise<number> {
    return 0;
  }

  /**
   * Replay with the current configured key; the stable webhook id is the
   * receiver's deduplication boundary when the previous POST was ambiguous.
   */
  async reconcileExpiredRetries(): Promise<number> {
    const reconciled = await this.options.pool.query(
      `UPDATE webhook_deliveries SET send_started_at=NULL,lease_owner=NULL,lease_expires_at=NULL,
         available_at=clock_timestamp(),last_error='delivery_retryable'
       WHERE ${PENDING} AND lease_expires_at<=clock_timestamp() AND send_started_at IS NOT NULL
         AND attempt_count < $1`,
      [this.options.maxAttempts ?? 8],
    );
    return reconciled.rowCount ?? 0;
  }

  async failExhaustedLeases(maxAttempts: number): Promise<number> {
    const candidates = await this.options.pool.query<ClaimedWebhookDelivery>(
      `SELECT d.id, d.team_id AS "teamId", d.subscription_id AS "subscriptionId",
              d.webhook_id AS "webhookId", d.event_type AS "eventType",
              d.payload, s.url, d.attempt_count AS "attemptCount",
              d.lease_owner AS "leaseOwner", d.send_started_at AS "sendStartedAt"
       FROM webhook_deliveries d
       JOIN webhook_subscriptions s ON s.id = d.subscription_id AND s.team_id = d.team_id
       WHERE ${PENDING}
         AND (d.lease_expires_at <= clock_timestamp()
           OR (d.lease_owner IS NULL AND d.lease_expires_at IS NULL))
         AND d.attempt_count >= $1
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
       WHERE ${OWNED} AND lease_expires_at > statement_timestamp()`,
      [claim.id, lease.owner, lease.durationMs],
    );
    return renewed.rowCount === 1;
  }

  async deliver(claim: ClaimedWebhookDelivery): Promise<void | 'suppressed'> {
    let secret: Buffer | undefined;
    try {
      // Historical seed types remain listable for operators, but this worker
      // must not imply a producer or wire contract that the runtime lacks.
      if (!WebhookEventTypeSchema.safeParse(claim.eventType).success)
        throw new WebhookDeliveryError('permanent');
      const parsed = WebhookPayloadSchema.safeParse(claim.payload);
      if (!parsed.success) throw new WebhookDeliveryError('permanent');
      const payload = parsed.data;
      if (
        payload.type !== claim.eventType ||
        payload.teamId !== claim.teamId ||
        payload.resourceId !== payload.studyId
      )
        throw new WebhookDeliveryError('permanent');
      const secretRead = await readWebhookSecretForDelivery(
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
      secret = secretRead.secret;
      const handoff = await this.handoff(
        this.options.pool,
        claim,
        secretRead.snapshot,
      );
      if (handoff === 'suppressed') return 'suppressed';
      if (handoff === 'retry') throw new WebhookDeliveryError('retryable');
      if (handoff === 'lease-lost') throw new LeaseLostError();
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
      if (error instanceof LeaseLostError) throw error;
      if (error instanceof WebhookDeliveryError) throw error;
      throw new WebhookDeliveryError('retryable');
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
       WHERE id = $1
         AND ((lease_owner = $2 AND lease_expires_at <= clock_timestamp())
           OR (lease_owner IS NULL AND lease_expires_at IS NULL))
         AND ${PENDING}`,
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
