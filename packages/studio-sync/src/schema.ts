import pg from 'pg';

export const SCHEMA_SQL = `
CREATE TABLE drafts (
  id uuid PRIMARY KEY,
  head_seq bigint NOT NULL DEFAULT 0,
  head_manifest_hash text NOT NULL
);

-- Immutable content-addressed section documents (#1276). created_at is not
-- part of a section's identity — it is the write-liveness timestamp garbage
-- collection (#1276) reads: every section write refreshes it on conflict
-- (never DO NOTHING), so re-adopting an existing row both restarts the GC
-- grace window and takes a row lock that forces a concurrent GC DELETE to
-- re-check the refreshed timestamp before removing the row.
CREATE TABLE sections (
  hash text PRIMARY KEY,
  doc jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

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
-- bounds garbage collection (#1276): a row may be pruned only after the
-- client-retry horizon has passed AND its (owner, epoch) lease is no longer
-- live, because a retransmitted client_seq must keep finding its recorded
-- result for as long as retransmission is possible.
CREATE TABLE command_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  draft_id uuid NOT NULL,
  section_id text NOT NULL,
  owner text NOT NULL,
  epoch bigint NOT NULL,
  client_seq bigint NOT NULL,
  commands jsonb NOT NULL,
  manifest_seq bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (draft_id, section_id, owner, epoch, client_seq)
);
`;

export async function createSyncDatabase(port: number, name: string) {
  const admin = new pg.Client({
    host: '127.0.0.1',
    port,
    user: 'postgres',
    password: 'spike',
    database: 'postgres',
  });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const db = new pg.Pool({
    host: '127.0.0.1',
    port,
    user: 'postgres',
    password: 'spike',
    database: name,
    max: 20,
  });
  await db.query(SCHEMA_SQL);
  return db;
}
