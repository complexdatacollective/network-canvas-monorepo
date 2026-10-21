import { APP_BASE_URL, IS_SUBPATH_BUILD, toAppPath } from '~/lib/appBase';

// What the startup update handoff in main.tsx may act on. A sub-path build
// (Interviewer 8 at /v8/) shares its origin with Interviewer 9, so both checks
// it makes have to be read relative to this build's base. At the root each is
// exactly what main.tsx did before sub-path builds existed.

/**
 * Whether `pathname` (the browser's `location.pathname`) is an interview page
 * of this app. Activating an update there would reload a running interview.
 */
export const isInterviewPagePath = (pathname: string): boolean =>
  toAppPath(pathname).startsWith('/interview/');

type ServiceWorkerContainerLike = Pick<
  ServiceWorkerContainer,
  'addEventListener' | 'controller' | 'getRegistration' | 'removeEventListener'
>;

// Narrow a service-worker container to the registration whose scope is exactly
// `baseUrl`. A sub-path build shares its origin with Interviewer 9, whose root
// worker also controls a /v8/ page until /v8/sw.js first takes over, and an
// unqualified getRegistration() from that page returns Interviewer 9's
// registration. The startup update handoff must only ever activate this
// build's own worker, never skip-wait Interviewer 9's.
export const scopeServiceWorkerContainer = (
  container: ServiceWorkerContainerLike,
  baseUrl: string,
  pageUrl: string,
): ServiceWorkerContainerLike => {
  const scope = new URL(baseUrl, pageUrl).href;
  return {
    get controller() {
      return container.controller;
    },
    addEventListener: (
      ...args: Parameters<typeof container.addEventListener>
    ) => container.addEventListener(...args),
    removeEventListener: (
      ...args: Parameters<typeof container.removeEventListener>
    ) => container.removeEventListener(...args),
    getRegistration: async () => {
      const registration = await container.getRegistration(scope);
      return registration?.scope === scope ? registration : undefined;
    },
  };
};

// The container the startup update handoff should use: `undefined` at the
// root, which keeps the helper's own default, and the base-scoped container in
// a sub-path build.
export const getAppServiceWorkerContainer = ():
  | ServiceWorkerContainerLike
  | undefined => {
  if (
    !IS_SUBPATH_BUILD ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return undefined;
  }
  return scopeServiceWorkerContainer(
    navigator.serviceWorker,
    APP_BASE_URL,
    window.location.href,
  );
};
