import { describe, expect, it } from 'vitest';

import { APP_SCHEMA_VERSION } from '~/config';

import {
  LEGACY_LIBRARIES,
  PROTOCOL_DB_NAME,
  SESSION_PREFIX,
  TAB_LOCK_CHANNEL,
} from '../storageNames';

describe('storage names', () => {
  // A schema bump must come with a new library name, or the next major would
  // open (and write to) this major's library.
  it('names the protocol library after the schema version this build edits', () => {
    expect(PROTOCOL_DB_NAME).toBe(`ArchitectProtocolDB-v${APP_SCHEMA_VERSION}`);
    expect(PROTOCOL_DB_NAME).toBe('ArchitectProtocolDB-v9');
  });

  it('keeps the session and tab-lock names apart from Architect 8', () => {
    expect(SESSION_PREFIX).toBe('@@remember-v9-');
    expect(SESSION_PREFIX).not.toBe('@@remember-');
    expect(TAB_LOCK_CHANNEL).toBe('architect-v9-protocol-lock');
    expect(TAB_LOCK_CHANNEL).not.toBe('architect-protocol-lock');
  });

  it('reads only Architect 8’s library, which keeps its historical name', () => {
    expect(LEGACY_LIBRARIES).toEqual([
      { schemaMajor: 8, dbName: 'ArchitectProtocolDB', basePath: '/v8/' },
    ]);
    for (const library of LEGACY_LIBRARIES) {
      expect(library.schemaMajor).toBeLessThan(APP_SCHEMA_VERSION);
      expect(library.dbName).not.toBe(PROTOCOL_DB_NAME);
    }
  });
});
