-- Rows created before encrypted rendered payloads existed cannot be reconstructed:
-- their plaintext body was never retained. Preserve terminal delivery evidence as-is,
-- and permanently fail only pending legacy work so no dispatcher can retry unreadable
-- content after this migration. New rows are required by a sidecar trigger to carry
-- the complete authenticated rendered-payload envelope.
UPDATE message_deliveries
SET failed_at = statement_timestamp(),
    lease_owner = NULL,
    lease_expires_at = NULL,
    last_error = 'legacy rendered payload unavailable after encrypted delivery upgrade'
WHERE sent_at IS NULL
  AND failed_at IS NULL
  AND suppressed_at IS NULL
  AND uncertain_at IS NULL;

ALTER TABLE "interview_links" ADD COLUMN "token_ciphertext" bytea;
ALTER TABLE "interview_links" ADD COLUMN "token_key_id" text;
ALTER TABLE "interview_links" ADD COLUMN "token_algorithm" text;
ALTER TABLE "message_deliveries" ADD COLUMN "interview_link_id" uuid;
ALTER TABLE "message_deliveries" ADD COLUMN "rendered_ciphertext" bytea;
ALTER TABLE "message_deliveries" ADD COLUMN "rendered_key_id" text;
ALTER TABLE "message_deliveries" ADD COLUMN "rendered_algorithm" text;
ALTER TABLE "message_deliveries" ADD COLUMN "send_started_at" timestamp with time zone;
ALTER TABLE "interview_links" ADD CONSTRAINT "interview_links_id_participant_id_study_id_team_id_unique" UNIQUE("id","participant_id","study_id","team_id");
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_interview_link_fk" FOREIGN KEY ("interview_link_id","participant_id","study_id","team_id") REFERENCES "interview_links"("id","participant_id","study_id","team_id");
ALTER TABLE "interview_links" ADD CONSTRAINT "interview_links_token_envelope_check" CHECK (num_nonnulls("token_ciphertext", "token_key_id", "token_algorithm") IN (0, 3)
          AND ("token_ciphertext" IS NULL OR octet_length("token_ciphertext") BETWEEN 30 AND 256)
          AND ("token_key_id" IS NULL OR char_length("token_key_id") BETWEEN 1 AND 64)
          AND ("token_algorithm" IS NULL OR "token_algorithm" = 'aes-256-gcm.v1'));
ALTER TABLE "schedule_occurrences" DROP CONSTRAINT "schedule_occurrences_state_check", ADD CONSTRAINT "schedule_occurrences_state_check" CHECK ("state" IN ('scheduled', 'dispatched', 'blocked', 'expired', 'cancelled', 'superseded'));
ALTER TABLE "message_deliveries" DROP CONSTRAINT "message_deliveries_hash_check", ADD CONSTRAINT "message_deliveries_hash_check" CHECK ("rendered_body_hash" ~ '^[0-9a-f]{64}$'
          AND octet_length("recipient_blind_index") = 32
          AND char_length("blind_index_key_id") BETWEEN 1 AND 64
          AND num_nonnulls("rendered_ciphertext", "rendered_key_id", "rendered_algorithm") IN (0, 3)
          AND octet_length("rendered_ciphertext") BETWEEN 30 AND 16384
          AND char_length("rendered_key_id") BETWEEN 1 AND 64
          AND "rendered_algorithm" = 'aes-256-gcm.v1');
