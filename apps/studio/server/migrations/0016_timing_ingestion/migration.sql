ALTER TABLE "interview_sessions" ADD COLUMN "stage_timing" jsonb;
ALTER TABLE "interview_sessions" ADD COLUMN "sync_revision" integer DEFAULT 0 NOT NULL;
ALTER TABLE "study_wave_rollups" ADD COLUMN "dirty_generation" bigint DEFAULT 0 NOT NULL;
ALTER TABLE "study_wave_rollups" ADD COLUMN "lease_owner" text;
ALTER TABLE "study_wave_rollups" ADD COLUMN "lease_expires_at" timestamp with time zone;
ALTER TABLE "study_wave_rollups" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "study_wave_rollups" ADD COLUMN "failed_at" timestamp with time zone;
ALTER TABLE "study_wave_rollups" ADD COLUMN "last_error" text;
ALTER TABLE "study_stage_rollups" ADD COLUMN "lease_owner" text;
ALTER TABLE "study_stage_rollups" ADD COLUMN "lease_expires_at" timestamp with time zone;
ALTER TABLE "study_stage_rollups" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "study_stage_rollups" ADD COLUMN "failed_at" timestamp with time zone;
ALTER TABLE "study_stage_rollups" ADD COLUMN "last_error" text;
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_sync_revision_check" CHECK ("sync_revision" >= 0);
ALTER TABLE "interview_sessions" DROP CONSTRAINT "interview_sessions_ego_check", ADD CONSTRAINT "interview_sessions_ego_check" CHECK (char_length("ego_uid") BETWEEN 1 AND 128
          AND jsonb_typeof("ego_attributes") = 'object'
          AND jsonb_typeof("stage_metadata") = 'object'
          AND ("stage_timing" IS NULL
               OR jsonb_typeof("stage_timing") = 'object')
          AND ("ego_secure_attributes" IS NULL
               OR jsonb_typeof("ego_secure_attributes") = 'object'));
ALTER TABLE "study_wave_rollups" DROP CONSTRAINT "study_wave_rollups_counts_check", ADD CONSTRAINT "study_wave_rollups_counts_check" CHECK ("invited_count" >= 0 AND "onboarding_started_count" >= 0
          AND "consented_count" >= 0 AND "session_started_count" >= 0
          AND "session_completed_count" >= 0 AND "session_abandoned_count" >= 0
          AND "delivery_failed_count" >= 0 AND "attempt_count" >= 0
          AND "dirty_generation" >= 0);
ALTER TABLE "study_stage_rollups" DROP CONSTRAINT "study_stage_rollups_counts_check", ADD CONSTRAINT "study_stage_rollups_counts_check" CHECK ("entered_count" >= 0 AND "completed_count" >= 0
          AND "abandoned_count" >= 0 AND "duration_ms_sum" >= 0
          AND "duration_ms_count" >= 0 AND "missing_item_count" >= 0
          AND "attempt_count" >= 0
          AND char_length("stage_id") BETWEEN 1 AND 128);
-- First admission of the timing worker must include every pre-existing wave,
-- including waves with only a stage projection or no projection at all.
INSERT INTO study_wave_rollups (team_id, study_id, wave_id)
SELECT team_id, study_id, id FROM study_waves
ON CONFLICT (wave_id) DO NOTHING;

UPDATE study_wave_rollups
SET dirty_generation = dirty_generation + 1,
    stale_at = clock_timestamp(),
    attempt_count = 0,
    failed_at = NULL,
    last_error = NULL,
    lease_owner = NULL,
    lease_expires_at = NULL;
