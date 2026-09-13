CREATE TABLE "protocol_write_receipts" (
	"draft_id" uuid,
	"team_id" text NOT NULL,
	"request_id" text,
	"operation" text,
	"revision_seq" bigint NOT NULL,
	"revision_hash" text NOT NULL,
	"created_section_id" text,
	"promoted" jsonb,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "protocol_write_receipts_pkey" PRIMARY KEY("draft_id","request_id","operation"),
	CONSTRAINT "protocol_write_receipts_operation_check" CHECK ("operation" IN ('submit', 'create')),
	CONSTRAINT "protocol_write_receipts_request_id_check" CHECK (char_length("request_id") BETWEEN 1 AND 512),
	CONSTRAINT "protocol_write_receipts_revision_seq_check" CHECK ("revision_seq" >= 0),
	CONSTRAINT "protocol_write_receipts_created_section_check" CHECK (CASE WHEN "operation" = 'create'
            THEN "created_section_id" IS NOT NULL
            ELSE "created_section_id" IS NULL
          END)
);

ALTER TABLE "protocol_write_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "protocol_write_receipts" ADD CONSTRAINT "protocol_write_receipts_draft_id_team_id_drafts_id_team_id_fkey" FOREIGN KEY ("draft_id","team_id") REFERENCES "drafts"("id","team_id");
CREATE POLICY "team_isolation" ON "protocol_write_receipts" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "backup_read" ON "protocol_write_receipts" AS PERMISSIVE FOR SELECT TO public USING (current_user = 'studio_backup');
