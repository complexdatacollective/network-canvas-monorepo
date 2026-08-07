// Migration run "RLS done right" (#1246):
//   - roles: studio_owner owns the tables and runs DDL; studio_app is a
//     distinct non-owner login role with no BYPASSRLS
//   - every tenant table: ENABLE + FORCE ROW LEVEL SECURITY (FORCE so even
//     the owner is subject to policies)
//   - tenant context read via current_setting('app.workspace_id', true) —
//     missing context yields NULL, which fails the policy closed
import pg from 'pg';

const PORT = Number(process.env.PGPORT ?? 54318);

const admin = new pg.Client({
  host: '127.0.0.1',
  port: PORT,
  user: 'postgres',
  password: 'spike',
  database: 'postgres',
});
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS studio_spike WITH (FORCE)`);
await admin.query(
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'studio_owner') THEN
       CREATE ROLE studio_owner LOGIN PASSWORD 'spike';
     END IF;
     IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'studio_app') THEN
       CREATE ROLE studio_app LOGIN PASSWORD 'spike' NOBYPASSRLS;
     END IF;
   END $$`,
);
await admin.query(`CREATE DATABASE studio_spike OWNER studio_owner`);
await admin.end();

const owner = new pg.Client({
  host: '127.0.0.1',
  port: PORT,
  user: 'studio_owner',
  password: 'spike',
  database: 'studio_spike',
});
await owner.connect();

await owner.query(`
CREATE TABLE workspaces (
  id uuid PRIMARY KEY
);

CREATE TABLE studies (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces (id)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces (id),
  study_id uuid NOT NULL REFERENCES studies (id),
  wave int NOT NULL,
  participant_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE nodes (
  workspace_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  node_id uuid NOT NULL,
  type text NOT NULL,
  attributes jsonb NOT NULL,
  PRIMARY KEY (session_id, node_id)
);

CREATE TABLE edges (
  workspace_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  edge_id uuid NOT NULL,
  type text NOT NULL,
  from_node uuid NOT NULL,
  to_node uuid NOT NULL,
  attributes jsonb NOT NULL,
  PRIMARY KEY (session_id, edge_id)
);

-- Workspace-leading composite indexes (#1246 concrete shape).
CREATE INDEX sessions_ws_study_wave ON sessions (workspace_id, study_id, wave);
CREATE INDEX sessions_ws_participant ON sessions (workspace_id, participant_id, wave);
CREATE INDEX nodes_ws_session ON nodes (workspace_id, session_id);
CREATE INDEX edges_ws_session_type ON edges (workspace_id, session_id, type);
`);

for (const table of ['workspaces', 'studies', 'sessions', 'nodes', 'edges']) {
  // NULLIF guard: after a transaction-scoped set_config expires,
  // current_setting(..., true) returns the EMPTY STRING, not NULL — and
  // ''::uuid raises rather than failing closed to zero rows.
  const expr =
    table === 'workspaces'
      ? `id = NULLIF(current_setting('app.workspace_id', true), '')::uuid`
      : `workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid`;
  await owner.query(`
    ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON ${table}
      FOR ALL USING (${expr}) WITH CHECK (${expr});
    GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO studio_app;
  `);
}

await owner.end();
console.log('migrated: roles, schema, indexes, RLS (forced) in place');
