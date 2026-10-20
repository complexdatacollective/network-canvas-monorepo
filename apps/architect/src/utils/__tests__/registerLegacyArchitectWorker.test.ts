import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPwaCacheReclamationWorkerSource } from '../../../../../scripts/buildtime/pwa-cache-reclamation-plugin.ts';

const reportError = vi.hoisted(() => vi.fn());
vi.mock('../reportError', () => ({ reportError }));

const ORIGIN = 'https://architect.example';
const ARCHITECT_8 = { version: '8.5.0', path: '/v8/' } as const;
const V8_SCOPE = `${ORIGIN}/v8/`;
const V8_SCRIPT = `${ORIGIN}/v8/sw.js`;

type Registration = {
  scope: string;
  active: { scriptURL: string } | null;
  installing: { scriptURL: string } | null;
  update: () => Promise<unknown>;
};

const registration = (
  fields: Omit<Registration, 'update'>,
): Registration & { update: ReturnType<typeof vi.fn> } => ({
  ...fields,
  update: vi.fn(() => Promise.resolve(undefined)),
});

// The module registers at most once per page load, so each test loads a
// fresh copy.
const load = async () => {
  vi.resetModules();
  return await import('../registerLegacyArchitectWorker');
};

const deferred = <T>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

const BUILD_ID = 'architect-test-build';

// This page's build is the active root worker, unless a test says otherwise.
const thisBuild = {
  buildId: BUILD_ID,
  readActiveRootBuild: () => Promise.resolve(BUILD_ID),
};

const ROOT = { scope: `${ORIGIN}/` };

const makeContainer = (existing?: Registration) => {
  const ready = deferred<{ scope: string }>();
  return {
    ready,
    container: {
      ready: ready.promise,
      getRegistration: vi.fn((_clientURL: string) => Promise.resolve(existing)),
      register: vi.fn((_scriptURL: string, _options: { scope: string }) =>
        Promise.resolve({}),
      ),
    },
  };
};

// Runs the idle callback when the test says so.
const makeIdle = () => {
  let pending: (() => void) | undefined;
  return {
    whenIdle: vi.fn((callback: () => void) => {
      pending = callback;
    }),
    fire: () => pending?.(),
  };
};

// Lets queued promise callbacks run.
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

