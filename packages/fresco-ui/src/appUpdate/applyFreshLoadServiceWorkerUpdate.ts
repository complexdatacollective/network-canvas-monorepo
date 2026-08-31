const SKIP_WAITING_MESSAGE = { type: 'SKIP_WAITING' } as const;
const DEFAULT_UPDATE_CHECK_TIMEOUT_MS = 3_000;
const DEFAULT_ACTIVATION_TIMEOUT_MS = 20_000;

export { registerPwaBuildLease } from './registerPwaBuildLease';

type ServiceWorkerContainerLike = Pick<
  ServiceWorkerContainer,
  'addEventListener' | 'controller' | 'getRegistration' | 'removeEventListener'
>;

type FreshLoadServiceWorkerUpdateOptions = {
  updateCheckTimeoutMs?: number;
  activationTimeoutMs?: number;
  serviceWorker?: ServiceWorkerContainerLike;
  shouldSkip?: () => boolean;
  /**
   * Pass `false` to activate under a boot loader without navigating. Existing
   * callers retain the historical default reload and `true` return contract.
   */
  reload?: false | (() => void);
};

type InstallServiceWorkerUpdateOptions = {
  activationTimeoutMs?: number;
  registrationTimeoutMs?: number;
  registration?: ServiceWorkerRegistration;
  serviceWorker?: ServiceWorkerContainerLike;
  reload?: () => void;
};

function getServiceWorkerContainer(): ServiceWorkerContainerLike | undefined {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return undefined;
  }
  return navigator.serviceWorker;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(fallback), timeoutMs);
    void (async () => {
      try {
        const value = await promise;
        window.clearTimeout(timeoutId);
        resolve(value);
      } catch {
        window.clearTimeout(timeoutId);
        resolve(fallback);
      }
    })();
  });
}

function waitUntilInstallable(
  worker: ServiceWorker,
  timeoutMs: number,
): Promise<ServiceWorker | null> {
  if (worker.state === 'installed' || worker.state === 'activated') {
    return Promise.resolve(worker);
  }
  if (worker.state === 'redundant') return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;

    const finish = (result: ServiceWorker | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      worker.removeEventListener('statechange', onStateChange);
      resolve(result);
    };

    const onStateChange = () => {
      if (worker.state === 'installed' || worker.state === 'activated') {
        finish(worker);
      } else if (worker.state === 'redundant') {
        finish(null);
      }
    };

    const timeoutId = window.setTimeout(() => finish(null), timeoutMs);
    worker.addEventListener('statechange', onStateChange);

    // Close the race between the state checks above and attaching the listener.
    onStateChange();
  });
}

function getPendingUpdateWorker(
  registration: ServiceWorkerRegistration,
): ServiceWorker | null {
  if (
    registration.installing &&
    registration.installing.state !== 'redundant'
  ) {
    return registration.installing;
  }
  if (registration.waiting && registration.waiting.state !== 'redundant') {
    return registration.waiting;
  }
  return null;
}

function findUpdateWorker(
  registration: ServiceWorkerRegistration,
  updateCheckTimeoutMs: number,
): Promise<ServiceWorker | null> {
  return new Promise((resolve) => {
    let settled = false;
    let postUpdateCheckId: number | undefined;

    // An installing worker supersedes a waiting worker: both can coexist while
    // a newer update replaces one that was already waiting. Keep the existing
    // worker as an offline fallback, but always complete update() before using
    // it so an online launch cannot activate deployment B under deployment C's
    // network-fetched HTML.
    const existingWorker = getPendingUpdateWorker(registration);
    const currentWorker = () =>
      getPendingUpdateWorker(registration) ?? existingWorker;

    const finish = (worker: ServiceWorker | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      if (postUpdateCheckId !== undefined) {
        window.clearTimeout(postUpdateCheckId);
      }
      registration.removeEventListener('updatefound', onUpdateFound);
      resolve(worker);
    };

    const onUpdateFound = () => {
      // updatefound belongs to the newly created installing worker. Do not
      // fall through to a pre-existing waiting worker if a browser exposes the
      // event just before it updates the registration object.
      const worker = registration.installing;
      if (worker) {
        finish(worker);
        return;
      }

      // `installing` is specified to be populated before `updatefound`, but
      // check once more in a microtask so an implementation cannot strand the
      // boot loader in that tiny ordering gap.
      window.queueMicrotask(() => {
        const deferredWorker = registration.installing;
        if (deferredWorker) finish(deferredWorker);
      });
    };

    // A timeout is uncertainty, not evidence that the pre-existing worker is
    // newest. Continue startup on the current controller instead of activating
    // stale B under network-fetched C HTML. An explicit update failure below
    // may still use B as the best offline fallback.
    const timeoutId = window.setTimeout(
      () => finish(null),
      updateCheckTimeoutMs,
    );
    registration.addEventListener('updatefound', onUpdateFound);

    void (async () => {
      try {
        await registration.update();
        if (settled) return;
        const worker = currentWorker();
        if (worker) {
          finish(worker);
          return;
        }

        // The update promise and `updatefound` are separate notifications.
        // Give the event task one turn to populate `installing` before
        // concluding that the check found no update.
        postUpdateCheckId = window.setTimeout(() => finish(currentWorker()), 0);
      } catch {
        finish(currentWorker());
      }
    })();
  });
}

