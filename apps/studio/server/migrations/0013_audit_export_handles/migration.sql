CREATE TABLE "audit_export_artifact_attempts" (
	"id" uuid PRIMARY KEY,
	"job_id" uuid NOT NULL,
	"artifact_key" text NOT NULL,
	"upload_id" text,
	"state" text DEFAULT 'active' NOT NULL,
	"next_sweep_at" timestamp with time zone,
	"sweep_count" integer DEFAULT 0 NOT NULL,
	"sweep_owner" uuid,
	"sweep_expires_at" timestamp with time zone,
	"last_sweep_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "audit_export_artifact_attempts_state_check" CHECK ("state" IN ('active', 'retired')
          AND ("state" = 'retired') = ("retired_at" IS NOT NULL)
          AND ("state" = 'retired') = ("next_sweep_at" IS NOT NULL)),
	CONSTRAINT "audit_export_artifact_attempts_lease_check" CHECK (("sweep_owner" IS NULL) = ("sweep_expires_at" IS NULL)),
	CONSTRAINT "audit_export_artifact_attempts_values_check" CHECK ("sweep_count" >= 0
          AND char_length("artifact_key") BETWEEN 1 AND 1024
          AND ("upload_id" IS NULL OR char_length("upload_id") BETWEEN 1 AND 1024))
);

ALTER TABLE "audit_export_jobs" ADD COLUMN "artifact_attempt_id" uuid;
ALTER TABLE "audit_export_jobs" ADD COLUMN "handle_ciphertext" bytea;
ALTER TABLE "audit_export_jobs" ADD COLUMN "handle_key_id" text;
ALTER TABLE "audit_export_jobs" ADD COLUMN "handle_algorithm" text;
CREATE UNIQUE INDEX "audit_export_artifact_attempts_key_idx" ON "audit_export_artifact_attempts" ("artifact_key");
CREATE INDEX "audit_export_artifact_attempts_sweep_idx" ON "audit_export_artifact_attempts" ("next_sweep_at","sweep_expires_at") WHERE state = 'retired';
ALTER TABLE "audit_export_jobs" ADD CONSTRAINT "audit_export_jobs_handle_envelope_check" CHECK (("handle_ciphertext" IS NULL) = ("handle_key_id" IS NULL)
          AND ("handle_ciphertext" IS NULL) = ("handle_algorithm" IS NULL)
          AND ("handle_ciphertext" IS NULL OR octet_length("handle_ciphertext") BETWEEN 30 AND 512)
          AND ("handle_key_id" IS NULL OR char_length("handle_key_id") BETWEEN 1 AND 64)
          AND ("handle_algorithm" IS NULL OR char_length("handle_algorithm") BETWEEN 1 AND 64));
ALTER TABLE "audit_export_jobs" ADD CONSTRAINT "audit_export_jobs_artifact_attempt_check" CHECK (("artifact_attempt_id" IS NULL) = ("artifact_key" IS NULL));
ALTER TABLE "audit_export_jobs" DROP CONSTRAINT "audit_export_jobs_ready_state_check", ADD CONSTRAINT "audit_export_jobs_ready_state_check" CHECK (("status" = 'ready') = (
            "handle_hash" IS NOT NULL
            AND "handle_ciphertext" IS NOT NULL
            AND "handle_key_id" IS NOT NULL
            AND "handle_algorithm" IS NOT NULL
            AND "handle_expires_at" IS NOT NULL
            AND "artifact_attempt_id" IS NOT NULL
            AND "artifact_key" IS NOT NULL
            AND "artifact_row_count" IS NOT NULL
            AND "artifact_byte_count" IS NOT NULL
            AND "completion_event_id" IS NOT NULL
            AND "ready_at" IS NOT NULL
          ));
ALTER TABLE "audit_export_jobs" DROP CONSTRAINT "audit_export_jobs_failed_state_check", ADD CONSTRAINT "audit_export_jobs_failed_state_check" CHECK (("status" = 'failed') = (
            "failed_at" IS NOT NULL AND "failure_event_id" IS NOT NULL
          ));
