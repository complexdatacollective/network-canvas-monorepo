export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS protocols (
  id TEXT PRIMARY KEY,
  hash TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  schemaVersion INTEGER NOT NULL,
  lastModified TEXT,
  importedAt TEXT NOT NULL,
  description TEXT,
  protocol_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_protocols_hash ON protocols(hash);
CREATE INDEX IF NOT EXISTS idx_protocols_importedAt ON protocols(importedAt);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  protocolHash TEXT NOT NULL,
  protocolName TEXT NOT NULL,
  caseId TEXT NOT NULL,
  startedAt TEXT NOT NULL,
  lastUpdatedAt TEXT NOT NULL,
  finishedAt TEXT,
  exportedAt TEXT,
  currentStep INTEGER NOT NULL DEFAULT 0,
  network_json TEXT NOT NULL,
  stageMetadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_protocolHash ON sessions(protocolHash);
CREATE INDEX IF NOT EXISTS idx_sessions_lastUpdatedAt ON sessions(lastUpdatedAt);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  protocolHash TEXT NOT NULL,
  assetId TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  kind TEXT NOT NULL,
  mimeType TEXT,
  blob_data BLOB,
  text_data TEXT
);
CREATE INDEX IF NOT EXISTS idx_assets_protocolHash ON assets(protocolHash);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  settings_json TEXT NOT NULL
);
`;
