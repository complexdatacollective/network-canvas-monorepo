ALTER TABLE "events" RENAME COLUMN "isocode" TO "countryISOCode";--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "countryISOCode" SET NOT NULL;