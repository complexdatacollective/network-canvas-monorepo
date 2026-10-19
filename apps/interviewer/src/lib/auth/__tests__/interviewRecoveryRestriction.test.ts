import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The recovery restriction keeps a destructive reset off the screen during an
// interview. Its route check must hold under whichever base the app is built
// for, so each case loads the module fresh under that build's BASE_URL.
const loadUnder = async (baseUrl: string) => {
  vi.stubEnv('BASE_URL', baseUrl);
  return import('../interviewRecoveryRestriction');
};

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isInterviewRoutePath at the root', () => {
  it('matches interview routes, router and browser paths being the same', async () => {
    const { isInterviewRoutePath } = await loadUnder('/');

    expect(isInterviewRoutePath('/interview/s1')).toBe(true);
    expect(isInterviewRoutePath('/Interview/s1')).toBe(true);
    expect(isInterviewRoutePath('/')).toBe(false);
    expect(isInterviewRoutePath('/data')).toBe(false);
    // Interviewer 8's pages are not the root app's interviews.
    expect(isInterviewRoutePath('/v8/interview/s1')).toBe(false);
  });
});

describe('isInterviewRoutePath in a /v8/ build', () => {
  it('matches the browser path, which carries the base', async () => {
    const { isInterviewRoutePath } = await loadUnder('/v8/');

    expect(isInterviewRoutePath('/v8/interview/s1')).toBe(true);
    expect(isInterviewRoutePath('/v8/Interview/s1')).toBe(true);
  });

  it('matches the router path, which wouter gives relative to the base', async () => {
    const { isInterviewRoutePath } = await loadUnder('/v8/');

    expect(isInterviewRoutePath('/interview/s1')).toBe(true);
  });

  it('does not match its home or data pages, or another base', async () => {
    const { isInterviewRoutePath } = await loadUnder('/v8/');

    expect(isInterviewRoutePath('/v8/')).toBe(false);
    expect(isInterviewRoutePath('/v8/data')).toBe(false);
    expect(isInterviewRoutePath('/v80/interview/s1')).toBe(false);
  });
});
