CREATE TABLE "template_registry_accounts" (
	"user_id" text,
	"registry_url" text,
	"publisher_id" uuid NOT NULL,
	"publisher_name" text NOT NULL,
	"publisher_orcid" text,
	"linked_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "template_registry_accounts_pkey" PRIMARY KEY("user_id","registry_url"),
	CONSTRAINT "template_registry_accounts_url_check" CHECK ("registry_url" ~ '^https://[^@/?#]+$'),
	CONSTRAINT "template_registry_accounts_name_check" CHECK (char_length("publisher_name") BETWEEN 1 AND 200 AND "publisher_name" ~ '[^[:space:]]'),
	CONSTRAINT "template_registry_accounts_orcid_check" CHECK ("publisher_orcid" IS NULL OR "publisher_orcid" ~ '^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$')
);

CREATE TABLE "template_registry_publications" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"template_version_id" uuid NOT NULL,
	"registry_url" text NOT NULL,
	"registry_entry_id" uuid NOT NULL,
	"registry_root" text NOT NULL,
	"publisher_id" uuid NOT NULL,
	"publisher_name" text NOT NULL,
	"publisher_orcid" text,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "template_registry_publications_team_id_template_version_id_registry_url_unique" UNIQUE("team_id","template_version_id","registry_url"),
	CONSTRAINT "template_registry_publications_registry_url_registry_entry_id_unique" UNIQUE("registry_url","registry_entry_id"),
	CONSTRAINT "template_registry_publications_url_check" CHECK ("registry_url" ~ '^https://[^@/?#]+$'),
	CONSTRAINT "template_registry_publications_root_check" CHECK ("registry_root" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "template_registry_publications_name_check" CHECK (char_length("publisher_name") BETWEEN 1 AND 200 AND "publisher_name" ~ '[^[:space:]]'),
	CONSTRAINT "template_registry_publications_orcid_check" CHECK ("publisher_orcid" IS NULL OR "publisher_orcid" ~ '^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$')
);

ALTER TABLE "template_registry_publications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "template_versions" ADD COLUMN "registry_origin" jsonb;
CREATE UNIQUE INDEX "template_versions_registry_entry_idx" ON "template_versions" ("team_id",("registry_origin"->>'registry_url'),("registry_origin"->>'entry_id')) WHERE "registry_origin" IS NOT NULL;
CREATE INDEX "template_registry_publications_team_version_idx" ON "template_registry_publications" ("team_id","template_version_id");
ALTER TABLE "template_registry_accounts" ADD CONSTRAINT "template_registry_accounts_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
ALTER TABLE "template_registry_publications" ADD CONSTRAINT "template_registry_publications_version_fk" FOREIGN KEY ("template_version_id","team_id") REFERENCES "template_versions"("id","team_id");
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_registry_origin_check" CHECK ("registry_origin" IS NULL OR (
        jsonb_typeof("registry_origin") = 'object'
        AND "registry_origin" ?& ARRAY['registry_url','entry_id','source_version_hash','fetched_at']
        AND ("registry_origin" - ARRAY['registry_url','entry_id','source_version_hash','fetched_at']) = '{}'::jsonb
        AND ("registry_origin"->>'registry_url') ~ '^https://[^@/?#]+$'
        AND ("registry_origin"->>'entry_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND ("registry_origin"->>'source_version_hash') ~ '^[0-9a-f]{64}$'
        AND ("registry_origin"->>'fetched_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$'
      ));
CREATE POLICY "team_isolation" ON "template_registry_publications" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "backup_read" ON "template_registry_publications" AS PERMISSIVE FOR SELECT TO public USING (current_user = 'studio_backup');
