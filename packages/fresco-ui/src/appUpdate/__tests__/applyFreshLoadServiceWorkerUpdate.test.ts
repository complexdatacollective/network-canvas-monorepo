import { describe, expect, it, vi } from 'vitest';

import { applyFreshLoadServiceWorkerUpdate } from '../applyFreshLoadServiceWorkerUpdate';

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

  it('activates an already waiting worker and reloads before app startup continues', async () => {
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

    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
    expect(waiting.postMessage).toHaveBeenCalledWith({
      type: 'SKIP_WAITING',
    });

    serviceWorker.dispatchControllerChange();

    await expect(result).resolves.toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('waits for an installing update to become waiting before activating it', async () => {
    const installing = createWorker('installing');
    const registration = createRegistration({ installing: installing.worker });
    const serviceWorker = createServiceWorkerContainer({ registration });
    const reload = vi.fn();

    const result = applyFreshLoadServiceWorkerUpdate({
      serviceWorker,
      reload,
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

    await expect(result).resolves.toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('continues startup when the update check fails', async () => {
    const registration = createRegistration();
    registration.update.mockRejectedValue(new Error('offline'));
    const serviceWorker = createServiceWorkerContainer({ registration });
    const reload = vi.fn();

    await expect(
      applyFreshLoadServiceWorkerUpdate({
        serviceWorker,
        reload,
        shouldSkip: () => false,
        updateCheckTimeoutMs: 50,
        activationTimeoutMs: 50,
      }),
    ).resolves.toBe(false);

    expect(reload).not.toHaveBeenCalled();
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
    const reload = vi.fn();

    await expect(
      applyFreshLoadServiceWorkerUpdate({
        serviceWorker,
        reload,
        shouldSkip: () => false,
        updateCheckTimeoutMs: 1,
        activationTimeoutMs: 50,
      }),
    ).resolves.toBe(false);

    expect(reload).not.toHaveBeenCalled();
    resolveUpdate(registration);
  });

  it('checks the skip predicate again before activating a found update', async () => {
    const waiting = createWorker('installed');
    const registration = createRegistration({ waiting: waiting.worker });
    const serviceWorker = createServiceWorkerContainer({ registration });
    const reload = vi.fn();
    const shouldSkip = vi
      .fn<() => boolean>()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    await expect(
      applyFreshLoadServiceWorkerUpdate({
        serviceWorker,
        reload,
        shouldSkip,
        updateCheckTimeoutMs: 50,
        activationTimeoutMs: 50,
      }),
    ).resolves.toBe(false);

    expect(waiting.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