beforeEach(() => {
  reportError.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('registerLegacyArchitectWorker', () => {
  it('registers /v8/sw.js for /v8/ only after this app’s worker is ready and the browser is idle', async () => {
    const { registerLegacyArchitectWorker } = await load();
    const { ready, container } = makeContainer(
      registration({
        scope: `${ORIGIN}/`,
        active: { scriptURL: `${ORIGIN}/sw.js` },
        installing: null,
      }),
    );
    const idle = makeIdle();

    const done = registerLegacyArchitectWorker({
      architect: ARCHITECT_8,
      serviceWorker: container,
      whenIdle: idle.whenIdle,
      origin: ORIGIN,
      ...thisBuild,
    });

    await flush();
    expect(idle.whenIdle).not.toHaveBeenCalled();
    expect(container.register).not.toHaveBeenCalled();

    ready.resolve(ROOT);
    await flush();
    expect(idle.whenIdle).toHaveBeenCalledTimes(1);
    expect(container.register).not.toHaveBeenCalled();

    idle.fire();
    await done;
    // This app's own registration (scope /) is what `getRegistration` finds
    // while Architect 8 has none; it does not count as Architect 8's.
    expect(container.getRegistration).toHaveBeenCalledWith(V8_SCOPE);
    expect(container.register).toHaveBeenCalledExactlyOnceWith('/v8/sw.js', {
      scope: '/v8/',
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it('does nothing when this build bundles no Architect 8', async () => {
    const { registerLegacyArchitectWorker } = await load();
    const { ready, container } = makeContainer();
    const idle = makeIdle();
    ready.resolve(ROOT);

    await registerLegacyArchitectWorker({
      architect: null,
      serviceWorker: container,
      whenIdle: idle.whenIdle,
      origin: ORIGIN,
      ...thisBuild,
    });

    expect(idle.whenIdle).not.toHaveBeenCalled();
    expect(container.getRegistration).not.toHaveBeenCalled();
    expect(container.register).not.toHaveBeenCalled();
  });

  it('does nothing in a browser without service workers', async () => {
    const { registerLegacyArchitectWorker } = await load();
    const idle = makeIdle();

    await expect(
      registerLegacyArchitectWorker({
        architect: ARCHITECT_8,
        serviceWorker: undefined,
        whenIdle: idle.whenIdle,
        origin: ORIGIN,
        ...thisBuild,
      }),
    ).resolves.toBeUndefined();
    expect(idle.whenIdle).not.toHaveBeenCalled();
  });

  it.each([
    [
      'active',
      registration({
        scope: V8_SCOPE,
        active: { scriptURL: V8_SCRIPT },
        installing: null,
      }),
    ],
    [
      'installing',
      registration({
        scope: V8_SCOPE,
        active: null,
        installing: { scriptURL: V8_SCRIPT },
      }),
    ],
  ])(
    'checks for an update instead of registering when /v8/ already has an %s worker for the same script',
    async (_state, existing) => {
      const { registerLegacyArchitectWorker } = await load();
      const { ready, container } = makeContainer(existing);
      ready.resolve(ROOT);

      await registerLegacyArchitectWorker({
        architect: ARCHITECT_8,
        serviceWorker: container,
        whenIdle: (callback) => callback(),
        origin: ORIGIN,
        ...thisBuild,
      });

      expect(container.register).not.toHaveBeenCalled();
      // A newer pinned Architect 8 keeps the same script URL, so only an
      // update check fetches it.
      expect(existing.update).toHaveBeenCalledTimes(1);
    },
  );

  it('registers when /v8/ has a worker for some other script', async () => {
    const { registerLegacyArchitectWorker } = await load();
    const { ready, container } = makeContainer(
      registration({
        scope: V8_SCOPE,
        active: { scriptURL: `${ORIGIN}/v8/old-sw.js` },
        installing: null,
      }),
    );
    ready.resolve(ROOT);

    await registerLegacyArchitectWorker({
      architect: ARCHITECT_8,
      serviceWorker: container,
      whenIdle: (callback) => callback(),
      origin: ORIGIN,
      ...thisBuild,
    });

    expect(container.register).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['another build', 'architect-older-build'],
    ['no build', undefined],
  ])(
    'waits for a later load while the active root worker records %s',
    async (_case, activeBuild) => {
      const { registerLegacyArchitectWorker } = await load();
      const { ready, container } = makeContainer();
      ready.resolve(ROOT);
      const readActiveRootBuild = vi.fn((_scope: string) =>
        Promise.resolve(activeBuild),
      );

      await registerLegacyArchitectWorker({
        architect: ARCHITECT_8,
        serviceWorker: container,
        whenIdle: (callback) => callback(),
        origin: ORIGIN,
        buildId: BUILD_ID,
        readActiveRootBuild,
      });

      expect(readActiveRootBuild).toHaveBeenCalledExactlyOnceWith(ROOT.scope);
      expect(container.getRegistration).not.toHaveBeenCalled();
      expect(container.register).not.toHaveBeenCalled();
    },
  );

  it('reads the build the root worker recorded', async () => {
    const { registerLegacyArchitectWorker } = await load();
    const { ready, container } = makeContainer();
    ready.resolve(ROOT);
    const match = vi.fn(() => Promise.resolve(new Response(BUILD_ID)));
    vi.stubGlobal('caches', { match });

    await registerLegacyArchitectWorker({
      architect: ARCHITECT_8,
      serviceWorker: container,
      whenIdle: (callback) => callback(),
      origin: ORIGIN,
      buildId: BUILD_ID,
    });

    expect(match).toHaveBeenCalledExactlyOnceWith(
      `${ORIGIN}/__pwa-active-build__`,
      { cacheName: 'architect-pwa-cache-metadata' },
    );
    expect(container.register).toHaveBeenCalledTimes(1);
  });

  it('names the record the generated root worker writes', async () => {
    const { ACTIVE_BUILD_CACHE, ACTIVE_BUILD_KEY } = await load();
    const source = createPwaCacheReclamationWorkerSource({
      appCachePrefix: 'architect-',
      buildId: BUILD_ID,
      foreignCachePrefixes: ['architect-v8-'],
      foreignScopePaths: ['/v8/'],
    });
    expect(ACTIVE_BUILD_CACHE).toBe('architect-pwa-cache-metadata');
    expect(source).toContain(
      `const metadataCacheName = appCachePrefix + 'pwa-cache-metadata';`,
    );
    expect(source).toContain('const appCachePrefix = "architect-";');
    expect(source).toContain(
      `new URL('${ACTIVE_BUILD_KEY}', self.registration.scope)`,
    );
  });

  it('runs once per page load', async () => {
    const { registerLegacyArchitectWorker } = await load();
    const { ready, container } = makeContainer();
    ready.resolve(ROOT);
    const environment = {
      architect: ARCHITECT_8,
      serviceWorker: container,
      whenIdle: (callback: () => void) => callback(),
      origin: ORIGIN,
      ...thisBuild,
    };

    await registerLegacyArchitectWorker(environment);
    await registerLegacyArchitectWorker(environment);

    expect(container.register).toHaveBeenCalledTimes(1);
  });

  it('reports a failed registration without rejecting', async () => {
    const { registerLegacyArchitectWorker } = await load();
    const { ready, container } = makeContainer();
    const failure = new Error('SecurityError');
    container.register.mockRejectedValue(failure);
    ready.resolve(ROOT);

    await expect(
      registerLegacyArchitectWorker({
        architect: ARCHITECT_8,
        serviceWorker: container,
        whenIdle: (callback) => callback(),
        origin: ORIGIN,
        ...thisBuild,
      }),
    ).resolves.toBeUndefined();

    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure, {
      operation: 'legacy-architect-worker-register',
    });
  });
});

describe('whenBrowserIdle', () => {
  it('asks for an idle callback with a timeout, so a busy page still gets there', async () => {
    const { whenBrowserIdle, LEGACY_WORKER_IDLE_TIMEOUT_MS } = await load();
    const requestIdleCallback = vi.fn(
      (callback: IdleRequestCallback, _options?: IdleRequestOptions) => {
        callback({ didTimeout: false, timeRemaining: () => 10 });
        return 1;
      },
    );
    vi.stubGlobal('requestIdleCallback', requestIdleCallback);
    const callback = vi.fn();

    whenBrowserIdle(callback);

    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), {
      timeout: LEGACY_WORKER_IDLE_TIMEOUT_MS,
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('falls back to a timer where there is no requestIdleCallback', async () => {
    const { whenBrowserIdle, LEGACY_WORKER_FALLBACK_DELAY_MS } = await load();
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    const callback = vi.fn();

    whenBrowserIdle(callback);
    vi.advanceTimersByTime(LEGACY_WORKER_FALLBACK_DELAY_MS - 1);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
