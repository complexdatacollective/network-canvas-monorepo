ALTER TABLE "webhook_deliveries" ADD COLUMN "send_started_at" timestamp with time zone;
ALTER TABLE "webhook_deliveries" DROP CONSTRAINT "webhook_deliveries_lease_check", ADD CONSTRAINT "webhook_deliveries_lease_check" CHECK (("lease_owner" IS NULL) = ("lease_expires_at" IS NULL)
          AND ("send_started_at" IS NULL OR "attempt_count" > 0));
