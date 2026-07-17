const SKIP_WAITING_MESSAGE = { type: 'SKIP_WAITING' } as const;
const DEFAULT_UPDATE_CHECK_TIMEOUT_MS = 3_000;
const DEFAULT_ACTIVATION_TIMEOUT_MS = 20_000;

type ServiceWorkerContainerLike = Pick<
  ServiceWorkerContainer,
  'addEventListener' | 'controller' | 'getRegistration' | 'removeEventListener'
>;

type FreshLoadServiceWorkerUpdateOptions = {
  updateCheckTimeoutMs?: number;
  activationTimeoutMs?: number;
  serviceWorker?: ServiceWorkerContainerLike;
  reload?: () => void;
  shouldSkip?: () => boolean;
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

function waitUntilInstalled(
  worker: ServiceWorker,
): Promise<ServiceWorker | null> {
  if (worker.state === 'installed') return Promise.resolve(worker);
  if (worker.state === 'activated' || worker.state === 'redundant') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const onStateChange = () => {
      if (worker.state === 'installed') {
        worker.removeEventListener('statechange', onStateChange);
        resolve(worker);
        return;
      }

      if (worker.state === 'activated' || worker.state === 'redundant') {
        worker.removeEventListener('statechange', onStateChange);
        resolve(null);
      }
    };

    worker.addEventListener('statechange', onStateChange);
  });
}

async function findWaitingWorker(
  registration: ServiceWorkerRegistration,
  updateCheckTimeoutMs: number,
  activationTimeoutMs: number,
): Promise<ServiceWorker | null> {
  if (registration.waiting) return registration.waiting;

  const updateChecked = await withTimeout(
    registration.update(),
    updateCheckTimeoutMs,
    null,
  );
  if (!updateChecked) return null;

  if (registration.waiting) return registration.waiting;
  if (registration.installing) {
    return withTimeout(
      waitUntilInstalled(registration.installing),
      activationTimeoutMs,
      null,
    );
  }

  return null;
}

function waitForControllerChange(
  serviceWorker: ServiceWorkerContainerLike,
  activationTimeoutMs: number,
): Promise<boolean> {
  return withTimeout(
    new Promise<boolean>((resolve) => {
      const onControllerChange = () => {
        resolve(true);
      };

      serviceWorker.addEventListener('controllerchange', onControllerChange, {
        once: true,
      });
    }),
    activationTimeoutMs,
    false,
  );
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
  reload = () => window.location.reload(),
  shouldSkip = () => false,
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

  const waitingWorker = await findWaitingWorker(
    registration,
    updateCheckTimeoutMs,
    activationTimeoutMs,
  );
  if (!waitingWorker || shouldSkip()) return false;

  const controllerChange = waitForControllerChange(
    serviceWorker,
    activationTimeoutMs,
  );
  waitingWorker.postMessage(SKIP_WAITING_MESSAGE);

  if (!(await controllerChange)) return false;
  if (shouldSkip()) return false;

  reload();
  return true;
}
