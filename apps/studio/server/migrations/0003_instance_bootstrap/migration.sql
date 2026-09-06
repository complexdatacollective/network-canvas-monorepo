CREATE TABLE "studio_instance" (
	"id" boolean PRIMARY KEY DEFAULT true,
	"name" text NOT NULL,
	"initial_owner_user_id" text,
	"initial_team_id" text,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_instance_singleton_check" CHECK ("id"),
	CONSTRAINT "studio_instance_name_check" CHECK (char_length("name") BETWEEN 1 AND 120 AND "name" ~ '[^[:space:]]')
);

ALTER TABLE "studio_instance" ADD CONSTRAINT "studio_instance_initial_owner_user_id_user_id_fkey" FOREIGN KEY ("initial_owner_user_id") REFERENCES "user"("id") ON DELETE SET NULL;
ALTER TABLE "studio_instance" ADD CONSTRAINT "studio_instance_initial_team_id_teams_id_fkey" FOREIGN KEY ("initial_team_id") REFERENCES "teams"("id") ON DELETE SET NULL;
