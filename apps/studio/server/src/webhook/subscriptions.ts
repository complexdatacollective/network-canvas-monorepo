import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import {
  StoredWebhookEventTypeSchema,
  type WebhookEventType,
  type WebhookSubscription,
} from '@codaco/studio-rpc';

import {
  auditActorEventContext,
  type AuditedCommandContext,
  runAuditedCommand,
} from '../audit/command.ts';
import type { AuditEventInput } from '../audit/events.ts';
import { runNoAuditTenantTransaction } from '../audit/transaction.ts';
import type { EncryptionKeys } from '../pii/keys.ts';
import { createDataProtection, ProtectedDataError } from '../pii/protection.ts';
import { roleGrantsTeamAdministration } from '../team/roles.ts';
import { TeamStore } from '../team/store.ts';

export type WebhookSubscriptionErrorCode =
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'NOT_FOUND';

export class WebhookSubscriptionError extends Error {
  readonly code: WebhookSubscriptionErrorCode;

  constructor(code: WebhookSubscriptionErrorCode) {
    super(code);
    this.name = 'WebhookSubscriptionError';
    this.code = code;
  }
}

type SubscriptionRow = {
  id: string;
  studyId: string | null;
  url: string;
  description: string | null;
  eventTypes: string[];
  state: 'active' | 'disabled';
  createdAt: Date;
  updatedAt: Date;
};

const teams = new TeamStore();

function render(row: SubscriptionRow): WebhookSubscription {
  return {
    ...row,
    eventTypes: row.eventTypes.map((event) =>
      StoredWebhookEventTypeSchema.parse(event),
    ),
  };
}

function secretBytes(value: string): Buffer {
  const encoded = value.slice('whsec_'.length);
  const bytes = Buffer.from(encoded, 'base64url');
  if (bytes.byteLength !== 32 || bytes.toString('base64url') !== encoded) {
    bytes.fill(0);
    throw new WebhookSubscriptionError('CONFLICT');
  }
  return bytes;
}

function assertUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WebhookSubscriptionError('CONFLICT');
  }
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== '' ||
    url.href.length < 12 ||
    url.href.length > 2000
  )
    throw new WebhookSubscriptionError('CONFLICT');
  return url.href;
}

async function lockAdministrator(
  client: pg.PoolClient,
  context: AuditedCommandContext,
): Promise<void> {
  const actor = await teams.lockActor(
    client,
    context.tenantDb.teamId,
    context.principal.userId,
  );
  if (!actor || !roleGrantsTeamAdministration(actor.role))
    throw new WebhookSubscriptionError('FORBIDDEN');
}

function configurationEvent(
  context: ReturnType<typeof auditActorEventContext>,
  subscriptionId: string,
  event:
    | {
        type: 'webhook.subscription.created';
        studyId: string | null;
        eventTypes: WebhookEventType[];
      }
    | { type: 'webhook.subscription.disabled' },
): AuditEventInput {
  const common = {
    ...context,
    eventVersion: 1,
    category: 'integration',
    outcome: 'succeeded',
    subjectType: null,
    subjectId: null,
    subjectLabel: null,
    resourceType: 'webhook_subscription',
    resourceId: subscriptionId,
    resourceLabel: null,
  } as const;
  if (event.type === 'webhook.subscription.created') {
    return {
      ...common,
      eventType: event.type,
      details: { studyId: event.studyId, eventTypes: event.eventTypes },
    };
  }
  return {
    ...common,
    eventType: event.type,
    details: { reason: 'operator' },
  };
}

export async function listWebhookSubscriptions(
  context: AuditedCommandContext,
): Promise<WebhookSubscription[]> {
  return runNoAuditTenantTransaction(
    context.tenantDb,
    'integration.listWebhooks',
    async (client) => {
      await lockAdministrator(client, context);
      const result = await client.query<SubscriptionRow>(
        `SELECT id, study_id AS "studyId", url, description,
                event_types AS "eventTypes", state,
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM webhook_subscriptions WHERE team_id = $1
         ORDER BY created_at, id`,
        [context.tenantDb.teamId],
      );
      return result.rows.map(render);
    },
  );
}

