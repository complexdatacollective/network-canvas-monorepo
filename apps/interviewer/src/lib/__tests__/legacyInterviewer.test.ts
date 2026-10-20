import { describe, expect, it } from 'vitest';

import {
  getBundledLegacyInterviewer,
  LEGACY_INTERVIEWER_MAJOR,
  legacyDataUrl,
  legacyImportUrl,
  legacyResumeUrl,
  legacyStartUrl,
} from '../legacyInterviewer';

const INTERVIEWER_8 = { version: '8.5.0', path: '/v8/' } as const;

describe('legacyInterviewer', () => {
  it('has no Interviewer 8 under test, as in dev and Storybook', () => {
    expect(getBundledLegacyInterviewer()).toBeNull();
  });

  it('is the schema 8 Interviewer', () => {
    expect(LEGACY_INTERVIEWER_MAJOR).toBe(8);
  });

  it('builds the hand-over addresses of the shared contract', () => {
    expect(legacyStartUrl(INTERVIEWER_8, 'abc123')).toBe('/v8/?start=abc123');
    expect(legacyResumeUrl(INTERVIEWER_8, 'session-1')).toBe(
      '/v8/interview/session-1',
    );
    expect(
      legacyImportUrl(INTERVIEWER_8, '5f0e1f8e-6c0e-4d2a-9a51-2f7d3c9e8a11'),
    ).toBe('/v8/?import=5f0e1f8e-6c0e-4d2a-9a51-2f7d3c9e8a11');
    expect(legacyDataUrl(INTERVIEWER_8)).toBe('/v8/data');
  });

  it('never lets an id change the address it is put in', () => {
    expect(legacyStartUrl(INTERVIEWER_8, 'a&import=b')).toBe(
      '/v8/?start=a%26import%3Db',
    );
    expect(legacyResumeUrl(INTERVIEWER_8, '../data')).toBe(
      '/v8/interview/..%2Fdata',
    );
  });
});
