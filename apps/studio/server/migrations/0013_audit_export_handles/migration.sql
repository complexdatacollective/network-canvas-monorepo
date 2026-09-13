ALTER TABLE "audit_export_jobs" ADD COLUMN "artifact_upload_id" text;
ALTER TABLE "audit_export_jobs" ADD COLUMN "artifact_effect_expires_at" timestamp with time zone;
ALTER TABLE "audit_export_jobs" ADD COLUMN "artifact_cleanup_owner" uuid;
ALTER TABLE "audit_export_jobs" ADD COLUMN "artifact_cleanup_expires_at" timestamp with time zone;
ALTER TABLE "audit_export_jobs" ADD COLUMN "artifact_cleanup_not_before" timestamp with time zone;
ALTER TABLE "audit_export_jobs" ADD COLUMN "artifact_cleanup_observed_at" timestamp with time zone;
ALTER TABLE "audit_export_jobs" ADD COLUMN "handle_ciphertext" bytea;
ALTER TABLE "audit_export_jobs" ADD COLUMN "handle_key_id" text;
ALTER TABLE "audit_export_jobs" ADD COLUMN "handle_algorithm" text;
ALTER TABLE "audit_export_jobs" ADD CONSTRAINT "audit_export_jobs_handle_envelope_check" CHECK (("handle_ciphertext" IS NULL) = ("handle_key_id" IS NULL)
          AND ("handle_ciphertext" IS NULL) = ("handle_algorithm" IS NULL)
          AND ("handle_ciphertext" IS NULL OR octet_length("handle_ciphertext") BETWEEN 30 AND 512)
          AND ("handle_key_id" IS NULL OR char_length("handle_key_id") BETWEEN 1 AND 64)
          AND ("handle_algorithm" IS NULL OR char_length("handle_algorithm") BETWEEN 1 AND 64));
ALTER TABLE "audit_export_jobs" ADD CONSTRAINT "audit_export_jobs_artifact_cleanup_check" CHECK (("artifact_cleanup_owner" IS NULL) = ("artifact_cleanup_expires_at" IS NULL)
          AND ("artifact_upload_id" IS NULL OR "artifact_key" IS NOT NULL)
          AND ("artifact_effect_expires_at" IS NULL OR "artifact_key" IS NOT NULL)
          AND ("artifact_cleanup_owner" IS NULL OR "artifact_key" IS NOT NULL)
          AND ("artifact_cleanup_not_before" IS NULL OR "artifact_key" IS NOT NULL)
          AND ("artifact_cleanup_observed_at" IS NULL OR "artifact_cleanup_not_before" IS NOT NULL));
ALTER TABLE "audit_export_jobs" DROP CONSTRAINT "audit_export_jobs_ready_state_check", ADD CONSTRAINT "audit_export_jobs_ready_state_check" CHECK (("status" = 'ready') = (
            "handle_hash" IS NOT NULL
            AND "handle_ciphertext" IS NOT NULL
            AND "handle_key_id" IS NOT NULL
            AND "handle_algorithm" IS NOT NULL
            AND "handle_expires_at" IS NOT NULL
            AND "artifact_key" IS NOT NULL
            AND "artifact_row_count" IS NOT NULL
            AND "artifact_byte_count" IS NOT NULL
            AND "completion_event_id" IS NOT NULL
            AND "ready_at" IS NOT NULL
          ));
ALTER TABLE "audit_export_jobs" DROP CONSTRAINT "audit_export_jobs_failed_state_check", ADD CONSTRAINT "audit_export_jobs_failed_state_check" CHECK (("status" = 'failed') = (
            "failed_at" IS NOT NULL AND "failure_event_id" IS NOT NULL
          ));
ALTER TABLE "audit_export_jobs" DROP CONSTRAINT "audit_export_jobs_identifier_lengths_check", ADD CONSTRAINT "audit_export_jobs_identifier_lengths_check" CHECK (char_length("team_id") BETWEEN 1 AND 255
          AND char_length("actor_id") BETWEEN 1 AND 255
          AND ("artifact_key" IS NULL OR char_length("artifact_key") BETWEEN 1 AND 1024)
          AND ("artifact_upload_id" IS NULL OR char_length("artifact_upload_id") BETWEEN 1 AND 1024)
          AND ("last_error" IS NULL OR char_length("last_error") <= 1000));
