ALTER TABLE "user" ADD COLUMN "recovery_disabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "webhook_deliveries" ADD COLUMN "uncertain_at" timestamp with time zone;
DROP INDEX "webhook_deliveries_dispatch_idx";
CREATE INDEX "webhook_deliveries_dispatch_idx" ON "webhook_deliveries" ("available_at","lease_expires_at") WHERE delivered_at IS NULL AND failed_at IS NULL AND uncertain_at IS NULL;
ALTER TABLE "webhook_deliveries" DROP CONSTRAINT "webhook_deliveries_terminal_state_check", ADD CONSTRAINT "webhook_deliveries_terminal_state_check" CHECK (num_nonnulls("delivered_at", "failed_at", "uncertain_at") <= 1
          AND (
            num_nonnulls("delivered_at", "failed_at", "uncertain_at") = 0
            OR ("lease_owner" IS NULL AND "lease_expires_at" IS NULL)
          ));
