import { describe, expect, it } from 'vitest';

import {
  getBundledLegacyInterviewer,
  LEGACY_INTERVIEWER_CACHE_PREFIX,
  LEGACY_INTERVIEWER_MAJOR,
  legacyInterviewUrl,
} from '../legacyInterviewer';

const INTERVIEWER_8 = { version: '8.5.0', path: '/v8/' } as const;

describe('legacyInterviewer', () => {
  it('has no Interviewer 8 under test, as in dev and Storybook', () => {
    expect(getBundledLegacyInterviewer()).toBeNull();
  });

  it('is the schema 8 Interviewer, caching under its own prefix', () => {
    expect(LEGACY_INTERVIEWER_MAJOR).toBe(8);
    expect(LEGACY_INTERVIEWER_CACHE_PREFIX).toBe('interviewer-v8-');
  });

  it("addresses Interviewer 8's interview route, keeping the search", () => {
    expect(legacyInterviewUrl(INTERVIEWER_8, 'session-1', '')).toBe(
      '/v8/interview/session-1',
    );
    expect(legacyInterviewUrl(INTERVIEWER_8, 'session-1', '?mode=review')).toBe(
      '/v8/interview/session-1?mode=review',
    );
  });

  it('never lets an id change the address it is put in', () => {
    expect(legacyInterviewUrl(INTERVIEWER_8, '../data', '')).toBe(
      '/v8/interview/..%2Fdata',
    );
    expect(legacyInterviewUrl(INTERVIEWER_8, 'a?mode=review', '')).toBe(
      '/v8/interview/a%3Fmode%3Dreview',
    );
  });
});
