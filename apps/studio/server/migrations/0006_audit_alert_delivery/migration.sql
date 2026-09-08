CREATE TABLE "audit_alert_deliveries" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"alert_id" uuid NOT NULL,
	"recipient_user_id" text NOT NULL,
	"channel" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" uuid,
	"lease_expires_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"suppressed_at" timestamp with time zone,
	"uncertain_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_alert_deliveries_channel_check" CHECK ("channel" IN ('email', 'in_app')),
	CONSTRAINT "audit_alert_deliveries_attempt_count_check" CHECK ("attempt_count" >= 0),
	CONSTRAINT "audit_alert_deliveries_lengths_check" CHECK (char_length("team_id") BETWEEN 1 AND 255
          AND char_length("recipient_user_id") BETWEEN 1 AND 255
          AND ("last_error" IS NULL OR char_length("last_error") <= 1000)),
	CONSTRAINT "audit_alert_deliveries_lease_check" CHECK (("lease_owner" IS NULL) = ("lease_expires_at" IS NULL)),
	CONSTRAINT "audit_alert_deliveries_channel_state_check" CHECK (("channel" <> 'in_app' OR "delivered_at" IS NOT NULL)
          AND ("channel" = 'in_app' OR "read_at" IS NULL)),
	CONSTRAINT "audit_alert_deliveries_terminal_state_check" CHECK (num_nonnulls("delivered_at", "failed_at", "suppressed_at", "uncertain_at") = 1
          OR (
            num_nonnulls("delivered_at", "failed_at", "suppressed_at", "uncertain_at") = 0
            AND "channel" = 'email'
          )),
	CONSTRAINT "audit_alert_deliveries_terminal_lease_check" CHECK (num_nonnulls("delivered_at", "failed_at", "suppressed_at", "uncertain_at") = 0
          OR ("lease_owner" IS NULL AND "lease_expires_at" IS NULL))
);

ALTER TABLE "audit_alert_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user" ADD COLUMN "recovery_disabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "webhook_deliveries" ADD COLUMN "uncertain_at" timestamp with time zone;
ALTER TABLE "audit_alert_outbox" ADD COLUMN "uncertain_at" timestamp with time zone;
DROP INDEX "webhook_deliveries_dispatch_idx";
CREATE INDEX "webhook_deliveries_dispatch_idx" ON "webhook_deliveries" ("available_at","lease_expires_at") WHERE delivered_at IS NULL AND failed_at IS NULL AND uncertain_at IS NULL;
DROP INDEX "audit_alert_outbox_dispatch_idx";
CREATE INDEX "audit_alert_outbox_dispatch_idx" ON "audit_alert_outbox" ("available_at","lease_expires_at") WHERE delivered_at IS NULL AND failed_at IS NULL AND suppressed_at IS NULL AND uncertain_at IS NULL;
ALTER TABLE "audit_alert_outbox" ADD CONSTRAINT "audit_alert_outbox_id_team_id_unique" UNIQUE("id","team_id");
CREATE UNIQUE INDEX "audit_alert_deliveries_alert_recipient_channel_idx" ON "audit_alert_deliveries" ("alert_id","recipient_user_id","channel");
CREATE INDEX "audit_alert_deliveries_dispatch_idx" ON "audit_alert_deliveries" ("available_at","lease_expires_at") WHERE channel = 'email' AND delivered_at IS NULL AND failed_at IS NULL AND suppressed_at IS NULL AND uncertain_at IS NULL;
CREATE INDEX "audit_alert_deliveries_recipient_created_at_idx" ON "audit_alert_deliveries" ("team_id","recipient_user_id","created_at" DESC NULLS LAST);
ALTER TABLE "audit_alert_deliveries" ADD CONSTRAINT "audit_alert_deliveries_alert_team_fk" FOREIGN KEY ("alert_id","team_id") REFERENCES "audit_alert_outbox"("id","team_id");
ALTER TABLE "webhook_deliveries" DROP CONSTRAINT "webhook_deliveries_terminal_state_check", ADD CONSTRAINT "webhook_deliveries_terminal_state_check" CHECK (num_nonnulls("delivered_at", "failed_at", "uncertain_at") <= 1
          AND (
            num_nonnulls("delivered_at", "failed_at", "uncertain_at") = 0
            OR ("lease_owner" IS NULL AND "lease_expires_at" IS NULL)
          ));
ALTER TABLE "audit_alert_outbox" DROP CONSTRAINT "audit_alert_outbox_terminal_state_check", ADD CONSTRAINT "audit_alert_outbox_terminal_state_check" CHECK (num_nonnulls("delivered_at", "failed_at", "suppressed_at", "uncertain_at") <= 1
          AND (
            num_nonnulls("delivered_at", "failed_at", "suppressed_at", "uncertain_at") = 0
            OR ("lease_owner" IS NULL AND "lease_expires_at" IS NULL)
          ));
CREATE POLICY "team_isolation" ON "audit_alert_deliveries" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "backup_read" ON "audit_alert_deliveries" AS PERMISSIVE FOR SELECT TO public USING (current_user = 'studio_backup');
