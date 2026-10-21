import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION as BUNDLED_INTERVIEW_SCHEMA } from 'fresco-schema-8/interview/protocol-schema-version';
import { describe, expect, it } from 'vitest';

import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION as CURRENT_INTERVIEW_SCHEMA } from '@codaco/interview/protocol-schema-version';

import { interviewPath, LEGACY_SCHEMA_VERSION } from '../version';

/**
 * `fresco-schema-8` pins the newest `@codaco/interview` release that declares
 * schema 8. A pin moved to a release declaring any other schema would run
 * stored schema 8 protocols in an interview that cannot read them.
 */
describe('the bundled previous interview', () => {
  it('runs schema 8', () => {
    expect(BUNDLED_INTERVIEW_SCHEMA).toBe(8);
    expect(LEGACY_SCHEMA_VERSION).toBe(8);
  });

  it('is older than the interview Fresco runs for the current schema', () => {
    expect(CURRENT_INTERVIEW_SCHEMA).toBeGreaterThan(BUNDLED_INTERVIEW_SCHEMA);
  });

  it('is where a schema 8 interview is taken part in', () => {
    expect(interviewPath('abc', 8)).toBe('/v8/interview/abc');
    expect(interviewPath('abc', CURRENT_INTERVIEW_SCHEMA)).toBe(
      '/interview/abc',
    );
  });
});
