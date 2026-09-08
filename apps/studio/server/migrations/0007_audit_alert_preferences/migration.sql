CREATE TABLE "audit_alert_preferences" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"recipient_user_id" text NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"in_app_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_alert_preferences_lengths_check" CHECK (char_length("team_id") BETWEEN 1 AND 255 AND char_length("recipient_user_id") BETWEEN 1 AND 255)
);

ALTER TABLE "audit_alert_preferences" ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX "audit_alert_preferences_team_recipient_idx" ON "audit_alert_preferences" ("team_id","recipient_user_id");
CREATE POLICY "team_isolation" ON "audit_alert_preferences" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "backup_read" ON "audit_alert_preferences" AS PERMISSIVE FOR SELECT TO public USING (current_user = 'studio_backup');
