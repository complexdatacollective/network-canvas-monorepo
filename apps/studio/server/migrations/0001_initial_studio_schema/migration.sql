CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"emailVerified" boolean NOT NULL,
	"image" text,
	"locale" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_locale_length_check" CHECK ("locale" IS NULL
          OR char_length("locale") BETWEEN 2 AND 35)
);

CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL UNIQUE,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	"activeTeamId" text
);

CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"issuer" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);

CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "rateLimit" (
	"id" text PRIMARY KEY,
	"key" text NOT NULL UNIQUE,
	"count" integer NOT NULL,
	"lastRequest" bigint NOT NULL
);

CREATE TABLE "teams" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"logo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" text,
	CONSTRAINT "teams_name_nonblank_check" CHECK ("name" ~ '[^[:space:]]')
);

CREATE TABLE "team_members" (
	"id" text PRIMARY KEY,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "team_invitations" (
	"id" text PRIMARY KEY,
	"team_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);

CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"head_seq" bigint DEFAULT 0 NOT NULL,
	"head_manifest_hash" text NOT NULL,
	CONSTRAINT "drafts_id_team_id_unique" UNIQUE("id","team_id")
);

ALTER TABLE "drafts" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "sections" (
	"team_id" text,
	"hash" text,
	"doc" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"unreferenced_at" timestamp with time zone,
	CONSTRAINT "sections_pkey" PRIMARY KEY("team_id","hash")
);

ALTER TABLE "sections" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "manifests" (
	"draft_id" uuid,
	"team_id" text NOT NULL,
	"seq" bigint,
	"hash" text NOT NULL,
	"parent_hash" text,
	"section_hashes" jsonb NOT NULL,
	CONSTRAINT "manifests_pkey" PRIMARY KEY("draft_id","seq")
);

ALTER TABLE "manifests" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "leases" (
	"draft_id" uuid,
	"team_id" text NOT NULL,
	"section_id" text,
	"owner" text NOT NULL,
	"epoch" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "leases_pkey" PRIMARY KEY("draft_id","section_id")
);

ALTER TABLE "leases" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "command_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "command_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"draft_id" uuid NOT NULL,
	"team_id" text NOT NULL,
	"section_id" text NOT NULL,
	"owner" text NOT NULL,
	"epoch" bigint NOT NULL,
	"client_seq" bigint NOT NULL,
	"commands" jsonb NOT NULL,
	"manifest_seq" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "command_log_draft_id_section_id_owner_epoch_client_seq_unique" UNIQUE("draft_id","section_id","owner","epoch","client_seq")
);

ALTER TABLE "command_log" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "protocols" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "protocols_id_team_id_unique" UNIQUE("id","team_id")
);

ALTER TABLE "protocols" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "protocol_versions" (
	"id" uuid PRIMARY KEY,
	"protocol_id" uuid NOT NULL,
	"team_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"label" text,
	"version_hash" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"source_draft_id" uuid,
	"source_manifest_hash" text NOT NULL,
	"migrated_from_version_id" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "protocol_versions_protocol_id_version_number_unique" UNIQUE("protocol_id","version_number"),
	CONSTRAINT "protocol_versions_protocol_id_version_hash_unique" UNIQUE("protocol_id","version_hash"),
	CONSTRAINT "protocol_versions_id_team_id_unique" UNIQUE("id","team_id")
);

ALTER TABLE "protocol_versions" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "version_sections" (
	"version_id" uuid,
	"team_id" text NOT NULL,
	"section_id" text,
	"section_hash" text NOT NULL,
	CONSTRAINT "version_sections_pkey" PRIMARY KEY("version_id","section_id")
);

ALTER TABLE "version_sections" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "protocol_drafts" (
	"draft_id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"protocol_id" uuid NOT NULL,
	"based_on_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "protocol_drafts" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "assets" (
	"team_id" text,
	"hash" text,
	"media_type" text NOT NULL,
	"media_class" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"original_filename" text NOT NULL,
	"origin" text NOT NULL,
	"uploaded_by_user_id" text,
	"dataset_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"unreferenced_at" timestamp with time zone,
	CONSTRAINT "assets_pkey" PRIMARY KEY("team_id","hash"),
	CONSTRAINT "assets_hash_check" CHECK ("hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "assets_media_type_check" CHECK ("media_type" ~ '^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$'),
	CONSTRAINT "assets_media_class_check" CHECK ("media_class" IN ('image', 'audio', 'video', 'document', 'dataset')),
	CONSTRAINT "assets_byte_size_check" CHECK ("byte_size" BETWEEN 1 AND 2147483648),
	CONSTRAINT "assets_original_filename_check" CHECK (char_length("original_filename") BETWEEN 1 AND 255
          AND "original_filename" !~ '[/\\]'
          AND "original_filename" ~ '[^[:space:]]'),
	CONSTRAINT "assets_origin_check" CHECK ("origin" IN ('upload', 'template_import', 'registry_import', 'seed')),
	CONSTRAINT "assets_dataset_metadata_check" CHECK ("dataset_metadata" IS NULL
          OR ("media_class" = 'dataset' AND jsonb_typeof("dataset_metadata") = 'object')),
	CONSTRAINT "assets_uploaded_by_user_id_check" CHECK ("uploaded_by_user_id" IS NULL
          OR char_length("uploaded_by_user_id") BETWEEN 1 AND 255)
);

ALTER TABLE "assets" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "asset_references" (
	"team_id" text,
	"asset_hash" text,
	"referrer_kind" text,
	"referrer_id" text,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "asset_references_pkey" PRIMARY KEY("team_id","asset_hash","referrer_kind","referrer_id"),
	CONSTRAINT "asset_references_referrer_kind_check" CHECK ("referrer_kind" IN ('section', 'protocol_version', 'template_version', 'consent_document', 'message_template')),
	CONSTRAINT "asset_references_referrer_id_check" CHECK (char_length("referrer_id") BETWEEN 1 AND 255)
);

ALTER TABLE "asset_references" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "studies" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"participation_mode" text DEFAULT 'managed' NOT NULL,
	"wave_progression" text DEFAULT 'window' NOT NULL,
	"pause_grace_minutes" integer DEFAULT 60 NOT NULL,
	"protocol_id" uuid,
	"settings" jsonb DEFAULT '{}' NOT NULL,
	"deletion_requested_at" timestamp with time zone,
	"purge_after" timestamp with time zone,
	"went_live_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studies_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "studies_name_nonblank_check" CHECK ("name" ~ '[^[:space:]]' AND char_length("name") <= 320),
	CONSTRAINT "studies_state_check" CHECK ("state" IN ('draft', 'live', 'paused', 'closed')),
	CONSTRAINT "studies_participation_mode_check" CHECK ("participation_mode" IN ('managed', 'anonymous')),
	CONSTRAINT "studies_wave_progression_check" CHECK ("wave_progression" IN ('window', 'sequential')),
	CONSTRAINT "studies_pause_grace_minutes_check" CHECK ("pause_grace_minutes" >= 0 AND "pause_grace_minutes" <= 43200),
	CONSTRAINT "studies_settings_object_check" CHECK (jsonb_typeof("settings") = 'object'),
	CONSTRAINT "studies_deletion_marker_check" CHECK (("deletion_requested_at" IS NULL) = ("purge_after" IS NULL)),
	CONSTRAINT "studies_closed_at_check" CHECK (("state" = 'closed') = ("closed_at" IS NOT NULL)),
	CONSTRAINT "studies_paused_at_check" CHECK (("state" = 'paused') = ("paused_at" IS NOT NULL)),
	CONSTRAINT "studies_went_live_at_check" CHECK ("state" = 'draft' OR "went_live_at" IS NOT NULL)
);

ALTER TABLE "studies" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "study_waves" (
	"id" uuid PRIMARY KEY,
	"study_id" uuid NOT NULL,
	"team_id" text NOT NULL,
	"wave_number" integer NOT NULL,
	"name" text,
	"protocol_version_id" uuid,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_waves_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "study_waves_id_study_id_team_id_unique" UNIQUE("id","study_id","team_id"),
	CONSTRAINT "study_waves_study_id_wave_number_unique" UNIQUE("study_id","wave_number"),
	CONSTRAINT "study_waves_wave_number_check" CHECK ("wave_number" >= 1),
	CONSTRAINT "study_waves_name_check" CHECK ("name" IS NULL
          OR ("name" ~ '[^[:space:]]' AND char_length("name") <= 320)),
	CONSTRAINT "study_waves_window_check" CHECK ("opens_at" IS NULL
          OR "closes_at" IS NULL
          OR "closes_at" > "opens_at")
);

ALTER TABLE "study_waves" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY,
	"study_id" uuid NOT NULL,
	"team_id" text NOT NULL,
	"participant_code" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"enrolled_at" timestamp with time zone,
	"email_ciphertext" bytea,
	"email_index" bytea,
	"phone_ciphertext" bytea,
	"phone_index" bytea,
	"name_ciphertext" bytea,
	"attributes_ciphertext" bytea,
	"pii_key_id" text,
	"pii_algorithm" text,
	"source_participant_id" uuid,
	"source_study_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "participants_id_study_id_team_id_unique" UNIQUE("id","study_id","team_id"),
	CONSTRAINT "participants_study_id_participant_code_unique" UNIQUE("study_id","participant_code"),
	CONSTRAINT "participants_participant_code_check" CHECK ("participant_code" ~ '[^[:space:]]'
          AND char_length("participant_code") <= 128),
	CONSTRAINT "participants_timezone_check" CHECK ("timezone" ~ '^[A-Za-z][A-Za-z0-9+_-]*(/[A-Za-z0-9+._-]+)*$'
          AND char_length("timezone") BETWEEN 1 AND 64),
	CONSTRAINT "participants_blind_index_pairing_check" CHECK (("email_ciphertext" IS NULL) = ("email_index" IS NULL)
          AND ("phone_ciphertext" IS NULL) = ("phone_index" IS NULL)),
	CONSTRAINT "participants_pii_key_check" CHECK (("pii_key_id" IS NULL) = ("pii_algorithm" IS NULL)
          AND (
            "pii_key_id" IS NOT NULL
            OR num_nonnulls(
              "email_ciphertext", "phone_ciphertext",
              "name_ciphertext", "attributes_ciphertext"
            ) = 0
          )),
	CONSTRAINT "participants_source_check" CHECK (("source_participant_id" IS NULL) = ("source_study_id" IS NULL))
);

