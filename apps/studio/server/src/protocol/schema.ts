// Whitespace counts: src/db/schema.ts hashes this string as part of the
// database fingerprint, so reformatting it reads as a schema change and demands
// that every Studio database be recreated.
//
// The functions and triggers are CREATE OR REPLACE because DROP TABLE CASCADE
// leaves functions behind, and an `already exists` error thrown from applySchema
// reads as transient to the boot retry loop — which would spin forever instead
// of reporting a stale database.
export const PROTOCOL_STORE_SCHEMA_SQL = `
CREATE TABLE protocols (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE protocol_versions (
  id uuid PRIMARY KEY,
  protocol_id uuid NOT NULL REFERENCES protocols (id),
  version_number int NOT NULL,
  label text,
  version_hash text NOT NULL,
  manifest jsonb NOT NULL,
  schema_version int NOT NULL,
  -- No FK: draft rows are discardable.
  source_draft_id uuid,
  source_manifest_hash text NOT NULL,
  migrated_from_version_id uuid REFERENCES protocol_versions (id),
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (protocol_id, version_number),
  UNIQUE (protocol_id, version_hash)
);

-- The GC pin set: the FK into sections makes sweeping a pinned section
-- structurally impossible.
CREATE TABLE version_sections (
  version_id uuid NOT NULL REFERENCES protocol_versions (id),
  section_id text NOT NULL,
  section_hash text NOT NULL REFERENCES sections (hash),
  PRIMARY KEY (version_id, section_id)
);

CREATE TABLE protocol_drafts (
  draft_id uuid PRIMARY KEY REFERENCES drafts (id),
  protocol_id uuid NOT NULL REFERENCES protocols (id),
  based_on_version_id uuid REFERENCES protocol_versions (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION protocol_versions_are_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'published protocol versions are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER protocol_versions_immutable
  BEFORE UPDATE OR DELETE ON protocol_versions
  FOR EACH ROW EXECUTE FUNCTION protocol_versions_are_immutable();

CREATE OR REPLACE TRIGGER version_sections_immutable
  BEFORE UPDATE OR DELETE ON version_sections
  FOR EACH ROW EXECUTE FUNCTION protocol_versions_are_immutable();

-- Inserting a pin after publication would change what the version assembles to
-- while its frozen manifest and hash stayed unchanged.
CREATE OR REPLACE FUNCTION version_sections_pins_are_frozen() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM protocol_versions v
    WHERE v.id = NEW.version_id
      AND v.xmin = pg_current_xact_id()::xid
  ) THEN
    RAISE EXCEPTION 'published protocol versions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER version_sections_insert_frozen
  BEFORE INSERT ON version_sections
  FOR EACH ROW EXECUTE FUNCTION version_sections_pins_are_frozen();
`;
