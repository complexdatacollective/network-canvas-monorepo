import {
  type BundledLegacyArchitect,
  getBundledLegacyArchitect,
} from './legacyArchitect';
import { reportError } from './reportError';

// Architect 8, served at /v8/ beside this app, has its own service worker and
// precache, and this app's worker never answers for /v8/ (see vite.config.ts).
// Left to itself, Architect 8 would work offline only once the researcher had
// opened it online — so "Keep editing as schema 8" or "Open in Architect 8"
// would fail offline for anyone who never had. This app therefore registers
// Architect 8's worker in the background, which then downloads and keeps its
// own precache; its cache name changes only when the pin does.
//
// It must never slow this app down, so it waits until this app has rendered,
// its own worker is ready (the downloads would otherwise compete, and this
// app's is the one that matters), and the browser is idle.

type WorkerLike = { scriptURL: string } | null;

type RegistrationLike = {
  scope: string;
  active: WorkerLike;
  installing: WorkerLike;
};

/** The parts of `navigator.serviceWorker` this uses. */
type ServiceWorkerContainerLike = {
  ready: Promise<unknown>;
  getRegistration: (clientURL: string) => Promise<RegistrationLike | undefined>;
  register: (scriptURL: string, options: { scope: string }) => Promise<unknown>;
};

type Environment = {
  architect: BundledLegacyArchitect | null;
  serviceWorker: ServiceWorkerContainerLike | undefined;
  /** Calls back once the browser is idle (or has waited long enough). */
  whenIdle: (callback: () => void) => void;
  origin: string;
};

/** The longest an idle callback may be put off before it runs anyway. */
export const LEGACY_WORKER_IDLE_TIMEOUT_MS = 10_000;

/** Where there is no `requestIdleCallback` (Safari), wait this long instead. */
export const LEGACY_WORKER_FALLBACK_DELAY_MS = 2_000;

export const whenBrowserIdle = (callback: () => void): void => {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => callback(), {
      timeout: LEGACY_WORKER_IDLE_TIMEOUT_MS,
    });
    return;
  }
  window.setTimeout(callback, LEGACY_WORKER_FALLBACK_DELAY_MS);
};

const defaultEnvironment = (): Environment => ({
  architect: getBundledLegacyArchitect(),
  serviceWorker:
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? navigator.serviceWorker
      : undefined,
  whenIdle: whenBrowserIdle,
  origin: window.location.origin,
});

let started = false;

/**
 * Register the bundled Architect 8's worker for `/v8/`, once per page load.
 * Does nothing when this build bundles no Architect 8 or the browser has no
 * service workers, and skips the registration when `/v8/` already has a
 * worker for the same script, active or installing. Never rejects: a failure
 * is reported and leaves Architect 8 to install its worker on its first visit,
 * as it would anyway.
 */
export const registerLegacyArchitectWorker = async (
  overrides: Partial<Environment> = {},
): Promise<void> => {
  if (started) return;
  started = true;
  const { architect, serviceWorker, whenIdle, origin } = {
    ...defaultEnvironment(),
    ...overrides,
  };
  if (!architect || !serviceWorker) return;

  const scope = new URL(architect.path, origin).href;
  const scriptPath = `${architect.path}sw.js`;
  const scriptURL = new URL(scriptPath, origin).href;
  const isThisScript = (worker: WorkerLike) => worker?.scriptURL === scriptURL;

  try {
    await serviceWorker.ready;
    await new Promise<void>((resolve) => whenIdle(resolve));
    // `getRegistration` answers with the registration whose scope best covers
    // the URL — this app's own, at `/`, while Architect 8 has none — so the
    // scope is checked as well as the script.
    const existing = await serviceWorker.getRegistration(scope);
    if (
      existing?.scope === scope &&
      (isThisScript(existing.active) || isThisScript(existing.installing))
    ) {
      return;
    }
    await serviceWorker.register(scriptPath, { scope: architect.path });
  } catch (error: unknown) {
    reportError(error, { operation: 'legacy-architect-worker-register' });
  }
};
