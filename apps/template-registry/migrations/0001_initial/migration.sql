CREATE TABLE "registry_auth_user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "registry_auth_session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);

CREATE TABLE "registry_auth_account" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	CONSTRAINT "registry_auth_account_disabled" CHECK (false)
);

CREATE TABLE "registry_auth_verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "registry_auth_rate_limit" (
	"id" text PRIMARY KEY,
	"key" text NOT NULL UNIQUE,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL
);

CREATE TABLE "registry_schema_fingerprint" (
	"id" boolean PRIMARY KEY DEFAULT true,
	"fingerprint" text NOT NULL,
	"instance_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registry_schema_singleton_check" CHECK ("id" = true),
	CONSTRAINT "registry_schema_fingerprint_check" CHECK ("fingerprint" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "registry_publishers" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"orcid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suspended_at" timestamp with time zone,
	CONSTRAINT "registry_publisher_name_check" CHECK (char_length("name") BETWEEN 1 AND 200 AND "name" ~ '[^[:space:]]'),
	CONSTRAINT "registry_publisher_orcid_check" CHECK ("orcid" IS NULL OR "orcid" ~ '^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$')
);

CREATE TABLE "registry_operators" (
	"user_id" text PRIMARY KEY,
	"enabled" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "registry_credentials" (
	"id" uuid PRIMARY KEY,
	"publisher_id" uuid NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"scopes" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "registry_credentials_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "registry_credentials_scopes_check" CHECK (cardinality("scopes") BETWEEN 1 AND 2 AND "scopes" <@ ARRAY['publish', 'moderate']::text[]),
	CONSTRAINT "registry_credentials_name_check" CHECK (char_length("name") BETWEEN 1 AND 100),
	CONSTRAINT "registry_credentials_expiry_check" CHECK ("expires_at" > "created_at")
);

CREATE TABLE "registry_artifacts" (
	"root" text PRIMARY KEY,
	"raw_hash" text NOT NULL UNIQUE,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "registry_artifact_hash_check" CHECK ("root" ~ '^[0-9a-f]{64}$' AND "raw_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "registry_artifact_size_check" CHECK ("byte_size" BETWEEN 1 AND 26214400),
	CONSTRAINT "registry_artifact_delete_check" CHECK ("deleted_at" IS NULL OR "blocked_at" IS NOT NULL)
);

CREATE TABLE "registry_artifact_content" (
	"root" text PRIMARY KEY,
	"template" jsonb NOT NULL,
	"metadata" jsonb NOT NULL,
	"license" text NOT NULL,
	CONSTRAINT "registry_content_objects_check" CHECK (jsonb_typeof("template") = 'object' AND jsonb_typeof("metadata") = 'object'),
	CONSTRAINT "registry_content_license_check" CHECK ("license" IN ('CC-BY-4.0', 'CC0-1.0'))
);

CREATE TABLE "registry_entries" (
	"id" uuid PRIMARY KEY,
	"sequence" bigint CONSTRAINT "registry_entry_sequence_unique" UNIQUE GENERATED ALWAYS AS IDENTITY (sequence name "registry_entries_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"publisher_id" uuid NOT NULL,
	"artifact_root" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"yanked_at" timestamp with time zone,
	"curated_at" timestamp with time zone,
	CONSTRAINT "registry_entry_publisher_root_unique" UNIQUE("publisher_id","artifact_root")
);

CREATE TABLE "registry_audit" (
	"id" uuid PRIMARY KEY,
	"occurred_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"subject_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	CONSTRAINT "registry_audit_actor_kind_check" CHECK ("actor_kind" IN ('publisher', 'operator', 'system', 'database_operator')),
	CONSTRAINT "registry_audit_lengths_check" CHECK (char_length("actor_id") BETWEEN 1 AND 255 AND char_length("subject_id") BETWEEN 1 AND 255),
	CONSTRAINT "registry_audit_action_check" CHECK ("action" IN ('publisher.claimed', 'credential.created', 'credential.revoked', 'entry.published', 'entry.yanked', 'artifact.taken_down', 'artifact.restored', 'artifact.hard_delete_requested', 'artifact.hard_delete_completed', 'publisher.suspended', 'publisher.reinstated', 'entry.curated', 'entry.uncurated', 'operator.granted', 'operator.revoked'))
);

CREATE TABLE "registry_delete_jobs" (
	"root" text PRIMARY KEY,
	"requested_audit_id" uuid NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "registry_delete_attempts_check" CHECK ("attempts" >= 0)
);

CREATE TABLE "registry_reports" (
	"id" uuid PRIMARY KEY,
	"sequence" bigint CONSTRAINT "registry_reports_sequence_unique" UNIQUE GENERATED ALWAYS AS IDENTITY (sequence name "registry_reports_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"entry_id" uuid NOT NULL,
	"category" text NOT NULL,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registry_report_category_check" CHECK ("category" IN ('privacy', 'copyright', 'harmful_content', 'spam', 'other')),
	CONSTRAINT "registry_report_details_check" CHECK ("details" IS NULL OR char_length("details") BETWEEN 1 AND 2000)
);

CREATE TABLE "registry_rate_counters" (
	"scope" text,
	"window_start" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "registry_rate_counters_pkey" PRIMARY KEY("scope","window_start"),
	CONSTRAINT "registry_rate_count_check" CHECK ("count" > 0),
	CONSTRAINT "registry_rate_scope_check" CHECK (char_length("scope") BETWEEN 1 AND 255)
);

CREATE INDEX "registry_auth_session_user_idx" ON "registry_auth_session" ("user_id");
CREATE INDEX "registry_auth_verification_identifier_idx" ON "registry_auth_verification" ("identifier");
CREATE INDEX "registry_credentials_publisher_idx" ON "registry_credentials" ("publisher_id");
CREATE INDEX "registry_entry_artifact_idx" ON "registry_entries" ("artifact_root");
CREATE INDEX "registry_rate_expiry_idx" ON "registry_rate_counters" ("expires_at");
ALTER TABLE "registry_auth_session" ADD CONSTRAINT "registry_auth_session_user_id_registry_auth_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "registry_auth_user"("id") ON DELETE CASCADE;
ALTER TABLE "registry_auth_account" ADD CONSTRAINT "registry_auth_account_user_id_registry_auth_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "registry_auth_user"("id") ON DELETE CASCADE;
ALTER TABLE "registry_publishers" ADD CONSTRAINT "registry_publishers_user_id_registry_auth_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "registry_auth_user"("id");
ALTER TABLE "registry_operators" ADD CONSTRAINT "registry_operators_user_id_registry_auth_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "registry_auth_user"("id");
ALTER TABLE "registry_credentials" ADD CONSTRAINT "registry_credentials_publisher_id_registry_publishers_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "registry_publishers"("id");
ALTER TABLE "registry_artifact_content" ADD CONSTRAINT "registry_artifact_content_root_registry_artifacts_root_fkey" FOREIGN KEY ("root") REFERENCES "registry_artifacts"("root");
ALTER TABLE "registry_entries" ADD CONSTRAINT "registry_entries_publisher_id_registry_publishers_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "registry_publishers"("id");
ALTER TABLE "registry_entries" ADD CONSTRAINT "registry_entries_artifact_root_registry_artifacts_root_fkey" FOREIGN KEY ("artifact_root") REFERENCES "registry_artifacts"("root");
ALTER TABLE "registry_delete_jobs" ADD CONSTRAINT "registry_delete_jobs_root_registry_artifacts_root_fkey" FOREIGN KEY ("root") REFERENCES "registry_artifacts"("root");
ALTER TABLE "registry_delete_jobs" ADD CONSTRAINT "registry_delete_jobs_requested_audit_id_registry_audit_id_fkey" FOREIGN KEY ("requested_audit_id") REFERENCES "registry_audit"("id");
ALTER TABLE "registry_reports" ADD CONSTRAINT "registry_reports_entry_id_registry_entries_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "registry_entries"("id");
