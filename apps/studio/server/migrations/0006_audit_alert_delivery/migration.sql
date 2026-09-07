CREATE TABLE "audit_alert_settings" (
	"team_id" text PRIMARY KEY,
	"revision" uuid NOT NULL
);

ALTER TABLE "audit_alert_settings" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "audit_alert_recipients" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"member_id" text NOT NULL,
	"user_id" text NOT NULL,
	"in_app" boolean NOT NULL,
	"email" boolean NOT NULL,
	CONSTRAINT "audit_alert_recipients_team_member_unique" UNIQUE("team_id","member_id"),
	CONSTRAINT "audit_alert_recipients_channels_check" CHECK ("in_app" OR "email")
);

ALTER TABLE "audit_alert_recipients" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "audit_alert_deliveries" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"outbox_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" uuid,
	"lease_expires_at" timestamp with time zone,
	"send_started_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"suppressed_at" timestamp with time zone,
	"uncertain_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_alert_deliveries_identity_unique" UNIQUE("outbox_id","member_id","channel"),
	CONSTRAINT "audit_alert_deliveries_channel_check" CHECK ("channel" IN ('in_app', 'email')),
	CONSTRAINT "audit_alert_deliveries_attempt_check" CHECK ("attempt_count" >= 0),
	CONSTRAINT "audit_alert_deliveries_lease_check" CHECK (("lease_owner" IS NULL) = ("lease_expires_at" IS NULL)),
	CONSTRAINT "audit_alert_deliveries_terminal_check" CHECK (num_nonnulls("delivered_at", "failed_at", "suppressed_at", "uncertain_at") <= 1 AND (num_nonnulls("delivered_at", "failed_at", "suppressed_at", "uncertain_at") = 0 OR "lease_owner" IS NULL)),
	CONSTRAINT "audit_alert_deliveries_read_check" CHECK ("read_at" IS NULL OR ("channel" = 'in_app' AND "delivered_at" IS NOT NULL)),
	CONSTRAINT "audit_alert_deliveries_ack_check" CHECK ("acknowledged_at" IS NULL OR "uncertain_at" IS NOT NULL),
	CONSTRAINT "audit_alert_deliveries_error_check" CHECK ("last_error" IS NULL OR "last_error" IN ('not_eligible', 'backlog_expired', 'attempts_exhausted', 'send_retryable', 'send_rejected', 'send_uncertain', 'handoff_interrupted'))
);

ALTER TABLE "audit_alert_deliveries" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "audit_alert_dispatch_budget" (
	"scope" text PRIMARY KEY,
	"window_started_at" timestamp with time zone NOT NULL,
	"attempts" integer NOT NULL,
	CONSTRAINT "audit_alert_dispatch_budget_check" CHECK ("attempts" >= 0 AND char_length("scope") BETWEEN 1 AND 300)
);

ALTER TABLE "audit_alert_dispatch_budget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_alert_outbox" ADD COLUMN "uncertain_at" timestamp with time zone;
DROP INDEX "audit_alert_outbox_dispatch_idx";
CREATE INDEX "audit_alert_outbox_dispatch_idx" ON "audit_alert_outbox" ("available_at","lease_expires_at") WHERE delivered_at IS NULL AND failed_at IS NULL AND suppressed_at IS NULL AND uncertain_at IS NULL;
ALTER TABLE "audit_alert_outbox" ADD CONSTRAINT "audit_alert_outbox_id_team_unique" UNIQUE("id","team_id");
CREATE INDEX "audit_alert_deliveries_dispatch_idx" ON "audit_alert_deliveries" ("available_at","created_at") WHERE delivered_at IS NULL AND failed_at IS NULL AND suppressed_at IS NULL AND uncertain_at IS NULL;
CREATE INDEX "audit_alert_deliveries_feed_idx" ON "audit_alert_deliveries" ("team_id","user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
ALTER TABLE "audit_alert_deliveries" ADD CONSTRAINT "audit_alert_deliveries_outbox_fk" FOREIGN KEY ("outbox_id","team_id") REFERENCES "audit_alert_outbox"("id","team_id");
ALTER TABLE "audit_alert_outbox" DROP CONSTRAINT "audit_alert_outbox_terminal_state_check", ADD CONSTRAINT "audit_alert_outbox_terminal_state_check" CHECK (num_nonnulls("delivered_at", "failed_at", "suppressed_at", "uncertain_at") <= 1
          AND (
            num_nonnulls("delivered_at", "failed_at", "suppressed_at", "uncertain_at") = 0
            OR ("lease_owner" IS NULL AND "lease_expires_at" IS NULL)
          ));
CREATE POLICY "team_isolation" ON "audit_alert_settings" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "backup_read" ON "audit_alert_settings" AS PERMISSIVE FOR SELECT TO public USING (current_user = 'studio_backup');
CREATE POLICY "team_isolation" ON "audit_alert_recipients" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "backup_read" ON "audit_alert_recipients" AS PERMISSIVE FOR SELECT TO public USING (current_user = 'studio_backup');
CREATE POLICY "team_isolation" ON "audit_alert_deliveries" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "backup_read" ON "audit_alert_deliveries" AS PERMISSIVE FOR SELECT TO public USING (current_user = 'studio_backup');
CREATE POLICY "maintenance_only" ON "audit_alert_dispatch_budget" AS PERMISSIVE FOR ALL TO public USING (current_user = 'studio_maintenance') WITH CHECK (current_user = 'studio_maintenance');
CREATE POLICY "backup_read" ON "audit_alert_dispatch_budget" AS PERMISSIVE FOR SELECT TO public USING (current_user = 'studio_backup');