ALTER TABLE "participants" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "interview_sessions" (
	"id" uuid PRIMARY KEY,
	"study_id" uuid NOT NULL,
	"team_id" text NOT NULL,
	"wave_id" uuid NOT NULL,
	"participant_id" uuid,
	"protocol_version_id" uuid NOT NULL,
	"link_id" uuid,
	"delivery_mode" text DEFAULT 'self_administered' NOT NULL,
	"initiated_by_user_id" text,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"current_stage_index" integer DEFAULT 0 NOT NULL,
	"current_stage_id" text,
	"stage_metadata" jsonb DEFAULT '{}' NOT NULL,
	"ego_uid" text NOT NULL,
	"ego_attributes" jsonb DEFAULT '{}' NOT NULL,
	"ego_secure_attributes" jsonb,
	"holder_id" text,
	"holder_epoch" bigint DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"abandoned_at" timestamp with time zone,
	CONSTRAINT "interview_sessions_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "interview_sessions_id_study_id_team_id_unique" UNIQUE("id","study_id","team_id"),
	CONSTRAINT "interview_sessions_status_check" CHECK ("status" IN ('in_progress', 'completed', 'abandoned')),
	CONSTRAINT "interview_sessions_delivery_mode_check" CHECK ("delivery_mode" IN ('self_administered', 'researcher_led')
          AND ("delivery_mode" = 'researcher_led')
              = ("initiated_by_user_id" IS NOT NULL)),
	CONSTRAINT "interview_sessions_terminal_state_check" CHECK (("status" = 'completed') = ("completed_at" IS NOT NULL)
          AND ("status" = 'abandoned') = ("abandoned_at" IS NOT NULL)),
	CONSTRAINT "interview_sessions_stage_check" CHECK ("current_stage_index" >= 0
          AND ("current_stage_id" IS NULL
               OR char_length("current_stage_id") BETWEEN 1 AND 128)),
	CONSTRAINT "interview_sessions_holder_check" CHECK ("holder_epoch" >= 0
          AND ("holder_id" IS NULL OR char_length("holder_id") BETWEEN 1 AND 128)),
	CONSTRAINT "interview_sessions_ego_check" CHECK (char_length("ego_uid") BETWEEN 1 AND 128
          AND jsonb_typeof("ego_attributes") = 'object'
          AND jsonb_typeof("stage_metadata") = 'object'
          AND ("ego_secure_attributes" IS NULL
               OR jsonb_typeof("ego_secure_attributes") = 'object'))
);

ALTER TABLE "interview_sessions" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "interview_links" (
	"id" uuid PRIMARY KEY,
	"study_id" uuid NOT NULL,
	"team_id" text NOT NULL,
	"wave_id" uuid NOT NULL,
	"participant_id" uuid,
	"kind" text NOT NULL,
	"token_hash" bytea NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"last_redeemed_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interview_links_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "interview_links_kind_check" CHECK ("kind" IN ('participant', 'anonymous')
          AND ("kind" = 'participant') = ("participant_id" IS NOT NULL)),
	CONSTRAINT "interview_links_redemption_count_check" CHECK ("redemption_count" >= 0
          AND ("redemption_count" = 0) = ("last_redeemed_at" IS NULL)),
	CONSTRAINT "interview_links_token_hash_check" CHECK (octet_length("token_hash") = 32)
);

ALTER TABLE "interview_links" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "session_snapshots" (
	"session_id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"study_id" uuid NOT NULL,
	"protocol_version_id" uuid NOT NULL,
	"schema_version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_snapshots_payload_check" CHECK (jsonb_typeof("payload") = 'object'
          AND "schema_version" > 0
          AND char_length("payload_hash") BETWEEN 1 AND 128)
);

ALTER TABLE "session_snapshots" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "nodes" (
	"team_id" text NOT NULL,
	"session_id" uuid,
	"node_id" text,
	"type" text NOT NULL,
	"attributes" jsonb DEFAULT '{}' NOT NULL,
	"secure_attributes" jsonb,
	"stage_id" text,
	"prompt_ids" text[],
	CONSTRAINT "nodes_pkey" PRIMARY KEY("session_id","node_id"),
	CONSTRAINT "nodes_identifier_lengths_check" CHECK (char_length("node_id") BETWEEN 1 AND 128
          AND char_length("type") BETWEEN 1 AND 128
          AND ("stage_id" IS NULL
               OR char_length("stage_id") BETWEEN 1 AND 128)),
	CONSTRAINT "nodes_attributes_object_check" CHECK (jsonb_typeof("attributes") = 'object'
          AND ("secure_attributes" IS NULL
               OR jsonb_typeof("secure_attributes") = 'object'))
);

ALTER TABLE "nodes" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "edges" (
	"team_id" text NOT NULL,
	"session_id" uuid,
	"edge_id" text,
	"type" text NOT NULL,
	"from_node" text NOT NULL,
	"to_node" text NOT NULL,
	"attributes" jsonb DEFAULT '{}' NOT NULL,
	"secure_attributes" jsonb,
	CONSTRAINT "edges_pkey" PRIMARY KEY("session_id","edge_id"),
	CONSTRAINT "edges_identifier_lengths_check" CHECK (char_length("edge_id") BETWEEN 1 AND 128
          AND char_length("type") BETWEEN 1 AND 128
          AND char_length("from_node") BETWEEN 1 AND 128
          AND char_length("to_node") BETWEEN 1 AND 128),
	CONSTRAINT "edges_attributes_object_check" CHECK (jsonb_typeof("attributes") = 'object'
          AND ("secure_attributes" IS NULL
               OR jsonb_typeof("secure_attributes") = 'object'))
);

ALTER TABLE "edges" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "session_stats" (
	"team_id" text NOT NULL,
	"session_id" uuid PRIMARY KEY,
	"study_id" uuid NOT NULL,
	"wave_id" uuid NOT NULL,
	"wave_number" integer NOT NULL,
	"participant_id" uuid,
	"node_count" integer NOT NULL,
	"edge_count" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_stats_counts_check" CHECK ("node_count" >= 0 AND "edge_count" >= 0
          AND "wave_number" >= 1)
);

ALTER TABLE "session_stats" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "session_degree_hist" (
	"team_id" text NOT NULL,
	"session_id" uuid,
	"degree" integer,
	"node_count" integer NOT NULL,
	CONSTRAINT "session_degree_hist_pkey" PRIMARY KEY("session_id","degree"),
	CONSTRAINT "session_degree_hist_counts_check" CHECK ("degree" >= 0 AND "node_count" > 0)
);

ALTER TABLE "session_degree_hist" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "study_role_grants" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"study_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"pii_access" boolean DEFAULT false NOT NULL,
	"granted_by_user_id" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_role_grants_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "study_role_grants_study_id_user_id_unique" UNIQUE("study_id","user_id"),
	CONSTRAINT "study_role_grants_role_check" CHECK ("role" IN ('manager', 'protocol_designer', 'coordinator', 'data_viewer')),
	CONSTRAINT "study_role_grants_identifier_lengths_check" CHECK (char_length("user_id") BETWEEN 1 AND 255
          AND char_length("granted_by_user_id") BETWEEN 1 AND 255)
);

ALTER TABLE "study_role_grants" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "consent_documents" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"study_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"title" text NOT NULL,
	"body" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"published_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_documents_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "consent_documents_id_study_id_team_id_unique" UNIQUE("id","study_id","team_id"),
	CONSTRAINT "consent_documents_study_id_version_unique" UNIQUE("study_id","version"),
	CONSTRAINT "consent_documents_version_check" CHECK ("version" >= 1),
	CONSTRAINT "consent_documents_state_check" CHECK ("state" IN ('draft', 'published', 'retired')),
	CONSTRAINT "consent_documents_state_evidence_check" CHECK (("state" = 'draft') = ("published_at" IS NULL)
          AND ("state" = 'retired') = ("retired_at" IS NOT NULL)),
	CONSTRAINT "consent_documents_content_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "consent_documents_body_object_check" CHECK (jsonb_typeof("body") = 'object'),
	CONSTRAINT "consent_documents_lengths_check" CHECK (char_length("title") BETWEEN 1 AND 320
          AND "title" ~ '[^[:space:]]'
          AND char_length("locale") BETWEEN 2 AND 35)
);

ALTER TABLE "consent_documents" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "consent_items" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"consent_document_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"key" text NOT NULL,
	"prompt" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_items_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "consent_items_id_consent_document_id_key_team_id_unique" UNIQUE("id","consent_document_id","key","team_id"),
	CONSTRAINT "consent_items_consent_document_id_position_unique" UNIQUE("consent_document_id","position"),
	CONSTRAINT "consent_items_consent_document_id_key_unique" UNIQUE("consent_document_id","key"),
	CONSTRAINT "consent_items_position_check" CHECK ("position" >= 1),
	CONSTRAINT "consent_items_key_check" CHECK ("key" ~ '^[a-z][a-z0-9_]{0,63}$'),
	CONSTRAINT "consent_items_prompt_check" CHECK (char_length("prompt") BETWEEN 1 AND 2000
          AND "prompt" ~ '[^[:space:]]')
);

