// On the Studio server's boot path, which hashes this SQL into the database
// fingerprint: whitespace counts, and nothing but the string belongs here
// because whatever this module imports ships in the server's production bundle.
export const SCHEMA_SQL = `
CREATE TABLE drafts (
  id uuid PRIMARY KEY,
  head_seq bigint NOT NULL DEFAULT 0,
  head_manifest_hash text NOT NULL
);

-- Immutable content-addressed section documents.
CREATE TABLE sections (
  hash text PRIMARY KEY,
  doc jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  unreferenced_at timestamptz
);

CREATE OR REPLACE FUNCTION sections_are_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'section documents are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER sections_immutable
  BEFORE UPDATE ON sections
  FOR EACH ROW
  WHEN (NEW.hash IS DISTINCT FROM OLD.hash OR NEW.doc IS DISTINCT FROM OLD.doc)
  EXECUTE FUNCTION sections_are_immutable();

-- Manifests: ordered map of section id -> section hash, one row per commit.
-- seq is the per-draft monotonic order; hash identifies (#1247: "hashes
-- identify, sequences order").
CREATE TABLE manifests (
  draft_id uuid NOT NULL REFERENCES drafts (id),
  seq bigint NOT NULL,
  hash text NOT NULL,
  parent_hash text,
  section_hashes jsonb NOT NULL,
  PRIMARY KEY (draft_id, seq)
);

-- Lease table: owner is a connection/tab-scoped session id, never a user id.
-- The draft reference is a real constraint: a lease for a draft that does not
-- exist can only ever be dead weight.
CREATE TABLE leases (
  draft_id uuid NOT NULL REFERENCES drafts (id),
  section_id text NOT NULL,
  owner text NOT NULL,
  epoch bigint NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (draft_id, section_id)
);

-- Command log: unique constraint delivers write-path idempotency. created_at
-- bounds GC, which may prune a row only once retransmission is impossible.
CREATE TABLE command_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  draft_id uuid NOT NULL,
  section_id text NOT NULL,
  owner text NOT NULL,
  epoch bigint NOT NULL,
  client_seq bigint NOT NULL,
  commands jsonb NOT NULL,
  manifest_seq bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (draft_id, section_id, owner, epoch, client_seq)
);
`;
