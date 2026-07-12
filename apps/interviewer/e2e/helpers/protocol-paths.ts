import path from 'node:path';

// Single source of truth for the lean e2e fixture, resolved relative to this
// file so it is independent of the caller's working directory.
export const LEAN_E2E_PROTOCOL_PATH = path.resolve(
  import.meta.dirname,
  '../../../../packages/protocols/e2e/interviewer-e2e/interviewer-e2e.netcanvas',
);

export const LEAN_E2E_PROTOCOL_NAME = 'E2E Fixture';
