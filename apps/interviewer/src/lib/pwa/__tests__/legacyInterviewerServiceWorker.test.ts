import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BundledLegacyInterviewer } from '../../legacyInterviewer';
import {
  IDLE_FALLBACK_DELAY_MS,
  IDLE_TIMEOUT_MS,
  installLegacyInterviewerInBackground,
  resetLegacyInterviewerInstall,
} from '../legacyInterviewerServiceWorker';

const ORIGIN = 'https://interviewer.test';
const SCRIPT = `${ORIGIN}/v8/sw.js`;
const INTERVIEWER: BundledLegacyInterviewer = {
  version: '8.5.0',
  path: '/v8/',
};

type FakeWorker = ServiceWorker & { setState: (state: string) => void };

const fakeWorker = (scriptURL: string, state = 'installing'): FakeWorker => {
  const target = new EventTarget();
  const worker = Object.assign(target, {
    scriptURL,
    state,
    setState(next: string) {
      worker.state = next;
      target.dispatchEvent(new Event('statechange'));
    },
  });
  return worker as unknown as FakeWorker;
};

const fakeRegistration = (
  scope: string,
  workers: Partial<
    Record<'active' | 'waiting' | 'installing', ServiceWorker>
  > = {},
): ServiceWorkerRegistration =>
  Object.assign(new EventTarget(), {
    scope,
    active: null,
    waiting: null,
    installing: null,
    ...workers,
  }) as unknown as ServiceWorkerRegistration;

