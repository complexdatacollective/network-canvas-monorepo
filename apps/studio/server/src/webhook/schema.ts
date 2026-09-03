import { sql } from 'drizzle-orm';
import {
  bytea,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  teamIsolationPolicy,
  tenantTablesSql,
  TENANT_ROLES,
} from '@codaco/studio-sync/rls';

import { STUDY_TABLES } from '../study/schema.ts';

const { studies } = STUDY_TABLES;

// One convention exception, stated loudly: `webhook_subscriptions.secret` is a
// *signing* key, not a verifier. Standard Webhooks requires the server to
// compute an HMAC over each outgoing body with the subscriber's secret, so the
// secret must be recoverable. It is therefore stored as ciphertext under the
// application encryption key (#1246 driver 2 — "PII encrypted in the
// application, keys never held by the database"), with a key id for rotation.
// Hashing it would make signing impossible. This is the only recoverable
// secret in the design.
const webhookSubscriptions = pgTable(
  'webhook_subscriptions',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    studyId: uuid('study_id'),
    url: text('url').notNull(),
    description: text('description'),
    eventTypes: text('event_types').array().notNull(),
    // AES-256-GCM ciphertext of the signing secret. NOT a hash: the server
    // must reproduce the secret to sign every outgoing request.
    secretCiphertext: bytea('secret_ciphertext').notNull(),
    // Names the key that produced the ciphertext, so rotation is a per-row
    // property. Its namespace is the integration key set, kept separate from
    // the participant PII key set (`participants.pii_key_id`): an outbound
    // integration secret and a participant's contact details must never be
    // recoverable with the same key.
    secretKeyId: text('secret_key_id').notNull(),
    state: text('state').notNull().default('active'),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdByUserId: text('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    foreignKey({
      name: 'webhook_subscriptions_study_fk',
      columns: [table.studyId, table.teamId],
      foreignColumns: [studies.id, studies.teamId],
    }),
    index('webhook_subscriptions_team_id_state_idx').on(
      table.teamId,
      table.state,
    ),
    check(
      'webhook_subscriptions_state_check',
      sql`${table.state} IN ('active', 'disabled')
          AND (${table.state} = 'disabled') = (${table.disabledAt} IS NOT NULL)`,
    ),
    // https only: a webhook carries resource ids for a team's private data,
    // and Standard Webhooks signatures do not provide confidentiality.
    check(
      'webhook_subscriptions_url_check',
      sql`${table.url} ~ '^https://' AND char_length(${table.url}) BETWEEN 12 AND 2000`,
    ),
    // COALESCE because array_length of an empty array is NULL, and a NULL
    // check passes: without it the bound this constraint exists to impose
    // would admit a subscription filtering on nothing.
    check(
      'webhook_subscriptions_event_types_check',
      sql`COALESCE(array_length(${table.eventTypes}, 1), 0) BETWEEN 1 AND 50`,
    ),
    check(
      'webhook_subscriptions_failures_check',
      sql`${table.consecutiveFailures} >= 0`,
    ),
    check(
      'webhook_subscriptions_lengths_check',
      sql`char_length(${table.secretKeyId}) BETWEEN 1 AND 64
          AND octet_length(${table.secretCiphertext}) BETWEEN 1 AND 512
          AND char_length(${table.createdByUserId}) BETWEEN 1 AND 255
          AND (${table.description} IS NULL OR char_length(${table.description}) BETWEEN 1 AND 500)`,
    ),
    teamIsolationPolicy(),
  ],
);