ALTER TABLE "consent_items" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "participant_consents" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"study_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"consent_document_id" uuid NOT NULL,
	"consent_content_hash" text NOT NULL,
	"session_id" uuid,
	"method" text DEFAULT 'affirmation' NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_by" text,
	"withdrawal_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_consents_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "participant_consents_id_study_id_team_id_unique" UNIQUE("id","study_id","team_id"),
	CONSTRAINT "participant_consents_id_consent_document_id_team_id_unique" UNIQUE("id","consent_document_id","team_id"),
	CONSTRAINT "participant_consents_participant_id_consent_document_id_unique" UNIQUE("participant_id","consent_document_id"),
	CONSTRAINT "participant_consents_method_check" CHECK ("method" IN ('affirmation')),
	CONSTRAINT "participant_consents_withdrawal_check" CHECK (("withdrawn_at" IS NULL) = ("withdrawn_by" IS NULL)
          AND ("withdrawn_at" IS NULL OR "withdrawn_at" >= "granted_at")
          AND ("withdrawal_note" IS NULL OR "withdrawn_at" IS NOT NULL)),
	CONSTRAINT "participant_consents_withdrawn_by_check" CHECK ("withdrawn_by" IS NULL
          OR "withdrawn_by" IN ('participant', 'researcher')),
	CONSTRAINT "participant_consents_content_hash_check" CHECK ("consent_content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "participant_consents_withdrawal_note_check" CHECK ("withdrawal_note" IS NULL
          OR char_length("withdrawal_note") BETWEEN 1 AND 1000)
);

ALTER TABLE "participant_consents" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "participant_consent_item_responses" (
	"team_id" text NOT NULL,
	"participant_consent_id" uuid,
	"consent_document_id" uuid NOT NULL,
	"consent_item_id" uuid,
	"item_key" text NOT NULL,
	"affirmed" boolean NOT NULL,
	CONSTRAINT "participant_consent_item_responses_pkey" PRIMARY KEY("participant_consent_id","consent_item_id"),
	CONSTRAINT "participant_consent_item_responses_item_key_check" CHECK ("item_key" ~ '^[a-z][a-z0-9_]{0,63}$')
);

ALTER TABLE "participant_consent_item_responses" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "study_schedules" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"study_id" uuid NOT NULL,
	"wave_id" uuid,
	"name" text NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"anchor_kind" text NOT NULL,
	"anchor_date" timestamp with time zone,
	"anchor_offset_minutes" integer DEFAULT 0 NOT NULL,
	"recurrence_kind" text NOT NULL,
	"interval_days" integer,
	"samples_per_period" integer,
	"period_days" integer,
	"min_gap_minutes" integer,
	"occurrence_limit" integer,
	"window_start_minute" smallint DEFAULT 0 NOT NULL,
	"window_end_minute" smallint DEFAULT 1439 NOT NULL,
	"days_of_week_mask" smallint DEFAULT 127 NOT NULL,
	"quiet_hours_start_minute" smallint,
	"quiet_hours_end_minute" smallint,
	"max_prompts_per_day" smallint DEFAULT 1 NOT NULL,
	"prompt_expiry_hours" integer DEFAULT 24 NOT NULL,
	"catch_up_policy" text DEFAULT 'skip' NOT NULL,
	"fallback_time_zone" text DEFAULT 'UTC' NOT NULL,
	"channels" text[] NOT NULL,
	"settings" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_schedules_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "study_schedules_id_study_id_team_id_unique" UNIQUE("id","study_id","team_id"),
	CONSTRAINT "study_schedules_state_check" CHECK ("state" IN ('draft', 'active', 'paused', 'ended')),
	CONSTRAINT "study_schedules_anchor_check" CHECK ("anchor_kind" IN ('enrolment', 'wave_window_start', 'fixed_date')
          AND ("anchor_kind" = 'fixed_date') = ("anchor_date" IS NOT NULL)
          AND ("anchor_kind" <> 'wave_window_start' OR "wave_id" IS NOT NULL)),
	CONSTRAINT "study_schedules_recurrence_check" CHECK ("recurrence_kind" IN ('one_off', 'fixed_interval', 'random_sample')
          AND ("recurrence_kind" = 'fixed_interval') = ("interval_days" IS NOT NULL)
          AND ("recurrence_kind" = 'random_sample') = ("samples_per_period" IS NOT NULL)
          AND ("samples_per_period" IS NULL) = ("period_days" IS NULL)
          AND ("samples_per_period" IS NULL) = ("min_gap_minutes" IS NULL)
          AND ("recurrence_kind" <> 'one_off' OR "occurrence_limit" IS NULL)),
	CONSTRAINT "study_schedules_recurrence_bounds_check" CHECK (("interval_days" IS NULL OR "interval_days" BETWEEN 1 AND 365)
          AND ("samples_per_period" IS NULL OR "samples_per_period" BETWEEN 1 AND 24)
          AND ("period_days" IS NULL OR "period_days" BETWEEN 1 AND 365)
          AND ("min_gap_minutes" IS NULL OR "min_gap_minutes" BETWEEN 0 AND 43200)
          AND ("occurrence_limit" IS NULL OR "occurrence_limit" BETWEEN 1 AND 10000)
          AND "anchor_offset_minutes" BETWEEN -43200 AND 43200),
	CONSTRAINT "study_schedules_window_check" CHECK ("window_start_minute" BETWEEN 0 AND 1439
          AND "window_end_minute" BETWEEN 0 AND 1439
          AND "window_start_minute" < "window_end_minute"
          AND "days_of_week_mask" BETWEEN 1 AND 127),
	CONSTRAINT "study_schedules_quiet_hours_check" CHECK (("quiet_hours_start_minute" IS NULL) = ("quiet_hours_end_minute" IS NULL)
          AND ("quiet_hours_start_minute" IS NULL
               OR ("quiet_hours_start_minute" BETWEEN 0 AND 1439
                   AND "quiet_hours_end_minute" BETWEEN 0 AND 1439))),
	CONSTRAINT "study_schedules_constraints_check" CHECK ("max_prompts_per_day" BETWEEN 1 AND 24
          AND "prompt_expiry_hours" BETWEEN 1 AND 8760),
	CONSTRAINT "study_schedules_catch_up_policy_check" CHECK ("catch_up_policy" IN ('skip', 'reschedule_within_period')),
	CONSTRAINT "study_schedules_channels_check" CHECK (coalesce(array_length("channels", 1), 0) BETWEEN 1 AND 2
          AND "channels" <@ ARRAY['email', 'sms']::text[]
          AND (array_length("channels", 1) = 1
               OR "channels"[1] <> "channels"[2])),
	CONSTRAINT "study_schedules_settings_object_check" CHECK (jsonb_typeof("settings") = 'object'),
	CONSTRAINT "study_schedules_name_check" CHECK (char_length("name") BETWEEN 1 AND 120
          AND "name" ~ '[^[:space:]]')
);

ALTER TABLE "study_schedules" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "schedule_occurrences" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"study_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"occurrence_index" integer NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"scheduled_local_date" date NOT NULL,
	"scheduled_local_minute" smallint NOT NULL,
	"resolved_time_zone" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_occurrences_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "schedule_occurrences_id_participant_id_study_id_team_id_unique" UNIQUE("id","participant_id","study_id","team_id"),
	CONSTRAINT "schedule_occurrences_schedule_id_participant_id_occurrence_index_unique" UNIQUE("schedule_id","participant_id","occurrence_index"),
	CONSTRAINT "schedule_occurrences_state_check" CHECK ("state" IN ('scheduled', 'dispatched', 'expired', 'cancelled', 'superseded')),
	CONSTRAINT "schedule_occurrences_bounds_check" CHECK ("occurrence_index" >= 1
          AND "scheduled_local_minute" BETWEEN 0 AND 1439
          AND "expires_at" > "scheduled_for"
          AND char_length("resolved_time_zone") BETWEEN 1 AND 64)
);

ALTER TABLE "schedule_occurrences" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"study_id" uuid,
	"kind" text NOT NULL,
	"channel" text NOT NULL,
	"locale" text NOT NULL,
	"version" integer NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_templates_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "message_templates_identity_key" UNIQUE NULLS NOT DISTINCT("team_id","study_id","kind","channel","locale","version"),
	CONSTRAINT "message_templates_kind_check" CHECK ("kind" IN ('invitation', 'prompt', 'reminder', 'custom')),
	CONSTRAINT "message_templates_channel_check" CHECK ("channel" IN ('email', 'sms')),
	CONSTRAINT "message_templates_subject_check" CHECK (("channel" = 'email') = ("subject" IS NOT NULL)
          AND ("subject" IS NULL OR char_length("subject") BETWEEN 1 AND 200)),
	CONSTRAINT "message_templates_state_check" CHECK ("state" IN ('draft', 'published', 'retired')),
	CONSTRAINT "message_templates_body_check" CHECK (char_length("body") BETWEEN 1 AND 8000
          AND "body" ~ '[^[:space:]]'),
	CONSTRAINT "message_templates_locale_check" CHECK (char_length("locale") BETWEEN 2 AND 35 AND "version" >= 1)
);

