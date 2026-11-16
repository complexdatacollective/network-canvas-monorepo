import { describe, expect, it } from 'vitest';

import { legacyApp } from '../../../../../scripts/buildtime/legacy-app.ts';
import {
  getBundledLegacyInterviewer,
  LEGACY_INTERVIEWER_CACHE_PREFIX,
  legacyInterviewUrl,
} from '../legacyInterviewer';

const INTERVIEWER_8 = { version: '8.5.0', path: '/v8/' } as const;

describe('legacyInterviewer', () => {
  it('reads a build without the Interviewer 8 define as having none, instead of throwing', () => {
    expect(getBundledLegacyInterviewer()).toBeNull();
  });

  it('looks for Interviewer 8 caches under the prefix the bundling step enforces', () => {
    expect(LEGACY_INTERVIEWER_CACHE_PREFIX).toBe(
      legacyApp('interviewer').cachePrefix,
    );
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
