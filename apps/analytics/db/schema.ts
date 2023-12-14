// Postgres database schema

export interface Event {
  type: string;
  metadata: string;
  timestamp: string;
  installationid: string;
  isocode: string;
}

export interface Error {
  message: string;
  details: string;
  stacktrace: string;
  timestamp: string;
  installationid: string;
  path: string;
}