ALTER TABLE "message_templates" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "message_deliveries" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"study_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"occurrence_id" uuid,
	"template_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"channel" text NOT NULL,
	"recipient_blind_index" text NOT NULL,
	"rendered_body_hash" text NOT NULL,
	"provider" text,
	"provider_message_id" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" uuid,
	"lease_expires_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"suppressed_at" timestamp with time zone,
	"uncertain_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_deliveries_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "message_deliveries_kind_check" CHECK ("kind" IN ('invitation', 'prompt', 'reminder', 'custom')),
	CONSTRAINT "message_deliveries_channel_check" CHECK ("channel" IN ('email', 'sms')),
	CONSTRAINT "message_deliveries_provider_check" CHECK ("provider" IS NULL
          OR "provider" IN ('postmark', 'twilio', 'smtp', 'none')),
	CONSTRAINT "message_deliveries_attempt_count_check" CHECK ("attempt_count" >= 0),
	CONSTRAINT "message_deliveries_hash_check" CHECK ("rendered_body_hash" ~ '^[0-9a-f]{64}$'
          AND "recipient_blind_index" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "message_deliveries_lease_check" CHECK (("lease_owner" IS NULL) = ("lease_expires_at" IS NULL)),
	CONSTRAINT "message_deliveries_terminal_state_check" CHECK (num_nonnulls("sent_at", "failed_at", "suppressed_at", "uncertain_at") <= 1
          AND (
            num_nonnulls("sent_at", "failed_at", "suppressed_at", "uncertain_at") = 0
            OR ("lease_owner" IS NULL AND "lease_expires_at" IS NULL)
          )),
	CONSTRAINT "message_deliveries_lengths_check" CHECK (("last_error" IS NULL OR char_length("last_error") <= 1000)
          AND ("provider_message_id" IS NULL
               OR char_length("provider_message_id") BETWEEN 1 AND 255))
);

ALTER TABLE "message_deliveries" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "message_delivery_events" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"delivery_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detail" jsonb DEFAULT '{}' NOT NULL,
	CONSTRAINT "message_delivery_events_delivery_id_provider_provider_event_id_unique" UNIQUE("delivery_id","provider","provider_event_id"),
	CONSTRAINT "message_delivery_events_kind_check" CHECK ("kind" IN ('queued', 'delivered', 'bounced', 'complained', 'failed')),
	CONSTRAINT "message_delivery_events_provider_check" CHECK ("provider" IN ('postmark', 'twilio', 'smtp')),
	CONSTRAINT "message_delivery_events_detail_object_check" CHECK (jsonb_typeof("detail") = 'object'),
	CONSTRAINT "message_delivery_events_provider_event_id_check" CHECK (char_length("provider_event_id") BETWEEN 1 AND 255)
);

ALTER TABLE "message_delivery_events" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "participant_contact_optouts" (
	"team_id" text,
	"channel" text,
	"recipient_blind_index" text,
	"source" text NOT NULL,
	"opted_out_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_contact_optouts_pkey" PRIMARY KEY("team_id","channel","recipient_blind_index"),
	CONSTRAINT "participant_contact_optouts_channel_check" CHECK ("channel" IN ('email', 'sms')),
	CONSTRAINT "participant_contact_optouts_source_check" CHECK ("source" IN ('participant_reply', 'provider', 'researcher')),
	CONSTRAINT "participant_contact_optouts_blind_index_check" CHECK ("recipient_blind_index" ~ '^[0-9a-f]{64}$')
);

ALTER TABLE "participant_contact_optouts" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"custodian_user_id" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scope_kind" text NOT NULL,
	"study_id" uuid,
	"access_level" text NOT NULL,
	"includes_pii" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_tokens_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "api_tokens_scope_kind_check" CHECK ("scope_kind" IN ('team', 'study')
          AND ("scope_kind" = 'study') = ("study_id" IS NOT NULL)),
	CONSTRAINT "api_tokens_access_level_check" CHECK ("access_level" IN ('read', 'write')),
	CONSTRAINT "api_tokens_revocation_check" CHECK (("revoked_at" IS NULL) = ("revoked_by_user_id" IS NULL)),
	CONSTRAINT "api_tokens_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "api_tokens_token_prefix_check" CHECK ("token_prefix" ~ '^[a-z0-9_]{8,40}$'),
	CONSTRAINT "api_tokens_name_check" CHECK (char_length("name") BETWEEN 1 AND 120
          AND "name" ~ '[^[:space:]]'),
	CONSTRAINT "api_tokens_actor_lengths_check" CHECK (char_length("created_by_user_id") BETWEEN 1 AND 255
          AND char_length("custodian_user_id") BETWEEN 1 AND 255
          AND ("revoked_by_user_id" IS NULL OR char_length("revoked_by_user_id") BETWEEN 1 AND 255))
);

ALTER TABLE "api_tokens" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"license" text DEFAULT 'CC-BY-4.0' NOT NULL,
	"curated" boolean DEFAULT false NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"author_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "templates_kind_check" CHECK ("kind" IN ('protocol', 'stage', 'entity_definition', 'variable_set', 'generator_prompt_set')),
	CONSTRAINT "templates_license_check" CHECK ("license" IN ('CC-BY-4.0', 'CC0-1.0')),
	CONSTRAINT "templates_state_check" CHECK ("state" IN ('draft', 'published', 'retired')),
	CONSTRAINT "templates_metadata_object_check" CHECK (jsonb_typeof("metadata") = 'object'),
	CONSTRAINT "templates_lengths_check" CHECK (char_length("name") BETWEEN 1 AND 200
          AND "name" ~ '[^[:space:]]'
          AND ("summary" IS NULL OR char_length("summary") BETWEEN 1 AND 2000)
          AND ("author_user_id" IS NULL OR char_length("author_user_id") BETWEEN 1 AND 255))
);

ALTER TABLE "templates" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "template_versions" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"template_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"manifest" jsonb NOT NULL,
	"manifest_hash" text NOT NULL,
	"schema_version" integer NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_versions_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "template_versions_template_id_version_number_unique" UNIQUE("template_id","version_number"),
	CONSTRAINT "template_versions_template_id_manifest_hash_unique" UNIQUE("template_id","manifest_hash"),
	CONSTRAINT "template_versions_numbers_check" CHECK ("version_number" >= 1 AND "schema_version" >= 1),
	CONSTRAINT "template_versions_manifest_hash_check" CHECK ("manifest_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "template_versions_manifest_object_check" CHECK (jsonb_typeof("manifest") = 'object')
);

ALTER TABLE "template_versions" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "template_version_sections" (
	"version_id" uuid,
	"team_id" text NOT NULL,
	"section_id" text,
	"section_hash" text NOT NULL,
	CONSTRAINT "template_version_sections_pkey" PRIMARY KEY("version_id","section_id")
);

ALTER TABLE "template_version_sections" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "webhook_subscriptions" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"study_id" uuid,
	"url" text NOT NULL,
	"description" text,
	"event_types" text[] NOT NULL,
	"secret_ciphertext" bytea NOT NULL,
	"secret_key_id" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_failure_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_subscriptions_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "webhook_subscriptions_state_check" CHECK ("state" IN ('active', 'disabled')
          AND ("state" = 'disabled') = ("disabled_at" IS NOT NULL)),
	CONSTRAINT "webhook_subscriptions_url_check" CHECK ("url" ~ '^https://' AND char_length("url") BETWEEN 12 AND 2000),
	CONSTRAINT "webhook_subscriptions_event_types_check" CHECK (COALESCE(array_length("event_types", 1), 0) BETWEEN 1 AND 50 AND array_position("event_types", NULL) IS NULL),
	CONSTRAINT "webhook_subscriptions_failures_check" CHECK ("consecutive_failures" >= 0),
	CONSTRAINT "webhook_subscriptions_lengths_check" CHECK (char_length("secret_key_id") BETWEEN 1 AND 64
          AND octet_length("secret_ciphertext") BETWEEN 1 AND 512
          AND char_length("created_by_user_id") BETWEEN 1 AND 255
          AND ("description" IS NULL OR char_length("description") BETWEEN 1 AND 500))
);

ALTER TABLE "webhook_subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"subscription_id" uuid NOT NULL,
	"webhook_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" uuid,
	"lease_expires_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"last_status_code" smallint,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_deliveries_subscription_id_webhook_id_unique" UNIQUE("subscription_id","webhook_id"),
	CONSTRAINT "webhook_deliveries_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'
          AND pg_column_size("payload") <= 4096),
	CONSTRAINT "webhook_deliveries_lease_check" CHECK (("lease_owner" IS NULL) = ("lease_expires_at" IS NULL)),
	CONSTRAINT "webhook_deliveries_terminal_state_check" CHECK (num_nonnulls("delivered_at", "failed_at") <= 1
          AND (
            num_nonnulls("delivered_at", "failed_at") = 0
            OR ("lease_owner" IS NULL AND "lease_expires_at" IS NULL)
          )),
	CONSTRAINT "webhook_deliveries_lengths_check" CHECK (char_length("webhook_id") BETWEEN 1 AND 128
          AND char_length("event_type") BETWEEN 1 AND 128
          AND "attempt_count" >= 0
          AND ("last_status_code" IS NULL OR "last_status_code" BETWEEN 100 AND 599)
          AND ("last_error" IS NULL OR char_length("last_error") <= 1000))
);

ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"surface" text NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"variants" jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiments_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "experiments_team_id_key_unique" UNIQUE("team_id","key"),
	CONSTRAINT "experiments_surface_check" CHECK ("surface" IN ('researcher', 'participant')),
	CONSTRAINT "experiments_state_check" CHECK ("state" IN ('draft', 'running', 'stopped')
          AND ("state" = 'draft') = ("started_at" IS NULL)
          AND ("state" = 'stopped') = ("stopped_at" IS NOT NULL)
          AND ("stopped_at" IS NULL OR "stopped_at" >= "started_at")),
	CONSTRAINT "experiments_variants_check" CHECK (jsonb_typeof("variants") = 'array'
          AND jsonb_array_length("variants") BETWEEN 2 AND 10),
	CONSTRAINT "experiments_key_check" CHECK ("key" ~ '^[a-z][a-z0-9_.-]{1,63}$'
          AND char_length("name") BETWEEN 1 AND 200)
);

