CREATE TABLE IF NOT EXISTS "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"installationId" text NOT NULL,
	"timestamp" timestamp NOT NULL,
	"countryISOCode" text NOT NULL,
	"message" text,
	"name" text,
	"stack" text,
	"metadata" json
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_idx" ON "events" ("id");