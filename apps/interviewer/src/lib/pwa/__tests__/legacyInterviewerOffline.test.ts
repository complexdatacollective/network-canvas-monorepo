import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BundledLegacyInterviewer } from '../../legacyInterviewer';

const bundled = vi.hoisted(() => ({
  current: null as BundledLegacyInterviewer | null,
}));
vi.mock('../../legacyInterviewer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../legacyInterviewer')>()),
  getBundledLegacyInterviewer: () => bundled.current,
}));

const {
  getLegacyInterviewerOffline,
  refreshLegacyInterviewerOffline,
  resetLegacyInterviewerOffline,
} = await import('../legacyInterviewerOffline');

const ORIGIN = 'https://interviewer.test';

const stubRegistration = (
  registration: Partial<ServiceWorkerRegistration> | undefined,
) => {
  const getRegistration = vi.fn(() => Promise.resolve(registration));
  vi.stubGlobal('navigator', {
    ...navigator,
    serviceWorker: { getRegistration },
  });
  return getRegistration;
};

beforeEach(() => {
  bundled.current = { version: '8.5.0', path: '/v8/' };
  resetLegacyInterviewerOffline();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('legacyInterviewerOffline', () => {
  it('says there is nothing to install when no Interviewer 8 is bundled', async () => {
    bundled.current = null;
    resetLegacyInterviewerOffline();
    const getRegistration = stubRegistration(undefined);

    expect(getLegacyInterviewerOffline()).toBe('not-bundled');
    await refreshLegacyInterviewerOffline();
    expect(getLegacyInterviewerOffline()).toBe('not-bundled');
    expect(getRegistration).not.toHaveBeenCalled();
  });

  it('is ready once a worker is active for exactly /v8/', async () => {
    const getRegistration = stubRegistration({
      scope: `${ORIGIN}/v8/`,
      active: {} as ServiceWorker,
    });

    expect(getLegacyInterviewerOffline()).toBe('checking');
    await refreshLegacyInterviewerOffline();
    expect(getLegacyInterviewerOffline()).toBe('ready');
    expect(getRegistration).toHaveBeenCalledWith('/v8/');
  });

  it('is not ready while the worker is still installing', async () => {
    stubRegistration({
      scope: `${ORIGIN}/v8/`,
      active: null,
      installing: {} as ServiceWorker,
    });
    await refreshLegacyInterviewerOffline();
    expect(getLegacyInterviewerOffline()).toBe('not-ready');
  });

  it("does not take this app's own worker for Interviewer 8's", async () => {
    // getRegistration('/v8/') answers with the closest enclosing scope.
    stubRegistration({ scope: `${ORIGIN}/`, active: {} as ServiceWorker });
    await refreshLegacyInterviewerOffline();
    expect(getLegacyInterviewerOffline()).toBe('not-ready');
  });

  it('is not ready when the browser cannot say', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: {
        getRegistration: () => Promise.reject(new Error('insecure context')),
      },
    });
    await refreshLegacyInterviewerOffline();
    expect(getLegacyInterviewerOffline()).toBe('not-ready');
  });
});
