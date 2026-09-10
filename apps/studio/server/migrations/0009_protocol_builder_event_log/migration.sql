CREATE TABLE "protocol_events" (
	"draft_id" uuid,
	"team_id" text NOT NULL,
	"cursor" bigint,
	"kind" text NOT NULL,
	"section_id" text NOT NULL,
	"manifest_seq" bigint,
	"content_hash" text,
	"doc" jsonb,
	"owner" text,
	"holder" jsonb,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "protocol_events_pkey" PRIMARY KEY("draft_id","cursor"),
	CONSTRAINT "protocol_events_kind_check" CHECK ("kind" IN ('revision', 'lock')),
	CONSTRAINT "protocol_events_cursor_check" CHECK ("cursor" > 0),
	CONSTRAINT "protocol_events_section_id_check" CHECK (char_length("section_id") BETWEEN 1 AND 512),
	CONSTRAINT "protocol_events_shape_check" CHECK (CASE WHEN "kind" = 'revision'
            THEN "manifest_seq" IS NOT NULL
                 AND "content_hash" IS NOT NULL
                 AND "owner" IS NULL
                 AND "holder" IS NULL
            ELSE "manifest_seq" IS NULL
                 AND "content_hash" IS NULL
                 AND "doc" IS NULL
          END),
	CONSTRAINT "protocol_events_holder_check" CHECK (("owner" IS NULL) = ("holder" IS NULL))
);

ALTER TABLE "protocol_events" ENABLE ROW LEVEL SECURITY;
CREATE INDEX "protocol_events_team_id_draft_id_cursor_idx" ON "protocol_events" ("team_id","draft_id","cursor");
ALTER TABLE "protocol_events" ADD CONSTRAINT "protocol_events_draft_id_team_id_drafts_id_team_id_fkey" FOREIGN KEY ("draft_id","team_id") REFERENCES "drafts"("id","team_id");
CREATE POLICY "team_isolation" ON "protocol_events" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "backup_read" ON "protocol_events" AS PERMISSIVE FOR SELECT TO public USING (current_user = 'studio_backup');
