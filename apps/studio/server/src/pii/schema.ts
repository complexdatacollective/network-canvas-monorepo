import { getTableColumns, sql } from 'drizzle-orm';
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

import { AUTH_RUNTIME_TABLES } from '../db/auth-schema.ts';
import {
  CLASSIFIED_LEGACY_CONTACT_INDEX_ID,
  LEGACY_INDEX_REMEDIATION_GUARD_SQL,
} from './legacy-indexes.ts';

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
      sql`${table.action} IN ('read', 'write', 'rotate', 'migrate_legacy', 'delete')`,
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

const runtimeAccountColumns = Object.values(
  getTableColumns(AUTH_RUNTIME_TABLES.account),
)
  .map((column) => `"${column.name.replaceAll('"', '""')}"`)
  .join(', ');

export const PII_SIDECAR_SQL = `
-- Historical OAuth plaintext is readable only by the offline converter.
-- Runtime code cannot insert, clear or replace a retained legacy value.
-- The general auth grants run earlier, so remove both table- and column-level
-- access before enrolling the adapter's explicit non-legacy column projection.
REVOKE SELECT, INSERT, UPDATE ON account FROM PUBLIC, ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance};
REVOKE SELECT ("accessToken", "refreshToken", "idToken"), INSERT ("accessToken", "refreshToken", "idToken"), UPDATE ("accessToken", "refreshToken", "idToken") ON account FROM PUBLIC, ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance};
REVOKE INSERT (legacy_tokens_present), UPDATE (legacy_tokens_present) ON account FROM PUBLIC, ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance};
${['SELECT', 'INSERT', 'UPDATE'].map((privilege) => `GRANT ${privilege} (${runtimeAccountColumns}) ON account TO ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance};`).join('\n')}
GRANT SELECT (legacy_tokens_present) ON account TO ${TENANT_ROLES.maintenance};

-- SECURITY INVOKER is intentional: the deleting role must also be allowed to
-- append the mandatory event. A failed audit aborts single/bulk/cascade deletes.
-- Every account is a credential identity, including local password accounts.
CREATE OR REPLACE FUNCTION account_audit_deletion() RETURNS trigger AS $$
BEGIN
  -- Bind the target to the triggering table, not an invoker's search_path:
  -- a temporary table must never absorb mandatory durable evidence.
  EXECUTE pg_catalog.format(
    'INSERT INTO %I.credential_audit_events (id, user_id, account_id, action, outcome, request_id) VALUES (pg_catalog.gen_random_uuid(), $1, $2, ''delete'', ''succeeded'', pg_catalog.gen_random_uuid())',
    TG_TABLE_SCHEMA
  ) USING OLD."userId", OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
CREATE OR REPLACE TRIGGER account_audit_deletion
  BEFORE DELETE ON account
  FOR EACH ROW EXECUTE FUNCTION account_audit_deletion();

CREATE OR REPLACE FUNCTION account_refuse_new_plaintext_tokens() RETURNS trigger AS $$
BEGIN
  IF current_user IN ('studio_app', 'studio_maintenance') AND (
    (TG_OP = 'INSERT' AND (NEW."accessToken" IS NOT NULL OR NEW."refreshToken" IS NOT NULL OR NEW."idToken" IS NOT NULL))
    OR (TG_OP = 'UPDATE' AND (NEW."accessToken" IS DISTINCT FROM OLD."accessToken"
      OR NEW."refreshToken" IS DISTINCT FROM OLD."refreshToken"
      OR NEW."idToken" IS DISTINCT FROM OLD."idToken"))
  ) THEN
    RAISE EXCEPTION 'retained OAuth token writes are forbidden';
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

-- Startup exhaustively authenticates every stored key reference. Thereafter,
-- require each changed reference to name immutable proof evidence so a cheap
-- readiness probe cannot miss drift without rescanning the data corpus.
CREATE OR REPLACE FUNCTION encryption_key_reference_is_verified() RETURNS trigger AS $$
DECLARE
  argument_index integer;
  purpose_name text := TG_ARGV[0];
  column_name text;
  old_key_id text;
  new_key_id text;
  proof_ready boolean;
BEGIN
  FOR argument_index IN 1..TG_NARGS - 1 LOOP
    column_name := TG_ARGV[argument_index];
    new_key_id := pg_catalog.to_jsonb(NEW) ->> column_name;
    IF TG_OP = 'UPDATE' THEN
      old_key_id := pg_catalog.to_jsonb(OLD) ->> column_name;
      IF new_key_id IS NOT DISTINCT FROM old_key_id THEN CONTINUE; END IF;
    END IF;
    IF new_key_id IS NULL THEN CONTINUE; END IF;
    -- This identifier describes deliberately retained public legacy HMACs,
    -- not deployment key material. Its separate guard forbids new writes and
    -- permits only the classified migration transition.
    IF purpose_name = 'pii-index'
       AND new_key_id = '${CLASSIFIED_LEGACY_CONTACT_INDEX_ID}' THEN CONTINUE; END IF;
    EXECUTE pg_catalog.format(
      'SELECT EXISTS (SELECT 1 FROM %I.encryption_key_verifications WHERE purpose = $1 AND key_id = $2)',
      TG_TABLE_SCHEMA
    ) INTO proof_ready USING purpose_name, new_key_id;
    IF NOT proof_ready THEN
      RAISE EXCEPTION 'encrypted data may reference only a verified key';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog;

CREATE OR REPLACE TRIGGER participants_verified_pii_key_reference_guard
  BEFORE INSERT OR UPDATE OF pii_key_id ON participants
  FOR EACH ROW EXECUTE FUNCTION encryption_key_reference_is_verified('pii-enc', 'pii_key_id');
CREATE OR REPLACE TRIGGER participants_verified_index_key_reference_guard
  BEFORE INSERT OR UPDATE OF blind_index_key_id ON participants
  FOR EACH ROW EXECUTE FUNCTION encryption_key_reference_is_verified('pii-index', 'blind_index_key_id');
CREATE OR REPLACE TRIGGER message_deliveries_verified_key_reference_guard
  BEFORE INSERT OR UPDATE OF blind_index_key_id ON message_deliveries
  FOR EACH ROW EXECUTE FUNCTION encryption_key_reference_is_verified('pii-index', 'blind_index_key_id');
CREATE OR REPLACE TRIGGER participant_contact_optouts_verified_key_reference_guard
  BEFORE INSERT OR UPDATE OF blind_index_key_id ON participant_contact_optouts
  FOR EACH ROW EXECUTE FUNCTION encryption_key_reference_is_verified('pii-index', 'blind_index_key_id');
CREATE OR REPLACE TRIGGER webhook_subscriptions_verified_key_reference_guard
  BEFORE INSERT OR UPDATE OF secret_key_id ON webhook_subscriptions
  FOR EACH ROW EXECUTE FUNCTION encryption_key_reference_is_verified('integration-enc', 'secret_key_id');
CREATE OR REPLACE TRIGGER account_verified_key_reference_guard
  BEFORE INSERT OR UPDATE OF access_token_key_id, refresh_token_key_id, id_token_key_id ON account
  FOR EACH ROW EXECUTE FUNCTION encryption_key_reference_is_verified(
    'integration-enc', 'access_token_key_id', 'refresh_token_key_id', 'id_token_key_id'
  );
CREATE OR REPLACE TRIGGER credential_audit_events_immutable
  BEFORE UPDATE OR DELETE ON credential_audit_events
  FOR EACH ROW EXECUTE FUNCTION encryption_evidence_is_immutable();
CREATE OR REPLACE TRIGGER credential_audit_events_no_truncate
  BEFORE TRUNCATE ON credential_audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION encryption_evidence_is_immutable();

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON encryption_key_verifications FROM ${TENANT_ROLES.app};
GRANT SELECT (purpose, key_id) ON encryption_key_verifications TO ${TENANT_ROLES.app};
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON encryption_key_verifications FROM ${TENANT_ROLES.maintenance};
GRANT SELECT, INSERT ON encryption_key_verifications TO ${TENANT_ROLES.maintenance};
REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON credential_audit_events FROM ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance};
GRANT INSERT ON credential_audit_events TO ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance};

${LEGACY_INDEX_REMEDIATION_GUARD_SQL}
`;
