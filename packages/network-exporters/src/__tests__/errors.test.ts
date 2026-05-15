import { describe, expect, it } from 'vitest';

import {
  DatabaseError,
  describeExportError,
  ExportGenerationError,
  OutputError,
  ProtocolNotFoundError,
  SessionProcessingError,
} from '../errors';

describe('describeExportError', () => {
  it('detects ENOSPC from a NodeJS.ErrnoException via OutputError', () => {
    const cause = Object.assign(new Error('write failed'), { code: 'ENOSPC' });
    const err = new OutputError({ cause });
    expect(describeExportError(err, 'outputting')).toMatch(/disk space/i);
  });

  it('detects out-of-memory errors via cause inspection', () => {
    const cause = new Error('JavaScript heap out of memory');
    const err = new OutputError({ cause });
    expect(describeExportError(err, 'outputting')).toMatch(/memory/i);
  });

  it('returns a tag-aware fallback when the cause is unrecognised', () => {
    const err = new DatabaseError({ cause: new Error('???') });
    expect(describeExportError(err, 'fetching interviews')).toMatch(
      /database connection failed.*fetching interviews/i,
    );
  });

  it('describes per-file ExportGenerationError with file context', () => {
    const err = new ExportGenerationError({
      cause: new Error('bad codebook'),
      format: 'attributeList',
      sessionId: 'session-A',
      partitionEntity: 'person',
    });
    const message = describeExportError(err);
    expect(message).toContain('attributeList');
    expect(message).toContain('person');
    expect(message).toContain('session-A');
  });

  it('describes ProtocolNotFoundError with hash and session id', () => {
    const err = new ProtocolNotFoundError({ hash: 'h1', sessionId: 's1' });
    expect(describeExportError(err)).toMatch(/protocol h1.*not found.*s1/i);
  });

  it('describes SessionProcessingError with stage and session id', () => {
    const err = new SessionProcessingError({
      cause: new Error('ego missing'),
      stage: 'insertEgo',
      sessionId: 's2',
    });
    expect(describeExportError(err)).toMatch(
      /session s2.*insertEgo.*ego missing/i,
    );
  });
});