function waitForActivationOrControllerChange(
  serviceWorker: ServiceWorkerContainerLike,
  waitingWorker: ServiceWorker,
  activationTimeoutMs: number,
): Promise<boolean> {
  if (waitingWorker.state === 'activated') return Promise.resolve(true);
  if (waitingWorker.state === 'redundant') return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    let settled = false;

    const finish = (activated: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      serviceWorker.removeEventListener('controllerchange', onControllerChange);
      waitingWorker.removeEventListener('statechange', onStateChange);
      resolve(activated);
    };

    const onControllerChange = () => finish(true);
    const onStateChange = () => {
      if (waitingWorker.state === 'activated') {
        finish(true);
      } else if (waitingWorker.state === 'redundant') {
        finish(false);
      }
    };

    const timeoutId = window.setTimeout(
      () => finish(false),
      activationTimeoutMs,
    );

    serviceWorker.addEventListener('controllerchange', onControllerChange, {
      once: true,
    });
    waitingWorker.addEventListener('statechange', onStateChange);

    // Close the small race between the state checks above and attaching the
    // listeners.
    onStateChange();
  });
}

// Manual installs must own the reload instead of relying on Workbox's
// `controlling` event heuristic. If another tab has already activated the
// update, there may no longer be a waiting worker; reloading still moves this
// page onto the active version.
export async function installServiceWorkerUpdate({
  activationTimeoutMs = DEFAULT_ACTIVATION_TIMEOUT_MS,
  registrationTimeoutMs = DEFAULT_UPDATE_CHECK_TIMEOUT_MS,
  registration,
  serviceWorker = getServiceWorkerContainer(),
  reload = () => window.location.reload(),
}: InstallServiceWorkerUpdateOptions = {}): Promise<boolean> {
  if (!serviceWorker) return false;

  const currentRegistration =
    registration ??
    (await withTimeout(
      serviceWorker.getRegistration(),
      registrationTimeoutMs,
      undefined,
    ));
  if (!currentRegistration) return false;

  const waitingWorker = currentRegistration.waiting;
  if (!waitingWorker) {
    reload();
    return true;
  }

  const activated = waitForActivationOrControllerChange(
    serviceWorker,
    waitingWorker,
    activationTimeoutMs,
  );
  waitingWorker.postMessage(SKIP_WAITING_MESSAGE);

  if (!(await activated)) return false;

  reload();
  return true;
}

export async function applyFreshLoadServiceWorkerUpdate({
  updateCheckTimeoutMs = DEFAULT_UPDATE_CHECK_TIMEOUT_MS,
  activationTimeoutMs = DEFAULT_ACTIVATION_TIMEOUT_MS,
  serviceWorker = getServiceWorkerContainer(),
  shouldSkip = () => false,
  reload = () => window.location.reload(),
}: FreshLoadServiceWorkerUpdateOptions = {}): Promise<boolean> {
  if (!serviceWorker || !serviceWorker.controller || shouldSkip()) {
    return false;
  }

  const registration = await withTimeout(
    serviceWorker.getRegistration(),
    updateCheckTimeoutMs,
    undefined,
  );
  if (!registration) return false;

  const discoveredWorker = await findUpdateWorker(
    registration,
    updateCheckTimeoutMs,
  );
  if (!discoveredWorker) return false;

  let waitingWorker = await waitUntilInstallable(
    discoveredWorker,
    activationTimeoutMs,
  );
  if (!waitingWorker) {
    // A newly discovered worker can fail installation and become redundant.
    // In that case the browser preserves the older waiting worker; it remains
    // the best offline update available and is safe to activate only now that
    // the newer candidate has definitively failed.
    const fallbackWorker = getPendingUpdateWorker(registration);
    if (!fallbackWorker || fallbackWorker === discoveredWorker) return false;
    waitingWorker = await waitUntilInstallable(
      fallbackWorker,
      activationTimeoutMs,
    );
  }
  if (!waitingWorker || shouldSkip()) return false;
  if (waitingWorker.state !== 'activated') {
    const activated = waitForActivationOrControllerChange(
      serviceWorker,
      waitingWorker,
      activationTimeoutMs,
    );
    waitingWorker.postMessage(SKIP_WAITING_MESSAGE);

    if (!(await activated)) return false;
  }

  // `true` historically tells boot code that this helper reloaded and startup
  // must stop. Explicit no-reload callers continue startup after activation.
  // A legacy reload-mode caller can become protected while activation is in
  // flight, so honor the predicate once more before navigating it.
  if (reload === false || shouldSkip()) return false;
  reload();
  return true;
}
