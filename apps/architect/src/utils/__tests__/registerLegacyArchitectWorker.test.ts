import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
};

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

const makeContainer = (existing?: Registration) => {
  const ready = deferred<unknown>();
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
    const { ready, container } = makeContainer({
      scope: `${ORIGIN}/`,
      active: { scriptURL: `${ORIGIN}/sw.js` },
      installing: null,
    });
    const idle = makeIdle();

    const done = registerLegacyArchitectWorker({
      architect: ARCHITECT_8,
      serviceWorker: container,
      whenIdle: idle.whenIdle,
      origin: ORIGIN,
    });

    await flush();
    expect(idle.whenIdle).not.toHaveBeenCalled();
    expect(container.register).not.toHaveBeenCalled();

    ready.resolve({});
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
    ready.resolve({});

    await registerLegacyArchitectWorker({
      architect: null,
      serviceWorker: container,
      whenIdle: idle.whenIdle,
      origin: ORIGIN,
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
      }),
    ).resolves.toBeUndefined();
    expect(idle.whenIdle).not.toHaveBeenCalled();
  });

  it.each([
    [
      'active',
      { scope: V8_SCOPE, active: { scriptURL: V8_SCRIPT }, installing: null },
    ],
    [
      'installing',
      { scope: V8_SCOPE, active: null, installing: { scriptURL: V8_SCRIPT } },
    ],
  ])(
    'skips registering when /v8/ already has an %s worker for the same script',
    async (_state, existing) => {
      const { registerLegacyArchitectWorker } = await load();
      const { ready, container } = makeContainer(existing);
      ready.resolve({});

      await registerLegacyArchitectWorker({
        architect: ARCHITECT_8,
        serviceWorker: container,
        whenIdle: (callback) => callback(),
        origin: ORIGIN,
      });

      expect(container.register).not.toHaveBeenCalled();
    },
  );

  it('registers when /v8/ has a worker for some other script', async () => {
    const { registerLegacyArchitectWorker } = await load();
    const { ready, container } = makeContainer({
      scope: V8_SCOPE,
      active: { scriptURL: `${ORIGIN}/v8/old-sw.js` },
      installing: null,
    });
    ready.resolve({});

    await registerLegacyArchitectWorker({
      architect: ARCHITECT_8,
      serviceWorker: container,
      whenIdle: (callback) => callback(),
      origin: ORIGIN,
    });

    expect(container.register).toHaveBeenCalledTimes(1);
  });

  it('runs once per page load', async () => {
    const { registerLegacyArchitectWorker } = await load();
    const { ready, container } = makeContainer();
    ready.resolve({});
    const environment = {
      architect: ARCHITECT_8,
      serviceWorker: container,
      whenIdle: (callback: () => void) => callback(),
      origin: ORIGIN,
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
    ready.resolve({});

    await expect(
      registerLegacyArchitectWorker({
        architect: ARCHITECT_8,
        serviceWorker: container,
        whenIdle: (callback) => callback(),
        origin: ORIGIN,
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