ALTER TABLE "experiments" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "experiment_assignments" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"experiment_id" uuid NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"variant_key" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiment_assignments_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "experiment_assignments_id_experiment_id_variant_key_team_id_unique" UNIQUE("id","experiment_id","variant_key","team_id"),
	CONSTRAINT "experiment_assignments_experiment_id_subject_kind_subject_id_unique" UNIQUE("experiment_id","subject_kind","subject_id"),
	CONSTRAINT "experiment_assignments_subject_kind_check" CHECK ("subject_kind" IN ('user', 'participant', 'session')),
	CONSTRAINT "experiment_assignments_lengths_check" CHECK (char_length("subject_id") BETWEEN 1 AND 255
          AND "variant_key" ~ '^[a-z][a-z0-9_.-]{0,63}$')
);

ALTER TABLE "experiment_assignments" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "experiment_exposures" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"experiment_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"variant_key" text NOT NULL,
	"surface_key" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"details" jsonb DEFAULT '{}' NOT NULL,
	CONSTRAINT "experiment_exposures_details_check" CHECK (jsonb_typeof("details") = 'object'
          AND pg_column_size("details") <= 2048),
	CONSTRAINT "experiment_exposures_lengths_check" CHECK (char_length("surface_key") BETWEEN 1 AND 128
          AND "variant_key" ~ '^[a-z][a-z0-9_.-]{0,63}$')
);

ALTER TABLE "experiment_exposures" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "feedback_reports" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"study_id" uuid,
	"reporter_kind" text NOT NULL,
	"reporter_user_id" text,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"context" jsonb DEFAULT '{}' NOT NULL,
	"context_consent" boolean DEFAULT false NOT NULL,
	"state" text DEFAULT 'new' NOT NULL,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"triaged_at" timestamp with time zone,
	CONSTRAINT "feedback_reports_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "feedback_reports_reporter_kind_check" CHECK ("reporter_kind" IN ('user', 'participant', 'anonymous')
          AND ("reporter_kind" = 'user') = ("reporter_user_id" IS NOT NULL)),
	CONSTRAINT "feedback_reports_kind_check" CHECK ("kind" IN ('bug', 'suggestion')),
	CONSTRAINT "feedback_reports_state_check" CHECK ("state" IN ('new', 'triaged', 'forwarded', 'closed')
          AND ("state" = 'new') = ("triaged_at" IS NULL)),
	CONSTRAINT "feedback_reports_context_consent_check" CHECK ("context_consent" OR "context" = '{}'::jsonb),
	CONSTRAINT "feedback_reports_context_object_check" CHECK (jsonb_typeof("context") = 'object'
          AND pg_column_size("context") <= 4096),
	CONSTRAINT "feedback_reports_lengths_check" CHECK (char_length("body") BETWEEN 1 AND 5000
          AND "body" ~ '[^[:space:]]'
          AND ("external_ref" IS NULL OR char_length("external_ref") BETWEEN 1 AND 500)
          AND ("reporter_user_id" IS NULL OR char_length("reporter_user_id") BETWEEN 1 AND 255))
);

ALTER TABLE "feedback_reports" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "study_wave_rollups" (
	"team_id" text NOT NULL,
	"study_id" uuid NOT NULL,
	"wave_id" uuid PRIMARY KEY,
	"invited_count" integer DEFAULT 0 NOT NULL,
	"onboarding_started_count" integer DEFAULT 0 NOT NULL,
	"consented_count" integer DEFAULT 0 NOT NULL,
	"session_started_count" integer DEFAULT 0 NOT NULL,
	"session_completed_count" integer DEFAULT 0 NOT NULL,
	"session_abandoned_count" integer DEFAULT 0 NOT NULL,
	"delivery_failed_count" integer DEFAULT 0 NOT NULL,
	"stale_at" timestamp with time zone,
	"recomputed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_wave_rollups_counts_check" CHECK ("invited_count" >= 0 AND "onboarding_started_count" >= 0
          AND "consented_count" >= 0 AND "session_started_count" >= 0
          AND "session_completed_count" >= 0 AND "session_abandoned_count" >= 0
          AND "delivery_failed_count" >= 0)
);

ALTER TABLE "study_wave_rollups" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "study_stage_rollups" (
	"team_id" text NOT NULL,
	"study_id" uuid NOT NULL,
	"wave_id" uuid,
	"stage_id" text,
	"entered_count" integer DEFAULT 0 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"abandoned_count" integer DEFAULT 0 NOT NULL,
	"duration_ms_sum" bigint DEFAULT 0 NOT NULL,
	"duration_ms_count" integer DEFAULT 0 NOT NULL,
	"missing_item_count" integer DEFAULT 0 NOT NULL,
	"stale_at" timestamp with time zone,
	"recomputed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_stage_rollups_pkey" PRIMARY KEY("wave_id","stage_id"),
	CONSTRAINT "study_stage_rollups_counts_check" CHECK ("entered_count" >= 0 AND "completed_count" >= 0
          AND "abandoned_count" >= 0 AND "duration_ms_sum" >= 0
          AND "duration_ms_count" >= 0 AND "missing_item_count" >= 0
          AND char_length("stage_id") BETWEEN 1 AND 128)
);

ALTER TABLE "study_stage_rollups" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"team_label" text NOT NULL,
	"sequence" bigint NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"event_type" text NOT NULL,
	"event_version" smallint NOT NULL,
	"category" text NOT NULL,
	"outcome" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" text,
	"actor_label" text NOT NULL,
	"subject_type" text,
	"subject_id" text,
	"subject_label" text,
	"resource_type" text,
	"resource_id" text,
	"resource_label" text,
	"request_id" uuid NOT NULL,
	"details" jsonb NOT NULL,
	CONSTRAINT "audit_events_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "audit_events_alert_identity_unique" UNIQUE("id","team_id","sequence","event_type","event_version"),
	CONSTRAINT "audit_events_category_check" CHECK ("category" IN ('team_access', 'protocol', 'study', 'participant_data', 'data_egress', 'credential', 'integration', 'security', 'audit')),
	CONSTRAINT "audit_events_outcome_check" CHECK ("outcome" IN ('succeeded', 'denied', 'failed')),
	CONSTRAINT "audit_events_actor_kind_check" CHECK ("actor_kind" IN ('user', 'api_token', 'system')),
	CONSTRAINT "audit_events_actor_id_check" CHECK ("actor_kind" = 'system' OR "actor_id" IS NOT NULL),
	CONSTRAINT "audit_events_sequence_check" CHECK ("sequence" > 0 AND "event_version" > 0),
	CONSTRAINT "audit_events_identifier_lengths_check" CHECK (char_length("team_id") BETWEEN 1 AND 255
          AND char_length("event_type") BETWEEN 1 AND 128
          AND ("actor_id" IS NULL OR char_length("actor_id") BETWEEN 1 AND 255)
          AND ("subject_type" IS NULL OR char_length("subject_type") BETWEEN 1 AND 64)
          AND ("subject_id" IS NULL OR char_length("subject_id") BETWEEN 1 AND 255)
          AND ("resource_type" IS NULL OR char_length("resource_type") BETWEEN 1 AND 64)
          AND ("resource_id" IS NULL OR char_length("resource_id") BETWEEN 1 AND 255)),
	CONSTRAINT "audit_events_label_lengths_check" CHECK (char_length("team_label") BETWEEN 1 AND 320
          AND char_length("actor_label") BETWEEN 1 AND 320
          AND ("subject_label" IS NULL OR char_length("subject_label") BETWEEN 1 AND 320)
          AND ("resource_label" IS NULL OR char_length("resource_label") BETWEEN 1 AND 320)),
	CONSTRAINT "audit_events_details_object_check" CHECK (jsonb_typeof("details") = 'object')
);

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "audit_export_jobs" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"start_event_id" uuid NOT NULL,
	"start_event_sequence" bigint NOT NULL,
	"high_water_sequence" bigint NOT NULL,
	"filters" jsonb NOT NULL,
	"row_limit" integer NOT NULL,
	"byte_limit" bigint NOT NULL,
	"preflight_row_count" integer NOT NULL,
	"preflight_byte_count" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" uuid,
	"lease_expires_at" timestamp with time zone,
	"artifact_key" text,
	"artifact_row_count" integer,
	"artifact_byte_count" bigint,
	"handle_hash" text,
	"handle_expires_at" timestamp with time zone,
	"handle_consumed_at" timestamp with time zone,
	"completion_event_id" uuid,
	"failure_event_id" uuid,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	CONSTRAINT "audit_export_jobs_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "audit_export_jobs_status_check" CHECK ("status" IN ('pending', 'generating', 'ready', 'failed')),
	CONSTRAINT "audit_export_jobs_actor_kind_check" CHECK ("actor_kind" IN ('user', 'api_token')),
	CONSTRAINT "audit_export_jobs_budgets_check" CHECK ("row_limit" > 0 AND "byte_limit" > 0
          AND "preflight_row_count" >= 0 AND "preflight_byte_count" >= 0
          AND "attempt_count" >= 0
          AND "start_event_sequence" > 0
          AND "high_water_sequence" >= 0),
	CONSTRAINT "audit_export_jobs_filters_object_check" CHECK (jsonb_typeof("filters") = 'object'),
	CONSTRAINT "audit_export_jobs_handle_hash_format_check" CHECK ("handle_hash" IS NULL OR "handle_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "audit_export_jobs_ready_state_check" CHECK (("status" = 'ready') = (
            "handle_hash" IS NOT NULL
            AND "handle_expires_at" IS NOT NULL
            AND "artifact_key" IS NOT NULL
            AND "artifact_row_count" IS NOT NULL
            AND "artifact_byte_count" IS NOT NULL
            AND "completion_event_id" IS NOT NULL
            AND "ready_at" IS NOT NULL
          )),
	CONSTRAINT "audit_export_jobs_failed_state_check" CHECK (("status" = 'failed') = (
            "failed_at" IS NOT NULL AND "failure_event_id" IS NOT NULL
          )
          AND ("status" <> 'failed' OR "artifact_key" IS NULL)),
	CONSTRAINT "audit_export_jobs_consumed_check" CHECK ("handle_consumed_at" IS NULL OR "handle_hash" IS NOT NULL),
	CONSTRAINT "audit_export_jobs_lease_check" CHECK (("lease_owner" IS NULL) = ("lease_expires_at" IS NULL)),
	CONSTRAINT "audit_export_jobs_terminal_state_check" CHECK ("status" IN ('pending', 'generating')
          OR ("lease_owner" IS NULL AND "lease_expires_at" IS NULL)),
	CONSTRAINT "audit_export_jobs_identifier_lengths_check" CHECK (char_length("team_id") BETWEEN 1 AND 255
          AND char_length("actor_id") BETWEEN 1 AND 255
          AND ("artifact_key" IS NULL OR char_length("artifact_key") BETWEEN 1 AND 1024)
          AND ("last_error" IS NULL OR char_length("last_error") <= 1000))
);

