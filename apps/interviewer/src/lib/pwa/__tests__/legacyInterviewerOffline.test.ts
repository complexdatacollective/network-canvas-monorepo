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
const precacheOf = (version: string) =>
  `interviewer-v8-${version}-turbo-abc-precache-v2-${ORIGIN}/v8/`;

const stubCaches = (names: string[]) =>
  vi.stubGlobal('caches', { keys: () => Promise.resolve(names) });

const stubRegistration = (
  registration: Partial<ServiceWorkerRegistration> | undefined,
) => {
  const getRegistrations = vi.fn(() =>
    Promise.resolve(registration ? [registration] : []),
  );
  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistrations },
  });
  return getRegistrations;
};

beforeEach(() => {
  bundled.current = { version: '8.5.0', path: '/v8/' };
  resetLegacyInterviewerOffline();
  stubCaches([precacheOf('8.5.0'), 'interviewer-v8-images']);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('legacyInterviewerOffline', () => {
  it('says there is nothing to install when no Interviewer 8 is bundled', async () => {
    bundled.current = null;
    resetLegacyInterviewerOffline();
    const getRegistrations = stubRegistration(undefined);

    expect(getLegacyInterviewerOffline()).toBe('not-bundled');
    await refreshLegacyInterviewerOffline();
    expect(getLegacyInterviewerOffline()).toBe('not-bundled');
    expect(getRegistrations).not.toHaveBeenCalled();
  });

  it('is ready once a worker is active for exactly /v8/', async () => {
    const getRegistrations = stubRegistration({
      scope: `${ORIGIN}/v8/`,
      active: {} as ServiceWorker,
    });

    expect(getLegacyInterviewerOffline()).toBe('checking');
    await refreshLegacyInterviewerOffline();
    expect(getLegacyInterviewerOffline()).toBe('ready');
    expect(getRegistrations).toHaveBeenCalled();
  });

  it('is not ready while a new pin installs beside the active build', async () => {
    stubRegistration({
      scope: `${ORIGIN}/v8/`,
      active: {} as ServiceWorker,
      installing: {} as ServiceWorker,
    });
    await refreshLegacyInterviewerOffline();
    expect(getLegacyInterviewerOffline()).toBe('not-ready');
  });

  it('is not ready while only an earlier pin is installed', async () => {
    stubCaches([precacheOf('8.4.9')]);
    stubRegistration({ scope: `${ORIGIN}/v8/`, active: {} as ServiceWorker });
    await refreshLegacyInterviewerOffline();
    expect(getLegacyInterviewerOffline()).toBe('not-ready');
  });

  it('is not ready when the precache has been deleted', async () => {
    stubCaches(['interviewer-v8-images', 'interviewer-9.0.0-x-precache-v2-/']);
    stubRegistration({ scope: `${ORIGIN}/v8/`, active: {} as ServiceWorker });
    await refreshLegacyInterviewerOffline();
    expect(getLegacyInterviewerOffline()).toBe('not-ready');
  });

  it('is ready when the pinned build has installed and waits to take over', async () => {
    stubCaches([precacheOf('8.4.9'), precacheOf('8.5.0')]);
    stubRegistration({
      scope: `${ORIGIN}/v8/`,
      active: {} as ServiceWorker,
      waiting: {} as ServiceWorker,
    });
    await refreshLegacyInterviewerOffline();
    expect(getLegacyInterviewerOffline()).toBe('ready');
  });

  it('is not ready where cache storage cannot be read', async () => {
    vi.stubGlobal('caches', {
      keys: () => Promise.reject(new DOMException('denied', 'SecurityError')),
    });
    stubRegistration({ scope: `${ORIGIN}/v8/`, active: {} as ServiceWorker });
    await refreshLegacyInterviewerOffline();
    expect(getLegacyInterviewerOffline()).toBe('not-ready');
  });

  it('is not ready while the worker is still installing', async () => {
    stubRegistration({
      scope: `${ORIGIN}/v8/`,
      active: null,
      installing: new EventTarget() as ServiceWorker,
    });
    await refreshLegacyInterviewerOffline();
    expect(getLegacyInterviewerOffline()).toBe('not-ready');
  });

  it('becomes ready when a worker it found installing finishes, with no further check asked for', async () => {
    // Interviewer 8 registered its own worker while running an interview.
    const worker = Object.assign(new EventTarget(), {
      state: 'installing',
    }) as unknown as ServiceWorker;
    const registration: Partial<ServiceWorkerRegistration> = {
      scope: `${ORIGIN}/v8/`,
      active: null,
      installing: worker,
    };
    stubRegistration(registration);
    await refreshLegacyInterviewerOffline();
    expect(getLegacyInterviewerOffline()).toBe('not-ready');

    Object.assign(registration, { installing: null, active: worker });
    Object.assign(worker, { state: 'activated' });
    worker.dispatchEvent(new Event('statechange'));

    await vi.waitFor(() => expect(getLegacyInterviewerOffline()).toBe('ready'));
  });

  it("does not take this app's own worker for Interviewer 8's", async () => {
    stubRegistration({ scope: `${ORIGIN}/`, active: {} as ServiceWorker });
    await refreshLegacyInterviewerOffline();
    expect(getLegacyInterviewerOffline()).toBe('not-ready');
  });

  it('is not ready when the browser cannot say', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: () => Promise.reject(new Error('insecure context')),
      },
    });
    await refreshLegacyInterviewerOffline();
    expect(getLegacyInterviewerOffline()).toBe('not-ready');
  });
});
