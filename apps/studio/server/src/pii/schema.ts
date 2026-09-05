import { sql } from 'drizzle-orm';
import {
  bytea,
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

// A non-PII proof of every key the database has depended on. Keeping proofs
// after live rotation makes dropping a historical restore key fail at boot.
// Backup expiry alone cannot prove that an operator retained the right roots,
// so automatic key retirement is deliberately unsupported.
const encryptionKeyVerifications = pgTable(
  'encryption_key_verifications',
  {
    purpose: text('purpose').notNull(),
    keyId: text('key_id').notNull(),
    proof: bytea('proof').notNull(),
    introducedAt: timestamp('introduced_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.purpose, table.keyId] }),
    check(
      'encryption_key_verifications_purpose_check',
      sql`${table.purpose} IN ('pii-enc', 'pii-index', 'integration-enc')`,
    ),
    check(
      'encryption_key_verifications_key_id_check',
      sql`${table.keyId} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'`,
    ),
    check(
      'encryption_key_verifications_proof_check',
      sql`octet_length(${table.proof}) = 32`,
    ),
  ],
);

// OAuth identities are deployment-wide. They have no authoritative team;
// inventing one would weaken both authorization and audit isolation. This
// append-only log records credential operations with stable identifiers only.
const credentialAuditEvents = pgTable(
  'credential_audit_events',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id').notNull(),
    accountId: text('account_id').notNull(),
    action: text('action').notNull(),
    outcome: text('outcome').notNull(),
    requestId: uuid('request_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .default(sql`statement_timestamp()`),
  },
  (table) => [
    index('credential_audit_events_account_id_occurred_at_idx').on(
      table.accountId,
      table.occurredAt,
    ),
    check(
      'credential_audit_events_action_check',
      sql`${table.action} IN ('read', 'write', 'rotate', 'migrate_legacy')`,
    ),
    check(
      'credential_audit_events_outcome_check',
      sql`${table.outcome} IN ('succeeded', 'denied', 'failed')`,
    ),
    check(
      'credential_audit_events_identifiers_check',
      sql`char_length(${table.userId}) BETWEEN 1 AND 255 AND char_length(${table.accountId}) BETWEEN 1 AND 255`,
    ),
  ],
);

export const PII_TABLES = { encryptionKeyVerifications, credentialAuditEvents };

export const PII_SIDECAR_SQL = `
-- Historical OAuth plaintext is readable only by the offline converter.
-- Runtime code cannot introduce another value into these legacy columns.
CREATE OR REPLACE FUNCTION account_refuse_new_plaintext_tokens() RETURNS trigger AS $$
BEGIN
  IF current_user IN ('studio_app', 'studio_maintenance') AND (
    (NEW."accessToken" IS NOT NULL AND (TG_OP = 'INSERT' OR NEW."accessToken" IS DISTINCT FROM OLD."accessToken"))
    OR (NEW."refreshToken" IS NOT NULL AND (TG_OP = 'INSERT' OR NEW."refreshToken" IS DISTINCT FROM OLD."refreshToken"))
    OR (NEW."idToken" IS NOT NULL AND (TG_OP = 'INSERT' OR NEW."idToken" IS DISTINCT FROM OLD."idToken"))
  ) THEN
    RAISE EXCEPTION 'plaintext OAuth token writes are forbidden';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER account_no_new_plaintext_tokens
  BEFORE INSERT OR UPDATE ON account
  FOR EACH ROW EXECUTE FUNCTION account_refuse_new_plaintext_tokens();

CREATE OR REPLACE FUNCTION encryption_evidence_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'encryption evidence is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER encryption_key_verifications_immutable
  BEFORE UPDATE OR DELETE ON encryption_key_verifications
  FOR EACH ROW EXECUTE FUNCTION encryption_evidence_is_immutable();
CREATE OR REPLACE TRIGGER encryption_key_verifications_no_truncate
  BEFORE TRUNCATE ON encryption_key_verifications
  FOR EACH STATEMENT EXECUTE FUNCTION encryption_evidence_is_immutable();
CREATE OR REPLACE TRIGGER credential_audit_events_immutable
  BEFORE UPDATE OR DELETE ON credential_audit_events
  FOR EACH ROW EXECUTE FUNCTION encryption_evidence_is_immutable();
CREATE OR REPLACE TRIGGER credential_audit_events_no_truncate
  BEFORE TRUNCATE ON credential_audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION encryption_evidence_is_immutable();

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON encryption_key_verifications FROM ${TENANT_ROLES.app};
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON encryption_key_verifications FROM ${TENANT_ROLES.maintenance};
GRANT SELECT, INSERT ON encryption_key_verifications TO ${TENANT_ROLES.maintenance};
REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON credential_audit_events FROM ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance};
GRANT INSERT ON credential_audit_events TO ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance};
`;
