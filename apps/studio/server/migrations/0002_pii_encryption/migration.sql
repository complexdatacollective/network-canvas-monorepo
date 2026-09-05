-- Reviewed representation upgrade. Drop only guards whose old WHEN/check
-- expressions depend on text columns being converted; ordered sidecars recreate
-- their current definitions before this transaction can commit.
DROP TRIGGER "message_delivery_payload_immutable" ON "message_deliveries";
DROP TRIGGER "participants_writable" ON "participants";
ALTER TABLE "message_deliveries" DROP CONSTRAINT "message_deliveries_hash_check";
ALTER TABLE "participant_contact_optouts" DROP CONSTRAINT "participant_contact_optouts_blind_index_check";

CREATE TABLE "encryption_key_verifications" (
	"purpose" text,
	"key_id" text,
	"proof" bytea NOT NULL,
	"introduced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "encryption_key_verifications_pkey" PRIMARY KEY("purpose","key_id"),
	CONSTRAINT "encryption_key_verifications_purpose_check" CHECK ("purpose" IN ('pii-enc', 'pii-index', 'integration-enc')),
	CONSTRAINT "encryption_key_verifications_key_id_check" CHECK ("key_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
	CONSTRAINT "encryption_key_verifications_proof_check" CHECK (octet_length("proof") = 32)
);

CREATE TABLE "credential_audit_events" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"request_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	CONSTRAINT "credential_audit_events_action_check" CHECK ("action" IN ('read', 'write', 'rotate', 'migrate_legacy')),
	CONSTRAINT "credential_audit_events_outcome_check" CHECK ("outcome" IN ('succeeded', 'denied', 'failed')),
	CONSTRAINT "credential_audit_events_identifiers_check" CHECK (char_length("user_id") BETWEEN 1 AND 255 AND char_length("account_id") BETWEEN 1 AND 255)
);