ALTER TABLE "audit_export_jobs" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "audit_alert_outbox" (
	"id" uuid PRIMARY KEY,
	"team_id" text NOT NULL,
	"audit_event_id" uuid NOT NULL,
	"audit_event_sequence" bigint NOT NULL,
	"event_type" text NOT NULL,
	"event_version" smallint NOT NULL,
	"alert_policy_key" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" uuid,
	"lease_expires_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"suppressed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_alert_outbox_sequence_check" CHECK ("audit_event_sequence" > 0 AND "event_version" > 0
          AND "attempt_count" >= 0),
	CONSTRAINT "audit_alert_outbox_lengths_check" CHECK (char_length("team_id") BETWEEN 1 AND 255
          AND char_length("event_type") BETWEEN 1 AND 128
          AND char_length("alert_policy_key") BETWEEN 1 AND 128
          AND ("last_error" IS NULL OR char_length("last_error") <= 1000)),
	CONSTRAINT "audit_alert_outbox_lease_check" CHECK (("lease_owner" IS NULL) = ("lease_expires_at" IS NULL)),
	CONSTRAINT "audit_alert_outbox_terminal_state_check" CHECK (num_nonnulls("delivered_at", "failed_at", "suppressed_at") <= 1
          AND (
            num_nonnulls("delivered_at", "failed_at", "suppressed_at") = 0
            OR ("lease_owner" IS NULL AND "lease_expires_at" IS NULL)
          ))
);

ALTER TABLE "audit_alert_outbox" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "team_invitation_deliveries" (
	"id" uuid PRIMARY KEY,
	"invitation_id" text NOT NULL,
	"team_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"team_label" text NOT NULL,
	"inviter_label" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" uuid,
	"lease_expires_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"suppressed_at" timestamp with time zone,
	"uncertain_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_invitation_deliveries_attempt_count_check" CHECK ("attempt_count" >= 0),
	CONSTRAINT "team_invitation_deliveries_role_check" CHECK ("role" IN ('owner', 'admin', 'member')),
	CONSTRAINT "team_invitation_deliveries_payload_lengths_check" CHECK (char_length("team_id") BETWEEN 1 AND 255
          AND char_length("email") BETWEEN 1 AND 320
          AND char_length("team_label") BETWEEN 1 AND 320
          AND char_length("inviter_label") BETWEEN 1 AND 320),
	CONSTRAINT "team_invitation_deliveries_lease_check" CHECK (("lease_owner" IS NULL) = ("lease_expires_at" IS NULL)),
	CONSTRAINT "team_invitation_deliveries_terminal_state_check" CHECK (num_nonnulls("sent_at", "failed_at", "suppressed_at", "uncertain_at") <= 1
          AND (
            num_nonnulls("sent_at", "failed_at", "suppressed_at", "uncertain_at") = 0
            OR ("lease_owner" IS NULL AND "lease_expires_at" IS NULL)
          ))
);

ALTER TABLE "team_invitation_deliveries" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "schemaFingerprint" (
	"id" boolean PRIMARY KEY DEFAULT true,
	"fingerprint" text NOT NULL,
	"appliedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schemaFingerprint_id_check" CHECK ("id")
);

