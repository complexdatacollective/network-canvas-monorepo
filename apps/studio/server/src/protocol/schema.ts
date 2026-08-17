// The protocol store's own tables (#1276), layered over @codaco/studio-sync's
// drafts/sections/manifests. House style follows the sync schema: snake_case
// unquoted identifiers, uuid primary keys, jsonb documents.
//
// Published versions are immutable by construction twice over: BEFORE
// UPDATE/DELETE triggers raise on the version tables, and version_sections'
// foreign key into sections makes garbage-collecting a pinned section
// structurally impossible.
//
// Whitespace counts: src/db/schema.ts hashes this string as part of the
// database fingerprint, so reformatting it reads as a schema change and
// demands that every Studio database be recreated.
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
  -- The frozen manifest, VERBATIM: as-fielded provenance that platform
  -- migrations never rewrite. Not parsed on hot paths; version_sections is
  -- the relational form.
  manifest jsonb NOT NULL,
  schema_version int NOT NULL,
  -- Provenance only — no FK: draft rows are discardable.
  source_draft_id uuid,
  source_manifest_hash text NOT NULL,
  migrated_from_version_id uuid REFERENCES protocol_versions (id),
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (protocol_id, version_number),
  UNIQUE (protocol_id, version_hash)
);

-- The GC pin set: sections referenced here can never be swept (FK), and the
-- rows themselves are as immutable as the version they belong to.
CREATE TABLE version_sections (
  version_id uuid NOT NULL REFERENCES protocol_versions (id),
  section_id text NOT NULL,
  section_hash text NOT NULL REFERENCES sections (hash),
  PRIMARY KEY (version_id, section_id)
);

-- Joins a sync draft to its protocol and records what it branched from.
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

-- Pins may only be written by the transaction that created the version row
-- itself (xmin equals the current transaction): inserting a pin later would
-- change what the version assembles to while its frozen manifest and hash
-- stay unchanged.
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