DROP POLICY "team_isolation" ON "participant_contact_optouts";
ALTER TABLE "participant_contact_optouts" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "participant_contact_optouts" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "account" ADD COLUMN "access_token_ciphertext" bytea;
ALTER TABLE "account" ADD COLUMN "access_token_key_id" text;
ALTER TABLE "account" ADD COLUMN "access_token_algorithm" text;
ALTER TABLE "account" ADD COLUMN "refresh_token_ciphertext" bytea;
ALTER TABLE "account" ADD COLUMN "refresh_token_key_id" text;
ALTER TABLE "account" ADD COLUMN "refresh_token_algorithm" text;
ALTER TABLE "account" ADD COLUMN "id_token_ciphertext" bytea;
ALTER TABLE "account" ADD COLUMN "id_token_key_id" text;
ALTER TABLE "account" ADD COLUMN "id_token_algorithm" text;
ALTER TABLE "participants" ADD COLUMN "blind_index_key_id" text;
ALTER TABLE "message_deliveries" ADD COLUMN "blind_index_key_id" text DEFAULT 'legacy-hex-v1' NOT NULL;
ALTER TABLE "message_deliveries" ALTER COLUMN "blind_index_key_id" DROP DEFAULT;
ALTER TABLE "participant_contact_optouts" ADD COLUMN "blind_index_key_id" text DEFAULT 'legacy-hex-v1' NOT NULL;
ALTER TABLE "participant_contact_optouts" ALTER COLUMN "blind_index_key_id" DROP DEFAULT;
ALTER TABLE "webhook_subscriptions" ADD COLUMN "secret_algorithm" text DEFAULT 'aes-256-gcm.v1' NOT NULL;
ALTER TABLE "webhook_subscriptions" ALTER COLUMN "secret_algorithm" DROP DEFAULT;
-- Moving to global suppression takes the earliest recorded opt-out for each
-- channel/index pair. Duplicate team copies are the same suppression decision.
WITH duplicates AS (
  SELECT ctid, row_number() OVER (
    PARTITION BY channel, recipient_blind_index
    ORDER BY opted_out_at, source, team_id
  ) AS ordinal FROM participant_contact_optouts
)
DELETE FROM participant_contact_optouts WHERE ctid IN (SELECT ctid FROM duplicates WHERE ordinal > 1);
ALTER TABLE "participant_contact_optouts" DROP COLUMN "team_id";
ALTER TABLE "participant_contact_optouts" ADD PRIMARY KEY ("channel","blind_index_key_id","recipient_blind_index");
ALTER TABLE "message_deliveries" ALTER COLUMN "recipient_blind_index" SET DATA TYPE bytea USING decode("recipient_blind_index", 'hex');
ALTER TABLE "participant_contact_optouts" ALTER COLUMN "recipient_blind_index" SET DATA TYPE bytea USING decode("recipient_blind_index", 'hex');
CREATE INDEX "credential_audit_events_account_id_occurred_at_idx" ON "credential_audit_events" ("account_id","occurred_at");
ALTER TABLE "account" ADD CONSTRAINT "account_access_token_envelope_check" CHECK (("access_token_ciphertext" IS NULL) = ("access_token_key_id" IS NULL) AND ("access_token_ciphertext" IS NULL) = ("access_token_algorithm" IS NULL) AND ("access_token_ciphertext" IS NULL OR (octet_length("access_token_ciphertext") >= 29 AND "access_token_algorithm" = 'aes-256-gcm.v1')));
ALTER TABLE "account" ADD CONSTRAINT "account_refresh_token_envelope_check" CHECK (("refresh_token_ciphertext" IS NULL) = ("refresh_token_key_id" IS NULL) AND ("refresh_token_ciphertext" IS NULL) = ("refresh_token_algorithm" IS NULL) AND ("refresh_token_ciphertext" IS NULL OR (octet_length("refresh_token_ciphertext") >= 29 AND "refresh_token_algorithm" = 'aes-256-gcm.v1')));
ALTER TABLE "account" ADD CONSTRAINT "account_id_token_envelope_check" CHECK (("id_token_ciphertext" IS NULL) = ("id_token_key_id" IS NULL) AND ("id_token_ciphertext" IS NULL) = ("id_token_algorithm" IS NULL) AND ("id_token_ciphertext" IS NULL OR (octet_length("id_token_ciphertext") >= 29 AND "id_token_algorithm" = 'aes-256-gcm.v1')));
-- The legacy index key was not recorded. Preserve its bytes under an explicit
-- unverified ID; the boot key gate must refuse these rows, never silently claim
-- that the supplied current root generated an old blind index.
SET LOCAL ROLE studio_maintenance;
UPDATE participants SET blind_index_key_id = 'legacy-unverified-v1'
WHERE email_index IS NOT NULL OR phone_index IS NOT NULL;
SET LOCAL ROLE NONE;
ALTER TABLE "participants" DROP CONSTRAINT "participants_blind_index_pairing_check", ADD CONSTRAINT "participants_blind_index_pairing_check" CHECK (("email_ciphertext" IS NULL) = ("email_index" IS NULL)
          AND ("phone_ciphertext" IS NULL) = ("phone_index" IS NULL)
          AND ("blind_index_key_id" IS NULL) = (num_nonnulls("email_index", "phone_index") = 0)
          AND ("email_index" IS NULL OR octet_length("email_index") = 32)
          AND ("phone_index" IS NULL OR octet_length("phone_index") = 32));
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_hash_check" CHECK ("rendered_body_hash" ~ '^[0-9a-f]{64}$'
          AND octet_length("recipient_blind_index") = 32
          AND char_length("blind_index_key_id") BETWEEN 1 AND 64);
ALTER TABLE "participant_contact_optouts" ADD CONSTRAINT "participant_contact_optouts_blind_index_check" CHECK (octet_length("recipient_blind_index") = 32
          AND char_length("blind_index_key_id") BETWEEN 1 AND 64);
ALTER TABLE "webhook_subscriptions" DROP CONSTRAINT "webhook_subscriptions_lengths_check", ADD CONSTRAINT "webhook_subscriptions_lengths_check" CHECK (char_length("secret_key_id") BETWEEN 1 AND 64
          AND "secret_algorithm" = 'aes-256-gcm.v1'
          AND octet_length("secret_ciphertext") BETWEEN 29 AND 512
          AND char_length("created_by_user_id") BETWEEN 1 AND 255
          AND ("description" IS NULL OR char_length("description") BETWEEN 1 AND 500));
