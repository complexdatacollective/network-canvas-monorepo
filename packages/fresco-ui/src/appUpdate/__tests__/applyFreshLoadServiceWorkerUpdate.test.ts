import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyFreshLoadServiceWorkerUpdate,
  installServiceWorkerUpdate,
} from '../applyFreshLoadServiceWorkerUpdate';

type FakeWorker = ServiceWorker & { state: ServiceWorkerState };

function createWorker(initialState: ServiceWorkerState) {
  const target = new EventTarget();
  const postMessage = vi.fn();
  const worker = Object.assign(target, {
    scriptURL: '/sw.js',
    state: initialState,
    postMessage,
  }) as unknown as FakeWorker;

  const setState = (state: ServiceWorkerState) => {
    worker.state = state;
    target.dispatchEvent(new Event('statechange'));
  };

  return { worker, postMessage, setState };
}

type FakeRegistration = ServiceWorkerRegistration & {
  waiting: ServiceWorker | null;
  installing: ServiceWorker | null;
  update: ReturnType<typeof vi.fn<() => Promise<ServiceWorkerRegistration>>>;
  dispatchUpdateFound: () => void;
};

function createRegistration({
  waiting = null,
  installing = null,
}: {
  waiting?: ServiceWorker | null;
  installing?: ServiceWorker | null;
} = {}) {
  const target = new EventTarget();
  const update = vi.fn<() => Promise<ServiceWorkerRegistration>>();
  const registration = Object.assign(target, {
    waiting,
    installing,
    update,
    dispatchUpdateFound: () => target.dispatchEvent(new Event('updatefound')),
  }) as unknown as FakeRegistration;
  update.mockResolvedValue(registration);
  return registration;
}

