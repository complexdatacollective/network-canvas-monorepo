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
