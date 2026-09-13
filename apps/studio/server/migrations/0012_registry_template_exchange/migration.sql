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
	CONSTRAINT "template_registry_publications_url_check" CHECK ("registry_url" ~ '^https://[^@/?#]+$'),
	CONSTRAINT "template_registry_publications_root_check" CHECK ("registry_root" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "template_registry_publications_name_check" CHECK (char_length("publisher_name") BETWEEN 1 AND 200 AND "publisher_name" ~ '[^[:space:]]'),
	CONSTRAINT "template_registry_publications_orcid_check" CHECK ("publisher_orcid" IS NULL OR "publisher_orcid" ~ '^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$')
);

ALTER TABLE "template_registry_publications" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "template_registry_publication_intents" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"template_version_id" uuid NOT NULL,
	"registry_url" text NOT NULL,
	"registry_root" text NOT NULL,
	"publisher_id" uuid NOT NULL,
	"publisher_name" text NOT NULL,
	"publisher_orcid" text,
	"initiating_actor_id" text NOT NULL,
	"initiating_actor_label" text NOT NULL,
	"initiating_request_id" uuid NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" uuid,
	"lease_expires_at" timestamp with time zone,
	"registry_entry_id" uuid,
	"completed_at" timestamp with time zone,
	"quarantined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_registry_publication_intents_url_check" CHECK ("registry_url" ~ '^https://[^@/?#]+$'),
	CONSTRAINT "template_registry_publication_intents_root_check" CHECK ("registry_root" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "template_registry_publication_intents_lengths_check" CHECK (char_length("team_id") BETWEEN 1 AND 255
          AND char_length("publisher_name") BETWEEN 1 AND 200
          AND "publisher_name" ~ '[^[:space:]]'
          AND char_length("initiating_actor_id") BETWEEN 1 AND 255
          AND char_length("initiating_actor_label") BETWEEN 1 AND 320
          AND "attempt_count" >= 0),
	CONSTRAINT "template_registry_publication_intents_orcid_check" CHECK ("publisher_orcid" IS NULL OR "publisher_orcid" ~ '^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$'),
	CONSTRAINT "template_registry_publication_intents_lease_check" CHECK (("lease_owner" IS NULL) = ("lease_expires_at" IS NULL)
          AND ("completed_at" IS NULL AND "quarantined_at" IS NULL
            OR ("lease_owner" IS NULL AND "lease_expires_at" IS NULL))),
	CONSTRAINT "template_registry_publication_intents_terminal_check" CHECK (num_nonnulls("completed_at", "quarantined_at") <= 1
          AND ("completed_at" IS NULL) = ("registry_entry_id" IS NULL))
);

ALTER TABLE "template_registry_publication_intents" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "template_registry_import_intents" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"registry_url" text NOT NULL,
	"registry_entry_id" uuid NOT NULL,
	"registry_root" text NOT NULL,
	"entry_snapshot" jsonb NOT NULL,
	"asset_manifest" jsonb NOT NULL,
	"target_template_id" uuid NOT NULL,
	"target_version_id" uuid NOT NULL,
	"initiating_actor_id" text NOT NULL,
	"initiating_actor_label" text NOT NULL,
	"initiating_request_id" uuid NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" uuid,
	"lease_expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"quarantined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_registry_import_intents_url_check" CHECK ("registry_url" ~ '^https://[^@/?#]+$'),
	CONSTRAINT "template_registry_import_intents_root_check" CHECK ("registry_root" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "template_registry_import_intents_json_check" CHECK (jsonb_typeof("entry_snapshot") = 'object'
          AND jsonb_typeof("asset_manifest") = 'array'),
	CONSTRAINT "template_registry_import_intents_lengths_check" CHECK (char_length("team_id") BETWEEN 1 AND 255
          AND char_length("initiating_actor_id") BETWEEN 1 AND 255
          AND char_length("initiating_actor_label") BETWEEN 1 AND 320
          AND "attempt_count" >= 0),
	CONSTRAINT "template_registry_import_intents_lease_check" CHECK (("lease_owner" IS NULL) = ("lease_expires_at" IS NULL)
          AND ("completed_at" IS NULL AND "quarantined_at" IS NULL
            OR ("lease_owner" IS NULL AND "lease_expires_at" IS NULL))),
	CONSTRAINT "template_registry_import_intents_terminal_check" CHECK (num_nonnulls("completed_at", "quarantined_at") <= 1)
);

ALTER TABLE "template_registry_import_intents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "template_versions" ADD COLUMN "registry_origin" jsonb;
CREATE UNIQUE INDEX "template_versions_registry_entry_idx" ON "template_versions" ("team_id",("registry_origin"->>'registry_url'),("registry_origin"->>'entry_id')) WHERE "registry_origin" IS NOT NULL;
CREATE INDEX "template_registry_publications_registry_entry_idx" ON "template_registry_publications" ("registry_url","registry_entry_id");
CREATE INDEX "template_registry_publications_team_version_idx" ON "template_registry_publications" ("team_id","template_version_id");
CREATE UNIQUE INDEX "template_registry_publication_intents_target_unique" ON "template_registry_publication_intents" ("team_id","template_version_id","registry_url") WHERE quarantined_at IS NULL;
CREATE INDEX "template_registry_publication_intents_dispatch_idx" ON "template_registry_publication_intents" ("available_at","lease_expires_at") WHERE completed_at IS NULL AND quarantined_at IS NULL;
CREATE UNIQUE INDEX "template_registry_import_intents_source_unique" ON "template_registry_import_intents" ("team_id","registry_url","registry_entry_id") WHERE quarantined_at IS NULL;
CREATE UNIQUE INDEX "template_registry_import_intents_template_idx" ON "template_registry_import_intents" ("target_template_id");
CREATE UNIQUE INDEX "template_registry_import_intents_version_idx" ON "template_registry_import_intents" ("target_version_id");
CREATE INDEX "template_registry_import_intents_dispatch_idx" ON "template_registry_import_intents" ("available_at","lease_expires_at") WHERE completed_at IS NULL AND quarantined_at IS NULL;
ALTER TABLE "template_registry_accounts" ADD CONSTRAINT "template_registry_accounts_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
ALTER TABLE "template_registry_publications" ADD CONSTRAINT "template_registry_publications_version_fk" FOREIGN KEY ("template_version_id","team_id") REFERENCES "template_versions"("id","team_id");
ALTER TABLE "template_registry_publication_intents" ADD CONSTRAINT "template_registry_publication_intents_version_fk" FOREIGN KEY ("template_version_id","team_id") REFERENCES "template_versions"("id","team_id");
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
CREATE POLICY "team_isolation" ON "template_registry_publication_intents" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "backup_read" ON "template_registry_publication_intents" AS PERMISSIVE FOR SELECT TO public USING (current_user = 'studio_backup');
CREATE POLICY "team_isolation" ON "template_registry_import_intents" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "backup_read" ON "template_registry_import_intents" AS PERMISSIVE FOR SELECT TO public USING (current_user = 'studio_backup');