/** A promise and the function that settles it. */
const deferred = () => {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const flush = () => new Promise((done) => setTimeout(done, 0));

let ready: ReturnType<typeof deferred>;
let idle: (() => void) | null;
let existing: ServiceWorkerRegistration | undefined;
let registered: ServiceWorkerRegistration;
let container: {
  ready: Promise<void>;
  getRegistration: ReturnType<typeof vi.fn>;
  register: ReturnType<typeof vi.fn>;
};
let refresh: ReturnType<typeof vi.fn<() => void>>;
let report: ReturnType<typeof vi.fn<(error: unknown) => void>>;

const install = (
  overrides: Parameters<typeof installLegacyInterviewerInBackground>[1] = {},
) =>
  installLegacyInterviewerInBackground(report, {
    interviewer: INTERVIEWER,
    container: container as unknown as ServiceWorkerContainer,
    origin: ORIGIN,
    whenIdle: (callback) => {
      idle = callback;
    },
    refresh,
    ...overrides,
  });

/** Start an install and walk it through ready and idle. */
const installWhenIdle = async (
  overrides: Parameters<typeof installLegacyInterviewerInBackground>[1] = {},
) => {
  const outcome = install(overrides);
  ready.resolve();
  await flush();
  idle?.();
  return outcome;
};

beforeEach(() => {
  resetLegacyInterviewerInstall();
  ready = deferred();
  idle = null;
  existing = undefined;
  registered = fakeRegistration(`${ORIGIN}/v8/`, {
    installing: fakeWorker(SCRIPT),
  });
  container = {
    ready: ready.promise,
    getRegistration: vi.fn(() => Promise.resolve(existing)),
    register: vi.fn(() => Promise.resolve(registered)),
  };
  refresh = vi.fn<() => void>();
  report = vi.fn<(error: unknown) => void>();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('installLegacyInterviewerInBackground', () => {
  it('registers Interviewer 8’s own worker for its own scope', async () => {
    await expect(installWhenIdle()).resolves.toBe('registered');
    expect(container.register).toHaveBeenCalledExactlyOnceWith(SCRIPT, {
      scope: '/v8/',
    });
    expect(report).not.toHaveBeenCalled();
  });

  it('does nothing when this build has no Interviewer 8', async () => {
    await expect(install({ interviewer: null })).resolves.toBe('not-bundled');
    expect(container.getRegistration).not.toHaveBeenCalled();
    expect(container.register).not.toHaveBeenCalled();
  });

  it('does nothing where there are no service workers', async () => {
    await expect(install({ container: undefined })).resolves.toBe(
      'unsupported',
    );
  });

  it('waits for this app’s own worker before anything else', async () => {
    const outcome = install();
    await flush();
    expect(idle).toBeNull();
    expect(container.getRegistration).not.toHaveBeenCalled();
    expect(container.register).not.toHaveBeenCalled();

    ready.resolve();
    await flush();
    idle?.();
    await expect(outcome).resolves.toBe('registered');
  });

  it('waits for the browser to be idle', async () => {
    const outcome = install();
    ready.resolve();
    await flush();
    expect(idle).not.toBeNull();
    expect(container.register).not.toHaveBeenCalled();

    idle?.();
    await expect(outcome).resolves.toBe('registered');
    expect(container.register).toHaveBeenCalledOnce();
  });

  it('asks only once per page load', async () => {
    await installWhenIdle();
    await expect(installWhenIdle()).resolves.toBe('already-started');
    expect(container.register).toHaveBeenCalledOnce();
  });

  it.each(['active', 'waiting', 'installing'] as const)(
    'leaves alone a registration whose %s worker runs Interviewer 8’s script',
    async (slot) => {
      existing = fakeRegistration(`${ORIGIN}/v8/`, {
        [slot]: fakeWorker(SCRIPT, slot === 'active' ? 'activated' : slot),
      });
      await expect(installWhenIdle()).resolves.toBe('already-registered');
      expect(container.getRegistration).toHaveBeenCalledWith('/v8/');
      expect(container.register).not.toHaveBeenCalled();
      expect(refresh).toHaveBeenCalled();
    },
  );

  it('registers when the closest registration is this app’s own', async () => {
    existing = fakeRegistration(`${ORIGIN}/`, {
      active: fakeWorker(`${ORIGIN}/sw.js`, 'activated'),
    });
    await expect(installWhenIdle()).resolves.toBe('registered');
  });

  it('registers when /v8/ is registered with another script', async () => {
    existing = fakeRegistration(`${ORIGIN}/v8/`, {
      active: fakeWorker(`${ORIGIN}/v8/old-sw.js`, 'activated'),
    });
    await expect(installWhenIdle()).resolves.toBe('registered');
  });

  it('reports a failure and never throws', async () => {
    const failure = new TypeError('Failed to register a ServiceWorker');
    container.register.mockRejectedValueOnce(failure);
    await expect(installWhenIdle()).resolves.toBe('failed');
    expect(report).toHaveBeenCalledExactlyOnceWith(failure);
    expect(refresh).toHaveBeenCalled();
  });

  it('reports a registry it cannot read', async () => {
    const failure = new DOMException('denied', 'SecurityError');
    container.getRegistration.mockRejectedValueOnce(failure);
    await expect(installWhenIdle()).resolves.toBe('failed');
    expect(report).toHaveBeenCalledExactlyOnceWith(failure);
    expect(container.register).not.toHaveBeenCalled();
  });

  it('refreshes whether it is ready offline as its worker installs', async () => {
    await installWhenIdle();
    const worker = registered.installing as FakeWorker;
    refresh.mockClear();

    worker.setState('installed');
    worker.setState('activating');
    worker.setState('activated');
    expect(refresh).toHaveBeenCalledTimes(3);

    // Done following it once it is active.
    worker.setState('redundant');
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('follows a worker that is found later', async () => {
    registered = fakeRegistration(`${ORIGIN}/v8/`);
    await installWhenIdle();
    refresh.mockClear();

    const later = fakeWorker(SCRIPT);
    Object.assign(registered, { installing: later });
    registered.dispatchEvent(new Event('updatefound'));
    (later as FakeWorker).setState('activated');
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe('waiting for an idle moment', () => {
  it('asks requestIdleCallback, with a timeout so it always runs', async () => {
    const requestIdleCallback = vi.fn((callback: () => void) => {
      callback();
      return 1;
    });
    vi.stubGlobal('requestIdleCallback', requestIdleCallback);
    ready.resolve();

    await expect(
      installLegacyInterviewerInBackground(report, {
        interviewer: INTERVIEWER,
        container: container as unknown as ServiceWorkerContainer,
        origin: ORIGIN,
        refresh,
      }),
    ).resolves.toBe('registered');
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), {
      timeout: IDLE_TIMEOUT_MS,
    });
  });

  it('falls back to a timer where requestIdleCallback is missing', async () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.useFakeTimers();
    ready.resolve();

    const outcome = installLegacyInterviewerInBackground(report, {
      interviewer: INTERVIEWER,
      container: container as unknown as ServiceWorkerContainer,
      origin: ORIGIN,
      refresh,
    });
    await vi.advanceTimersByTimeAsync(IDLE_FALLBACK_DELAY_MS - 1);
    expect(container.register).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(outcome).resolves.toBe('registered');
  });
});