export async function createWebhookSubscription(
  keys: EncryptionKeys,
  context: AuditedCommandContext,
  input: {
    subscriptionId: string;
    studyId?: string | null;
    url: string;
    description?: string | null;
    eventTypes: WebhookEventType[];
    secret: string;
  },
): Promise<{ subscription: WebhookSubscription }> {
  const plaintext = secretBytes(input.secret);
  try {
    return await runAuditedCommand(context, async (client, auditContext) => {
      await lockAdministrator(client, context);
      const teamId = context.tenantDb.teamId;
      const studyId = input.studyId ?? null;
      if (studyId !== null) throw new WebhookSubscriptionError('CONFLICT');
      const protection = createDataProtection(keys, {
        participant: async () => {
          throw new ProtectedDataError();
        },
        integration: async () => {
          throw new ProtectedDataError();
        },
      });
      const sealed = protection.encryptIntegration(
        {
          kind: 'webhook',
          teamId,
          subscriptionId: input.subscriptionId,
          column: 'secret_ciphertext',
        },
        plaintext,
      );
      const inserted = await client.query<SubscriptionRow>(
        `INSERT INTO webhook_subscriptions
           (id, team_id, study_id, url, description, event_types,
            secret_ciphertext, secret_key_id, secret_algorithm,
            created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING
         RETURNING id, study_id AS "studyId", url, description,
                   event_types AS "eventTypes", state,
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          input.subscriptionId,
          teamId,
          studyId,
          assertUrl(input.url),
          input.description?.trim() || null,
          input.eventTypes,
          sealed.envelope,
          sealed.keyId,
          sealed.algorithm,
          context.principal.userId,
        ],
      );
      const row = inserted.rows[0];
      if (!row) throw new WebhookSubscriptionError('CONFLICT');
      return {
        status: 'succeeded',
        result: { subscription: render(row) },
        events: [
          configurationEvent(auditActorEventContext(auditContext), row.id, {
            type: 'webhook.subscription.created',
            studyId,
            eventTypes: input.eventTypes,
          }),
        ],
      };
    });
  } finally {
    plaintext.fill(0);
  }
}

export function disableWebhookSubscription(
  context: AuditedCommandContext,
  subscriptionId: string,
): Promise<{ subscriptionId: string; state: 'disabled' }> {
  return runAuditedCommand(context, async (client, auditContext) => {
    await lockAdministrator(client, context);
    const current = await client.query<{ state: string }>(
      `SELECT state FROM webhook_subscriptions
       WHERE id = $1 AND team_id = $2 FOR UPDATE`,
      [subscriptionId, context.tenantDb.teamId],
    );
    const row = current.rows[0];
    if (!row) throw new WebhookSubscriptionError('NOT_FOUND');
    const result = { subscriptionId, state: 'disabled' as const };
    if (row.state === 'disabled') return { status: 'unchanged', result };
    await client.query(
      `UPDATE webhook_subscriptions
       SET state = 'disabled', disabled_at = clock_timestamp(),
           updated_at = clock_timestamp()
       WHERE id = $1 AND team_id = $2`,
      [subscriptionId, context.tenantDb.teamId],
    );
    return {
      status: 'succeeded',
      result,
      events: [
        configurationEvent(
          auditActorEventContext(auditContext),
          subscriptionId,
          { type: 'webhook.subscription.disabled' },
        ),
      ],
    };
  });
}

/** Stable Standard Webhooks identity is stored once with each source event. */
export async function enqueueWebhookEvent(
  client: pg.PoolClient,
  event: {
    type: WebhookEventType;
    teamId: string;
    studyId: string;
    resourceId: string;
  },
): Promise<number> {
  const subscriptions = await client.query<{ id: string }>(
    `SELECT id FROM webhook_subscriptions
     WHERE team_id = $1 AND state = 'active' AND $2 = ANY(event_types)
       AND (study_id IS NULL OR study_id = $3)
     ORDER BY id FOR SHARE`,
    [event.teamId, event.type, event.studyId],
  );
  for (const subscription of subscriptions.rows) {
    const deliveryId = randomUUID();
    await client.query(
      `INSERT INTO webhook_deliveries
         (id, team_id, subscription_id, webhook_id, event_type, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        deliveryId,
        event.teamId,
        subscription.id,
        deliveryId,
        event.type,
        {
          type: event.type,
          teamId: event.teamId,
          studyId: event.studyId,
          resourceId: event.resourceId,
        },
      ],
    );
  }
  return subscriptions.rowCount ?? 0;
}