CREATE INDEX "session_userId_idx" ON "session" ("userId");
CREATE UNIQUE INDEX "account_issuer_accountId_idx" ON "account" ("issuer","accountId");
CREATE INDEX "account_userId_idx" ON "account" ("userId");
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");
CREATE UNIQUE INDEX "team_members_team_id_user_id_idx" ON "team_members" ("team_id","user_id");
CREATE INDEX "team_members_user_id_team_id_idx" ON "team_members" ("user_id","team_id");
CREATE UNIQUE INDEX "team_invitations_id_team_id_idx" ON "team_invitations" ("id","team_id");
CREATE INDEX "team_invitations_team_id_idx" ON "team_invitations" ("team_id");
CREATE INDEX "team_invitations_email_idx" ON "team_invitations" ("email");
CREATE INDEX "drafts_team_id_idx" ON "drafts" ("team_id");
CREATE INDEX "manifests_team_id_idx" ON "manifests" ("team_id");
CREATE INDEX "protocols_team_id_idx" ON "protocols" ("team_id");
CREATE INDEX "version_sections_team_id_section_hash_idx" ON "version_sections" ("team_id","section_hash");
CREATE INDEX "assets_team_id_unreferenced_at_idx" ON "assets" ("team_id","unreferenced_at") WHERE unreferenced_at is not null;
CREATE INDEX "assets_team_id_media_class_idx" ON "assets" ("team_id","media_class");
CREATE INDEX "asset_references_team_id_referrer_idx" ON "asset_references" ("team_id","referrer_kind","referrer_id");
CREATE INDEX "studies_team_id_created_at_id_idx" ON "studies" ("team_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
CREATE INDEX "studies_purge_after_idx" ON "studies" ("purge_after") WHERE "deletion_requested_at" IS NOT NULL;
CREATE INDEX "study_waves_team_id_study_id_wave_number_idx" ON "study_waves" ("team_id","study_id","wave_number");
CREATE INDEX "participants_team_id_study_id_created_at_id_idx" ON "participants" ("team_id","study_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
CREATE INDEX "participants_team_id_study_id_email_index_idx" ON "participants" ("team_id","study_id","email_index") WHERE "email_index" IS NOT NULL;
CREATE INDEX "participants_team_id_study_id_phone_index_idx" ON "participants" ("team_id","study_id","phone_index") WHERE "phone_index" IS NOT NULL;
CREATE INDEX "interview_sessions_team_id_wave_id_status_idx" ON "interview_sessions" ("team_id","wave_id","status");
CREATE INDEX "interview_sessions_team_id_participant_id_wave_id_idx" ON "interview_sessions" ("team_id","participant_id","wave_id") WHERE "participant_id" IS NOT NULL;
CREATE UNIQUE INDEX "interview_sessions_wave_id_participant_id_idx" ON "interview_sessions" ("wave_id","participant_id") WHERE "participant_id" IS NOT NULL;
CREATE INDEX "interview_sessions_abandonment_scan_idx" ON "interview_sessions" ("last_activity_at") WHERE "status" = 'in_progress';
CREATE UNIQUE INDEX "interview_links_team_id_token_hash_idx" ON "interview_links" ("team_id","token_hash");
CREATE INDEX "interview_links_team_id_wave_id_participant_id_idx" ON "interview_links" ("team_id","wave_id","participant_id");
CREATE UNIQUE INDEX "interview_links_live_participant_idx" ON "interview_links" ("wave_id","participant_id") WHERE "kind" = 'participant' AND "revoked_at" IS NULL;
CREATE INDEX "session_snapshots_team_id_study_id_idx" ON "session_snapshots" ("team_id","study_id");
CREATE INDEX "nodes_team_id_session_id_idx" ON "nodes" ("team_id","session_id");
CREATE INDEX "nodes_team_id_session_id_type_idx" ON "nodes" ("team_id","session_id","type");
CREATE INDEX "edges_team_id_session_id_type_idx" ON "edges" ("team_id","session_id","type");
CREATE INDEX "edges_team_id_session_id_endpoints_idx" ON "edges" ("team_id","session_id","from_node","to_node");
CREATE INDEX "session_stats_team_id_study_id_wave_number_idx" ON "session_stats" ("team_id","study_id","wave_number");
CREATE INDEX "session_stats_team_id_study_id_participant_id_wave_number_idx" ON "session_stats" ("team_id","study_id","participant_id","wave_number");
CREATE INDEX "session_degree_hist_team_id_session_id_idx" ON "session_degree_hist" ("team_id","session_id");
CREATE INDEX "study_role_grants_team_id_user_id_idx" ON "study_role_grants" ("team_id","user_id");
CREATE INDEX "study_role_grants_team_id_study_id_idx" ON "study_role_grants" ("team_id","study_id");
CREATE INDEX "consent_documents_team_id_study_id_idx" ON "consent_documents" ("team_id","study_id");
CREATE INDEX "consent_items_team_id_consent_document_id_idx" ON "consent_items" ("team_id","consent_document_id");
CREATE INDEX "participant_consents_team_id_study_id_participant_id_idx" ON "participant_consents" ("team_id","study_id","participant_id");
CREATE INDEX "participant_consents_team_id_withdrawn_at_idx" ON "participant_consents" ("team_id","withdrawn_at") WHERE withdrawn_at is not null;
CREATE INDEX "participant_consent_item_responses_team_id_item_key_idx" ON "participant_consent_item_responses" ("team_id","item_key");
CREATE INDEX "study_schedules_team_id_study_id_idx" ON "study_schedules" ("team_id","study_id");
CREATE INDEX "schedule_occurrences_due_idx" ON "schedule_occurrences" ("scheduled_for") WHERE state = 'scheduled';
CREATE INDEX "schedule_occurrences_team_id_participant_id_scheduled_for_idx" ON "schedule_occurrences" ("team_id","participant_id","scheduled_for");
CREATE INDEX "message_templates_team_id_kind_channel_idx" ON "message_templates" ("team_id","kind","channel");
CREATE UNIQUE INDEX "message_deliveries_occurrence_id_channel_idx" ON "message_deliveries" ("occurrence_id","channel") WHERE occurrence_id is not null;
CREATE INDEX "message_deliveries_dispatch_idx" ON "message_deliveries" ("available_at","lease_expires_at") WHERE sent_at IS NULL AND failed_at IS NULL AND suppressed_at IS NULL AND uncertain_at IS NULL;
CREATE INDEX "message_deliveries_team_id_study_id_created_at_idx" ON "message_deliveries" ("team_id","study_id","created_at" DESC NULLS LAST);
CREATE INDEX "message_deliveries_team_id_recipient_blind_index_idx" ON "message_deliveries" ("team_id","recipient_blind_index");
CREATE INDEX "message_delivery_events_team_id_kind_occurred_at_idx" ON "message_delivery_events" ("team_id","kind","occurred_at" DESC NULLS LAST);
CREATE UNIQUE INDEX "api_tokens_token_hash_idx" ON "api_tokens" ("token_hash");
CREATE UNIQUE INDEX "api_tokens_token_prefix_idx" ON "api_tokens" ("token_prefix");
CREATE INDEX "api_tokens_team_id_created_at_idx" ON "api_tokens" ("team_id","created_at" DESC NULLS LAST);
CREATE INDEX "api_tokens_team_id_custodian_user_id_idx" ON "api_tokens" ("team_id","custodian_user_id");
CREATE INDEX "templates_team_id_kind_idx" ON "templates" ("team_id","kind");
CREATE INDEX "templates_team_id_curated_idx" ON "templates" ("team_id","curated") WHERE curated;
CREATE INDEX "template_version_sections_team_id_section_hash_idx" ON "template_version_sections" ("team_id","section_hash");
CREATE INDEX "webhook_subscriptions_team_id_state_idx" ON "webhook_subscriptions" ("team_id","state");
CREATE INDEX "webhook_deliveries_dispatch_idx" ON "webhook_deliveries" ("available_at","lease_expires_at") WHERE delivered_at IS NULL AND failed_at IS NULL;
CREATE INDEX "webhook_deliveries_team_id_created_at_idx" ON "webhook_deliveries" ("team_id","created_at" DESC NULLS LAST);
CREATE INDEX "experiment_exposures_team_id_experiment_id_occurred_at_idx" ON "experiment_exposures" ("team_id","experiment_id","occurred_at" DESC NULLS LAST);
CREATE INDEX "feedback_reports_team_id_state_created_at_idx" ON "feedback_reports" ("team_id","state","created_at" DESC NULLS LAST);
CREATE INDEX "study_wave_rollups_stale_at_idx" ON "study_wave_rollups" ("stale_at") WHERE stale_at is not null;
CREATE INDEX "study_stage_rollups_stale_at_idx" ON "study_stage_rollups" ("stale_at") WHERE stale_at is not null;
CREATE UNIQUE INDEX "audit_events_team_id_sequence_idx" ON "audit_events" ("team_id","sequence");
CREATE INDEX "audit_events_team_id_occurred_at_sequence_desc_idx" ON "audit_events" ("team_id","occurred_at" DESC NULLS LAST,"sequence" DESC NULLS LAST);
CREATE INDEX "audit_events_team_id_event_type_sequence_desc_idx" ON "audit_events" ("team_id","event_type","sequence" DESC NULLS LAST);
CREATE INDEX "audit_events_team_id_actor_id_sequence_desc_idx" ON "audit_events" ("team_id","actor_id","sequence" DESC NULLS LAST);
CREATE INDEX "audit_export_jobs_team_id_actor_id_created_at_idx" ON "audit_export_jobs" ("team_id","actor_id","created_at" DESC NULLS LAST);
CREATE INDEX "audit_export_jobs_dispatch_idx" ON "audit_export_jobs" ("available_at","lease_expires_at") WHERE status IN ('pending', 'generating');
CREATE UNIQUE INDEX "audit_export_jobs_handle_hash_idx" ON "audit_export_jobs" ("handle_hash") WHERE handle_hash IS NOT NULL;
CREATE UNIQUE INDEX "audit_alert_outbox_audit_event_id_idx" ON "audit_alert_outbox" ("audit_event_id");
CREATE INDEX "audit_alert_outbox_dispatch_idx" ON "audit_alert_outbox" ("available_at","lease_expires_at") WHERE delivered_at IS NULL AND failed_at IS NULL AND suppressed_at IS NULL;
CREATE INDEX "audit_alert_outbox_team_id_event_type_created_at_idx" ON "audit_alert_outbox" ("team_id","event_type","created_at" DESC NULLS LAST);
CREATE UNIQUE INDEX "team_invitation_deliveries_invitation_id_idx" ON "team_invitation_deliveries" ("invitation_id");
CREATE INDEX "team_invitation_deliveries_dispatch_idx" ON "team_invitation_deliveries" ("available_at","lease_expires_at");
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_inviter_id_user_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "user"("id") ON DELETE CASCADE;
ALTER TABLE "manifests" ADD CONSTRAINT "manifests_draft_id_team_id_drafts_id_team_id_fkey" FOREIGN KEY ("draft_id","team_id") REFERENCES "drafts"("id","team_id");
ALTER TABLE "leases" ADD CONSTRAINT "leases_draft_id_team_id_drafts_id_team_id_fkey" FOREIGN KEY ("draft_id","team_id") REFERENCES "drafts"("id","team_id");
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id");
ALTER TABLE "protocol_versions" ADD CONSTRAINT "protocol_versions_protocol_id_team_id_protocols_id_team_id_fkey" FOREIGN KEY ("protocol_id","team_id") REFERENCES "protocols"("id","team_id");
ALTER TABLE "protocol_versions" ADD CONSTRAINT "protocol_versions_XRsnxTZUrzZD_fkey" FOREIGN KEY ("migrated_from_version_id","team_id") REFERENCES "protocol_versions"("id","team_id");
ALTER TABLE "version_sections" ADD CONSTRAINT "version_sections_O2r4ZNMMEfNX_fkey" FOREIGN KEY ("version_id","team_id") REFERENCES "protocol_versions"("id","team_id");
ALTER TABLE "version_sections" ADD CONSTRAINT "version_sections_RkZ8Hlggk4EY_fkey" FOREIGN KEY ("team_id","section_hash") REFERENCES "sections"("team_id","hash");
ALTER TABLE "protocol_drafts" ADD CONSTRAINT "protocol_drafts_draft_id_team_id_drafts_id_team_id_fkey" FOREIGN KEY ("draft_id","team_id") REFERENCES "drafts"("id","team_id");
ALTER TABLE "protocol_drafts" ADD CONSTRAINT "protocol_drafts_protocol_id_team_id_protocols_id_team_id_fkey" FOREIGN KEY ("protocol_id","team_id") REFERENCES "protocols"("id","team_id");
ALTER TABLE "protocol_drafts" ADD CONSTRAINT "protocol_drafts_nYt8OrU8gkdJ_fkey" FOREIGN KEY ("based_on_version_id","team_id") REFERENCES "protocol_versions"("id","team_id");
ALTER TABLE "asset_references" ADD CONSTRAINT "asset_references_asset_fk" FOREIGN KEY ("team_id","asset_hash") REFERENCES "assets"("team_id","hash");
ALTER TABLE "studies" ADD CONSTRAINT "studies_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id");
ALTER TABLE "studies" ADD CONSTRAINT "studies_protocol_id_team_id_protocols_id_team_id_fkey" FOREIGN KEY ("protocol_id","team_id") REFERENCES "protocols"("id","team_id");
ALTER TABLE "study_waves" ADD CONSTRAINT "study_waves_study_id_team_id_studies_id_team_id_fkey" FOREIGN KEY ("study_id","team_id") REFERENCES "studies"("id","team_id");
ALTER TABLE "study_waves" ADD CONSTRAINT "study_waves_SXFV2TvAvKov_fkey" FOREIGN KEY ("protocol_version_id","team_id") REFERENCES "protocol_versions"("id","team_id");
ALTER TABLE "participants" ADD CONSTRAINT "participants_study_id_team_id_studies_id_team_id_fkey" FOREIGN KEY ("study_id","team_id") REFERENCES "studies"("id","team_id");
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_ZM4y2xFChBva_fkey" FOREIGN KEY ("wave_id","study_id","team_id") REFERENCES "study_waves"("id","study_id","team_id");
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_psuYz1RBGiRK_fkey" FOREIGN KEY ("participant_id","study_id","team_id") REFERENCES "participants"("id","study_id","team_id");
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_1LHzis0L1wuQ_fkey" FOREIGN KEY ("protocol_version_id","team_id") REFERENCES "protocol_versions"("id","team_id");
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_3GoiphtNFYDs_fkey" FOREIGN KEY ("link_id","team_id") REFERENCES "interview_links"("id","team_id");
ALTER TABLE "interview_links" ADD CONSTRAINT "interview_links_jKVVrfcHhDL8_fkey" FOREIGN KEY ("wave_id","study_id","team_id") REFERENCES "study_waves"("id","study_id","team_id");
ALTER TABLE "interview_links" ADD CONSTRAINT "interview_links_tjP2msCHSiVY_fkey" FOREIGN KEY ("participant_id","study_id","team_id") REFERENCES "participants"("id","study_id","team_id");
ALTER TABLE "session_snapshots" ADD CONSTRAINT "session_snapshots_yRsXorJcyo1j_fkey" FOREIGN KEY ("session_id","study_id","team_id") REFERENCES "interview_sessions"("id","study_id","team_id");
ALTER TABLE "session_snapshots" ADD CONSTRAINT "session_snapshots_7IsXMqLTceZB_fkey" FOREIGN KEY ("protocol_version_id","team_id") REFERENCES "protocol_versions"("id","team_id");
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_session_id_team_id_interview_sessions_id_team_id_fkey" FOREIGN KEY ("session_id","team_id") REFERENCES "interview_sessions"("id","team_id");
ALTER TABLE "edges" ADD CONSTRAINT "edges_session_id_team_id_interview_sessions_id_team_id_fkey" FOREIGN KEY ("session_id","team_id") REFERENCES "interview_sessions"("id","team_id");
ALTER TABLE "edges" ADD CONSTRAINT "edges_session_id_from_node_nodes_session_id_node_id_fkey" FOREIGN KEY ("session_id","from_node") REFERENCES "nodes"("session_id","node_id");
ALTER TABLE "edges" ADD CONSTRAINT "edges_session_id_to_node_nodes_session_id_node_id_fkey" FOREIGN KEY ("session_id","to_node") REFERENCES "nodes"("session_id","node_id");
ALTER TABLE "session_stats" ADD CONSTRAINT "session_stats_KR0ANZzRZcL3_fkey" FOREIGN KEY ("session_id","study_id","team_id") REFERENCES "interview_sessions"("id","study_id","team_id");
ALTER TABLE "session_stats" ADD CONSTRAINT "session_stats_BBRbfBk1WGgv_fkey" FOREIGN KEY ("wave_id","study_id","team_id") REFERENCES "study_waves"("id","study_id","team_id");
ALTER TABLE "session_stats" ADD CONSTRAINT "session_stats_ge210MYSasZB_fkey" FOREIGN KEY ("participant_id","study_id","team_id") REFERENCES "participants"("id","study_id","team_id");
ALTER TABLE "session_degree_hist" ADD CONSTRAINT "session_degree_hist_YZEx9b5yigap_fkey" FOREIGN KEY ("session_id","team_id") REFERENCES "interview_sessions"("id","team_id");
ALTER TABLE "study_role_grants" ADD CONSTRAINT "study_role_grants_study_fk" FOREIGN KEY ("study_id","team_id") REFERENCES "studies"("id","team_id");
ALTER TABLE "consent_documents" ADD CONSTRAINT "consent_documents_study_fk" FOREIGN KEY ("study_id","team_id") REFERENCES "studies"("id","team_id");
ALTER TABLE "consent_items" ADD CONSTRAINT "consent_items_document_fk" FOREIGN KEY ("consent_document_id","team_id") REFERENCES "consent_documents"("id","team_id");
ALTER TABLE "participant_consents" ADD CONSTRAINT "participant_consents_participant_fk" FOREIGN KEY ("participant_id","study_id","team_id") REFERENCES "participants"("id","study_id","team_id");
ALTER TABLE "participant_consents" ADD CONSTRAINT "participant_consents_document_fk" FOREIGN KEY ("consent_document_id","study_id","team_id") REFERENCES "consent_documents"("id","study_id","team_id");
ALTER TABLE "participant_consents" ADD CONSTRAINT "participant_consents_session_fk" FOREIGN KEY ("session_id","study_id","team_id") REFERENCES "interview_sessions"("id","study_id","team_id");
ALTER TABLE "participant_consent_item_responses" ADD CONSTRAINT "participant_consent_item_responses_consent_fk" FOREIGN KEY ("participant_consent_id","consent_document_id","team_id") REFERENCES "participant_consents"("id","consent_document_id","team_id");
ALTER TABLE "participant_consent_item_responses" ADD CONSTRAINT "participant_consent_item_responses_item_fk" FOREIGN KEY ("consent_item_id","consent_document_id","item_key","team_id") REFERENCES "consent_items"("id","consent_document_id","key","team_id");
ALTER TABLE "study_schedules" ADD CONSTRAINT "study_schedules_study_fk" FOREIGN KEY ("study_id","team_id") REFERENCES "studies"("id","team_id");
ALTER TABLE "study_schedules" ADD CONSTRAINT "study_schedules_wave_fk" FOREIGN KEY ("wave_id","study_id","team_id") REFERENCES "study_waves"("id","study_id","team_id");
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_schedule_fk" FOREIGN KEY ("schedule_id","study_id","team_id") REFERENCES "study_schedules"("id","study_id","team_id");
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_participant_fk" FOREIGN KEY ("participant_id","study_id","team_id") REFERENCES "participants"("id","study_id","team_id");
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_study_fk" FOREIGN KEY ("study_id","team_id") REFERENCES "studies"("id","team_id");
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_participant_fk" FOREIGN KEY ("participant_id","study_id","team_id") REFERENCES "participants"("id","study_id","team_id");
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_occurrence_fk" FOREIGN KEY ("occurrence_id","participant_id","study_id","team_id") REFERENCES "schedule_occurrences"("id","participant_id","study_id","team_id");
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_template_fk" FOREIGN KEY ("template_id","team_id") REFERENCES "message_templates"("id","team_id");
ALTER TABLE "message_delivery_events" ADD CONSTRAINT "message_delivery_events_delivery_fk" FOREIGN KEY ("delivery_id","team_id") REFERENCES "message_deliveries"("id","team_id");
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_study_fk" FOREIGN KEY ("study_id","team_id") REFERENCES "studies"("id","team_id");
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_fk" FOREIGN KEY ("template_id","team_id") REFERENCES "templates"("id","team_id");
ALTER TABLE "template_version_sections" ADD CONSTRAINT "template_version_sections_version_fk" FOREIGN KEY ("version_id","team_id") REFERENCES "template_versions"("id","team_id");
ALTER TABLE "template_version_sections" ADD CONSTRAINT "template_version_sections_section_fk" FOREIGN KEY ("team_id","section_hash") REFERENCES "sections"("team_id","hash");
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_study_fk" FOREIGN KEY ("study_id","team_id") REFERENCES "studies"("id","team_id");
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_subscription_fk" FOREIGN KEY ("subscription_id","team_id") REFERENCES "webhook_subscriptions"("id","team_id");
ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_experiment_fk" FOREIGN KEY ("experiment_id","team_id") REFERENCES "experiments"("id","team_id");
ALTER TABLE "experiment_exposures" ADD CONSTRAINT "experiment_exposures_assignment_fk" FOREIGN KEY ("assignment_id","experiment_id","variant_key","team_id") REFERENCES "experiment_assignments"("id","experiment_id","variant_key","team_id");
ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_study_fk" FOREIGN KEY ("study_id","team_id") REFERENCES "studies"("id","team_id");
ALTER TABLE "study_wave_rollups" ADD CONSTRAINT "study_wave_rollups_wave_fk" FOREIGN KEY ("wave_id","study_id","team_id") REFERENCES "study_waves"("id","study_id","team_id");
ALTER TABLE "study_stage_rollups" ADD CONSTRAINT "study_stage_rollups_wave_fk" FOREIGN KEY ("wave_id","study_id","team_id") REFERENCES "study_waves"("id","study_id","team_id");
ALTER TABLE "audit_alert_outbox" ADD CONSTRAINT "audit_alert_outbox_audit_event_fk" FOREIGN KEY ("audit_event_id","team_id","audit_event_sequence","event_type","event_version") REFERENCES "audit_events"("id","team_id","sequence","event_type","event_version");
ALTER TABLE "team_invitation_deliveries" ADD CONSTRAINT "team_invitation_deliveries_invitation_team_fk" FOREIGN KEY ("invitation_id","team_id") REFERENCES "team_invitations"("id","team_id") ON DELETE CASCADE;
CREATE POLICY "team_isolation" ON "drafts" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "sections" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "manifests" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "leases" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "command_log" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "protocols" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "protocol_versions" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "version_sections" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "protocol_drafts" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "assets" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "asset_references" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "studies" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "study_waves" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "participants" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "interview_sessions" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "interview_links" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "session_snapshots" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "nodes" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "edges" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "session_stats" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "session_degree_hist" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "study_role_grants" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "consent_documents" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "consent_items" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "participant_consents" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "participant_consent_item_responses" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "study_schedules" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "schedule_occurrences" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "message_templates" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "message_deliveries" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "message_delivery_events" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "participant_contact_optouts" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "api_tokens" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "templates" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "template_versions" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "template_version_sections" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "webhook_subscriptions" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "webhook_deliveries" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "experiments" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "experiment_assignments" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "experiment_exposures" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "feedback_reports" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "study_wave_rollups" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "study_stage_rollups" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "audit_team_isolation" ON "audit_events" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '')) WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), ''));
CREATE POLICY "team_isolation" ON "audit_export_jobs" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "audit_alert_outbox" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
CREATE POLICY "team_isolation" ON "team_invitation_deliveries" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');
