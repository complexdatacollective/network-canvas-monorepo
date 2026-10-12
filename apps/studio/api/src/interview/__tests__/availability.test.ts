import { describe, expect, it } from 'vitest';

import { redemptionRefusal, sessionRefusal } from '../availability.ts';

const NOW = new Date('2026-10-06T12:00:00.000Z');
const minutesFromNow = (minutes: number) =>
  new Date(NOW.getTime() + minutes * 60_000);

const live = {
  studyState: 'live' as const,
  studyPausedAt: null,
  pauseGraceMinutes: 60,
};

const openLink = {
  ...live,
  revokedAt: null,
  expiresAt: null,
  protocolVersionId: 'version-1',
  waveOpensAt: null,
  waveClosesAt: null,
};

describe('redeeming a link', () => {
  it('is allowed on a live study with an open wave', () => {
    expect(redemptionRefusal(openLink, NOW)).toBeNull();
    expect(
      redemptionRefusal(
        {
          ...openLink,
          waveOpensAt: minutesFromNow(-1),
          waveClosesAt: minutesFromNow(1),
          expiresAt: minutesFromNow(1),
        },
        NOW,
      ),
    ).toBeNull();
  });

  it.each([
    ['a revoked link', { revokedAt: minutesFromNow(-1) }, 'revoked'],
    ['an expired link', { expiresAt: NOW }, 'expired'],
    ['a closed study', { studyState: 'closed' as const }, 'closed'],
    [
      'a paused study, even inside its grace window',
      { studyState: 'paused' as const, studyPausedAt: minutesFromNow(-1) },
      'paused',
    ],
    ['a draft study', { studyState: 'draft' as const }, 'not_open'],
    ['a wave with no pinned version', { protocolVersionId: null }, 'not_open'],
    ['a wave not yet open', { waveOpensAt: minutesFromNow(1) }, 'not_open'],
    ['a wave past its closing time', { waveClosesAt: NOW }, 'closed'],
  ] as const)('refuses %s', (_label, change, state) => {
    expect(redemptionRefusal({ ...openLink, ...change }, NOW)).toBe(state);
  });

  it('names a revocation before any study state', () => {
    expect(
      redemptionRefusal(
        { ...openLink, revokedAt: NOW, studyState: 'closed' },
        NOW,
      ),
    ).toBe('revoked');
  });
});

describe('an interview under way', () => {
  it('continues on a live study', () => {
    expect(sessionRefusal(live, NOW)).toBeNull();
  });

  it('continues through a pause until the grace window ends', () => {
    const paused = { ...live, studyState: 'paused' as const };
    expect(
      sessionRefusal({ ...paused, studyPausedAt: minutesFromNow(-59) }, NOW),
    ).toBeNull();
    expect(
      sessionRefusal({ ...paused, studyPausedAt: minutesFromNow(-60) }, NOW),
    ).toBe('paused');
    expect(
      sessionRefusal(
        { ...paused, studyPausedAt: minutesFromNow(-1), pauseGraceMinutes: 0 },
        NOW,
      ),
    ).toBe('paused');
  });

  it('stops on a closed study', () => {
    expect(sessionRefusal({ ...live, studyState: 'closed' }, NOW)).toBe(
      'closed',
    );
  });
});