const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    subscriptionId: uuid('subscription_id').notNull(),
    // The Standard Webhooks `webhook-id` header value: the subscriber's
    // dedup key, and ours for redelivery.
    webhookId: text('webhook_id').notNull(),
    eventType: text('event_type').notNull(),
    // Thin by policy: event type, resource ids, team. Never a body.
    payload: jsonb('payload').notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseOwner: uuid('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    lastStatusCode: smallint('last_status_code'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.subscriptionId, table.webhookId),
    foreignKey({
      name: 'webhook_deliveries_subscription_fk',
      columns: [table.subscriptionId, table.teamId],
      foreignColumns: [webhookSubscriptions.id, webhookSubscriptions.teamId],
    }),
    index('webhook_deliveries_dispatch_idx')
      .on(table.availableAt, table.leaseExpiresAt)
      .where(sql`delivered_at IS NULL AND failed_at IS NULL`),
    index('webhook_deliveries_team_id_created_at_idx').on(
      table.teamId,
      table.createdAt.desc(),
    ),
    check(
      'webhook_deliveries_payload_object_check',
      sql`jsonb_typeof(${table.payload}) = 'object'
          AND pg_column_size(${table.payload}) <= 4096`,
    ),
    check(
      'webhook_deliveries_lease_check',
      sql`(${table.leaseOwner} IS NULL) = (${table.leaseExpiresAt} IS NULL)`,
    ),
    check(
      'webhook_deliveries_terminal_state_check',
      sql`num_nonnulls(${table.deliveredAt}, ${table.failedAt}) <= 1
          AND (
            num_nonnulls(${table.deliveredAt}, ${table.failedAt}) = 0
            OR (${table.leaseOwner} IS NULL AND ${table.leaseExpiresAt} IS NULL)
          )`,
    ),
    check(
      'webhook_deliveries_lengths_check',
      sql`char_length(${table.webhookId}) BETWEEN 1 AND 128
          AND char_length(${table.eventType}) BETWEEN 1 AND 128
          AND ${table.attemptCount} >= 0
          AND (${table.lastStatusCode} IS NULL OR ${table.lastStatusCode} BETWEEN 100 AND 599)
          AND (${table.lastError} IS NULL OR char_length(${table.lastError}) <= 1000)`,
    ),
    teamIsolationPolicy(),
  ],
);

export const WEBHOOK_TABLES = { webhookSubscriptions, webhookDeliveries };

// Hashed into the schema fingerprint — whitespace counts. CREATE OR REPLACE
// because DROP TABLE CASCADE leaves functions behind, and an `already exists`
// error reads as transient to the boot retry loop.
export const WEBHOOK_SIDECAR_SQL = `
CREATE OR REPLACE FUNCTION webhook_delivery_payload_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'webhook delivery payload is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER webhook_delivery_payload_immutable
  BEFORE UPDATE ON webhook_deliveries
  FOR EACH ROW
  WHEN (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.subscription_id IS DISTINCT FROM OLD.subscription_id
    OR NEW.webhook_id IS DISTINCT FROM OLD.webhook_id
    OR NEW.event_type IS DISTINCT FROM OLD.event_type
    OR NEW.payload IS DISTINCT FROM OLD.payload
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  )
  EXECUTE FUNCTION webhook_delivery_payload_is_immutable();

-- The composite key proves the subscription is the team's. It cannot prove
-- the subscription still wants the delivery, and both halves of that matter:
-- a disabled endpoint is one the retry policy gave up on, and an event type
-- outside the subscriber's filter is one they never asked for. A payload is
-- thin, but it is still a team's resource ids leaving the instance, so
-- queuing either is an egress the subscriber did not consent to — and the
-- payload trigger above then freezes it in place.
--
-- AFTER the row, so the length and payload checks and the subscription key
-- report first and this speaks only to a well-formed delivery addressed to a
-- real subscription of its own team.
CREATE OR REPLACE FUNCTION webhook_delivery_subscription_wants_event() RETURNS trigger AS $$
DECLARE
  subscription_state text;
  subscribed_types text[];
BEGIN
  SELECT s.state, s.event_types INTO subscription_state, subscribed_types
  FROM webhook_subscriptions s
  WHERE s.id = NEW.subscription_id AND s.team_id = NEW.team_id;

  IF subscription_state IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'a webhook delivery may only be queued for an active subscription';
  END IF;
  IF NOT (NEW.event_type = ANY(subscribed_types)) THEN
    RAISE EXCEPTION 'the subscription does not ask for % events', NEW.event_type;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER webhook_deliveries_subscription_wants_event
  AFTER INSERT ON webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION webhook_delivery_subscription_wants_event();

${tenantTablesSql(['webhook_subscriptions', 'webhook_deliveries'])}

-- Commands enqueue a delivery inside their audited transaction; only the
-- maintenance dispatcher advances its state. The revocation binds only where
-- this sidecar runs after db/access.ts's blanket grant over ALL TABLES, which
-- is where team_invitation_deliveries' matching revocation sits; the payload
-- trigger above holds for every role regardless.
REVOKE UPDATE, DELETE ON webhook_deliveries FROM ${TENANT_ROLES.app};
`;