function createServiceWorkerContainer({
  registration,
  controller = createWorker('activated').worker,
}: {
  registration?: ServiceWorkerRegistration;
  controller?: ServiceWorker | null;
}) {
  const target = new EventTarget();
  const getRegistration = vi.fn(() => Promise.resolve(registration));

  return {
    controller,
    getRegistration,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchControllerChange: () =>
      target.dispatchEvent(new Event('controllerchange')),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('applyFreshLoadServiceWorkerUpdate', () => {
  it('skips when the page is not controlled by an existing service worker', async () => {
    const registration = createRegistration();
    const serviceWorker = createServiceWorkerContainer({
      registration,
      controller: null,
    });

    const result = await applyFreshLoadServiceWorkerUpdate({
      serviceWorker,
      shouldSkip: () => false,
    });

    expect(result).toBe(false);
    expect(serviceWorker.getRegistration).not.toHaveBeenCalled();
    expect(registration.update).not.toHaveBeenCalled();
  });

  it('skips when the current app state should not be interrupted', async () => {
    const registration = createRegistration();
    const serviceWorker = createServiceWorkerContainer({ registration });

    const result = await applyFreshLoadServiceWorkerUpdate({
      serviceWorker,
      shouldSkip: () => true,
    });

    expect(result).toBe(false);
    expect(serviceWorker.getRegistration).not.toHaveBeenCalled();
  });

  it('preserves the legacy default reload and true return contract', async () => {
    const browserWindow = window;
    const reload = vi.fn();
    vi.stubGlobal('window', {
      clearTimeout: browserWindow.clearTimeout.bind(browserWindow),
      location: { reload },
      queueMicrotask: browserWindow.queueMicrotask.bind(browserWindow),
      setTimeout: browserWindow.setTimeout.bind(browserWindow),
    });
    const waiting = createWorker('installed');
    const registration = createRegistration({ waiting: waiting.worker });
    const serviceWorker = createServiceWorkerContainer({ registration });

    const result = applyFreshLoadServiceWorkerUpdate({
      serviceWorker,
      shouldSkip: () => false,
      updateCheckTimeoutMs: 50,
      activationTimeoutMs: 50,
    });

    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
    expect(waiting.postMessage).toHaveBeenCalledWith({
      type: 'SKIP_WAITING',
    });

    waiting.setState('activated');

    await expect(result).resolves.toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('activates in explicit no-reload mode and returns false so startup continues', async () => {
    const waiting = createWorker('installed');
    const registration = createRegistration({ waiting: waiting.worker });
    const serviceWorker = createServiceWorkerContainer({ registration });
    const reload = vi.fn();

    const result = applyFreshLoadServiceWorkerUpdate({
      serviceWorker,
      reload: false,
      shouldSkip: () => false,
      updateCheckTimeoutMs: 50,
      activationTimeoutMs: 50,
    });

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    waiting.setState('activated');

    await expect(result).resolves.toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('preserves a supplied legacy reload callback', async () => {
    const waiting = createWorker('installed');
    const registration = createRegistration({ waiting: waiting.worker });
    const serviceWorker = createServiceWorkerContainer({ registration });
    const reload = vi.fn();

    const result = applyFreshLoadServiceWorkerUpdate({
      serviceWorker,
      reload,
      shouldSkip: () => false,
      updateCheckTimeoutMs: 50,
      activationTimeoutMs: 50,
    });

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    waiting.setState('activated');

    await expect(result).resolves.toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not reload a legacy caller that becomes protected during activation', async () => {
    const waiting = createWorker('installed');
    const registration = createRegistration({ waiting: waiting.worker });
    const serviceWorker = createServiceWorkerContainer({ registration });
    const reload = vi.fn();
    let shouldSkip = false;

    const result = applyFreshLoadServiceWorkerUpdate({
      serviceWorker,
      reload,
      shouldSkip: () => shouldSkip,
      updateCheckTimeoutMs: 50,
      activationTimeoutMs: 50,
    });

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(waiting.postMessage).toHaveBeenCalledWith({
      type: 'SKIP_WAITING',
    });

    shouldSkip = true;
    waiting.setState('activated');

    await expect(result).resolves.toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('waits for an installing update to become waiting before activating it', async () => {
    const installing = createWorker('installing');
    const registration = createRegistration({ installing: installing.worker });
    const serviceWorker = createServiceWorkerContainer({ registration });

    const result = applyFreshLoadServiceWorkerUpdate({
      serviceWorker,
      reload: false,
      shouldSkip: () => false,
      updateCheckTimeoutMs: 50,
      activationTimeoutMs: 50,
    });

    await Promise.resolve();
    expect(installing.postMessage).not.toHaveBeenCalled();

    installing.setState('installed');
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
    expect(installing.postMessage).toHaveBeenCalledWith({
      type: 'SKIP_WAITING',
    });

    serviceWorker.dispatchControllerChange();

    await expect(result).resolves.toBe(false);
  });

  it('observes updatefound before update resolves and waits for its installing worker', async () => {
    const installing = createWorker('installing');
    const registration = createRegistration();
    let resolveUpdate: (
      registration: ServiceWorkerRegistration,
    ) => void = () => {};
    registration.update.mockImplementation(
      () =>
        new Promise<ServiceWorkerRegistration>((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    const serviceWorker = createServiceWorkerContainer({ registration });

    const result = applyFreshLoadServiceWorkerUpdate({
      serviceWorker,
      reload: false,
      shouldSkip: () => false,
      updateCheckTimeoutMs: 50,
      activationTimeoutMs: 50,
    });

    registration.installing = installing.worker;
    registration.dispatchUpdateFound();
    installing.setState('installed');

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(installing.postMessage).toHaveBeenCalledWith({
      type: 'SKIP_WAITING',
    });

    installing.setState('activated');
    await expect(result).resolves.toBe(false);
    resolveUpdate(registration);
  });

  it('finds an installing worker populated as the update check resolves', async () => {
    const installing = createWorker('installing');
    const registration = createRegistration();
    registration.update.mockImplementation(() => {
      registration.installing = installing.worker;
      return Promise.resolve(registration);
    });
    const serviceWorker = createServiceWorkerContainer({ registration });

    const result = applyFreshLoadServiceWorkerUpdate({
      serviceWorker,
      reload: false,
      shouldSkip: () => false,
      updateCheckTimeoutMs: 50,
      activationTimeoutMs: 50,
    });

    installing.setState('installed');
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(installing.postMessage).toHaveBeenCalledWith({
      type: 'SKIP_WAITING',
    });

    installing.setState('activated');
    await expect(result).resolves.toBe(false);
  });

  it('continues startup when the update check fails', async () => {
    const registration = createRegistration();
    registration.update.mockRejectedValue(new Error('offline'));
    const serviceWorker = createServiceWorkerContainer({ registration });

    await expect(
      applyFreshLoadServiceWorkerUpdate({
        serviceWorker,
        shouldSkip: () => false,
        updateCheckTimeoutMs: 50,
        activationTimeoutMs: 50,
      }),
    ).resolves.toBe(false);
  });

  it('continues startup quickly when the update check times out offline', async () => {
    let resolveUpdate: (
      registration: ServiceWorkerRegistration,
    ) => void = () => {};
    const registration = createRegistration();
    registration.update.mockReturnValue(
      new Promise<ServiceWorkerRegistration>((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    const serviceWorker = createServiceWorkerContainer({ registration });

    await expect(
      applyFreshLoadServiceWorkerUpdate({
        serviceWorker,
        shouldSkip: () => false,
        updateCheckTimeoutMs: 1,
        activationTimeoutMs: 50,
      }),
    ).resolves.toBe(false);

    resolveUpdate(registration);
  });

  it('continues startup when the controller change times out', async () => {
    const waiting = createWorker('installed');
    const registration = createRegistration({ waiting: waiting.worker });
    const serviceWorker = createServiceWorkerContainer({ registration });

    await expect(
      applyFreshLoadServiceWorkerUpdate({
        serviceWorker,
        shouldSkip: () => false,
        updateCheckTimeoutMs: 50,
        activationTimeoutMs: 1,
      }),
    ).resolves.toBe(false);

    expect(waiting.postMessage).toHaveBeenCalledWith({
      type: 'SKIP_WAITING',
    });
  });

  it('checks the skip predicate again before activating a found update', async () => {
    const waiting = createWorker('installed');
    const registration = createRegistration({ waiting: waiting.worker });
    const serviceWorker = createServiceWorkerContainer({ registration });
    const shouldSkip = vi
      .fn<() => boolean>()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    await expect(
      applyFreshLoadServiceWorkerUpdate({
        serviceWorker,
        shouldSkip,
        updateCheckTimeoutMs: 50,
        activationTimeoutMs: 50,
      }),
    ).resolves.toBe(false);

    expect(waiting.postMessage).not.toHaveBeenCalled();
  });
});

describe('installServiceWorkerUpdate', () => {
  it('activates a waiting worker and reloads after it controls the page', async () => {
    const waiting = createWorker('installed');
    const registration = createRegistration({ waiting: waiting.worker });
    const serviceWorker = createServiceWorkerContainer({ registration });
    const reload = vi.fn();

    const result = installServiceWorkerUpdate({
      registration,
      serviceWorker,
      reload,
      activationTimeoutMs: 50,
    });

    await Promise.resolve();
    expect(waiting.postMessage).toHaveBeenCalledWith({
      type: 'SKIP_WAITING',
    });

    serviceWorker.dispatchControllerChange();

    await expect(result).resolves.toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('reloads when another tab has already activated the update', async () => {
    const registration = createRegistration();
    const serviceWorker = createServiceWorkerContainer({ registration });
    const reload = vi.fn();

    await expect(
      installServiceWorkerUpdate({ registration, serviceWorker, reload }),
    ).resolves.toBe(true);

    expect(reload).toHaveBeenCalledOnce();
  });

  it('reloads after activation even when controllerchange is not observed', async () => {
    const waiting = createWorker('installed');
    const registration = createRegistration({ waiting: waiting.worker });
    const serviceWorker = createServiceWorkerContainer({ registration });
    const reload = vi.fn();

    const result = installServiceWorkerUpdate({
      registration,
      serviceWorker,
      reload,
      activationTimeoutMs: 50,
    });

    waiting.setState('activated');

    await expect(result).resolves.toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('reports failure when the waiting worker never activates', async () => {
    const waiting = createWorker('installed');
    const registration = createRegistration({ waiting: waiting.worker });
    const serviceWorker = createServiceWorkerContainer({ registration });
    const reload = vi.fn();

    await expect(
      installServiceWorkerUpdate({
        registration,
        serviceWorker,
        reload,
        activationTimeoutMs: 1,
      }),
    ).resolves.toBe(false);

    expect(reload).not.toHaveBeenCalled();
  });
});
