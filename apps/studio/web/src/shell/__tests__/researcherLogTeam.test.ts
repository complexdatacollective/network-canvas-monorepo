import { describe, expect, it } from 'vitest';

import { screenTeam } from '../useResearcherLogTeam.ts';

describe('the team a researcher log is attributed to', () => {
  it('is the team route on screen, whatever team was active before', () => {
    expect(screenTeam('team-b', undefined, undefined)).toBe('team-b');
  });

  it('is the open study’s own team on a study route', () => {
    expect(screenTeam(undefined, 'study-1', 'team-of-study')).toBe(
      'team-of-study',
    );
  });

  it('is no team until the study’s team is known, and none off team and study routes', () => {
    expect(screenTeam(undefined, 'study-1', undefined)).toBeUndefined();
    expect(screenTeam(undefined, undefined, 'team-of-study')).toBeUndefined();
  });
});
