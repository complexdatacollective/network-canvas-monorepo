import { describe, expect, it } from 'vitest';

import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';

import { DB_NAME, LEGACY_LIBRARIES } from '../storageNames';

describe('storage names', () => {
  // A schema bump must come with a new database name, or the next major
  // would open (and write to) this major's database.
  it('names the database after the schema version this build runs', () => {
    expect(DB_NAME).toBe(`interviewer-v${COMPATIBLE_PROTOCOL_SCHEMA_VERSION}`);
    expect(DB_NAME).toBe('interviewer-v9');
  });

  it('reads only Interviewer 8’s database, which keeps its historical name', () => {
    expect(LEGACY_LIBRARIES).toEqual([
      { schemaMajor: 8, dbName: 'interviewer', basePath: '/v8/' },
    ]);
    for (const library of LEGACY_LIBRARIES) {
      expect(library.schemaMajor).toBeLessThan(
        COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
      );
      expect(library.dbName).not.toBe(DB_NAME);
    }
  });
});
