import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { scopeServiceWorkerContainer } from '../freshLoadScope';

const loadUnder = async (baseUrl: string) => {
  vi.stubEnv('BASE_URL', baseUrl);
  return import('../freshLoadScope');
};

describe('isInterviewPagePath (the fresh-load skip during interviews)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps the root build exactly as it was', async () => {
    const { isInterviewPagePath } = await loadUnder('/');

    expect(isInterviewPagePath('/interview/s1')).toBe(true);
    expect(isInterviewPagePath('/')).toBe(false);
    expect(isInterviewPagePath('/data')).toBe(false);
    // Case-sensitive, as the startsWith it replaced was.
    expect(isInterviewPagePath('/Interview/s1')).toBe(false);
    expect(isInterviewPagePath('/v8/interview/s1')).toBe(false);
  });

  it('skips an interview page under a /v8/ base', async () => {
    const { isInterviewPagePath } = await loadUnder('/v8/');

    expect(isInterviewPagePath('/v8/interview/s1')).toBe(true);
    expect(isInterviewPagePath('/v8/')).toBe(false);
    expect(isInterviewPagePath('/v8/data')).toBe(false);
  });
});

describe('getAppServiceWorkerContainer', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  const stubServiceWorker = () => {
    const container = {
      controller: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getRegistration: vi.fn(async () => undefined),
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: container,
    });
    return container;
  };

  it('leaves the root build on the helper default', async () => {
    stubServiceWorker();
    const { getAppServiceWorkerContainer } = await loadUnder('/');

    expect(getAppServiceWorkerContainer()).toBeUndefined();
  });

  it('scopes a /v8/ build to its own registration', async () => {
    const container = stubServiceWorker();
    const { getAppServiceWorkerContainer } = await loadUnder('/v8/');

    const scoped = getAppServiceWorkerContainer();
    expect(scoped).toBeDefined();
    await scoped?.getRegistration();
    expect(container.getRegistration).toHaveBeenCalledWith(
      new URL('/v8/', window.location.href).href,
    );
  });
});

describe('scopeServiceWorkerContainer', () => {
  const registrationAt = (scope: string) =>
    ({ scope }) as unknown as ServiceWorkerRegistration;

  const containerReturning = (
    registration: ServiceWorkerRegistration | undefined,
  ) => {
    const controller = {} as ServiceWorker;
    return {
      controller,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getRegistration: vi.fn(async (_clientURL?: string | URL) => registration),
    };
  };

  it("returns this build's own registration", async () => {
    const own = registrationAt('https://interviewer.example/v8/');
    const container = containerReturning(own);
    const scoped = scopeServiceWorkerContainer(
      container,
      '/v8/',
      'https://interviewer.example/v8/interview/s1',
    );

    await expect(scoped.getRegistration()).resolves.toBe(own);
    expect(container.getRegistration).toHaveBeenCalledWith(
      'https://interviewer.example/v8/',
    );
  });

  // Before /v8/sw.js is registered, the root app's worker controls a /v8/ page
  // and the browser answers the lookup with the root registration. Acting on it
  // would skip-wait the other app's update.
  it("never returns the hosting app's root registration", async () => {
    const scoped = scopeServiceWorkerContainer(
      containerReturning(registrationAt('https://interviewer.example/')),
      '/v8/',
      'https://interviewer.example/v8/',
    );

    await expect(scoped.getRegistration()).resolves.toBeUndefined();
  });

  it('forwards the controller and controller-change listeners', () => {
    const container = containerReturning(undefined);
    const scoped = scopeServiceWorkerContainer(
      container,
      '/v8/',
      'https://interviewer.example/v8/',
    );
    const listener = vi.fn();

    expect(scoped.controller).toBe(container.controller);
    scoped.addEventListener('controllerchange', listener);
    scoped.removeEventListener('controllerchange', listener);
    expect(container.addEventListener).toHaveBeenCalledWith(
      'controllerchange',
      listener,
    );
    expect(container.removeEventListener).toHaveBeenCalledWith(
      'controllerchange',
      listener,
    );
  });
});
