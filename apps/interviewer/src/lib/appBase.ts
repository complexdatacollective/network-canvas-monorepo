// The URL path this build is served under: `/` for the root app, `/v8/` when
// Interviewer 8 ships inside Interviewer 9's deploy (INTERVIEWER_BASE_PATH,
// read in vite.renderer.config.ts through scripts/buildtime/app-base-path.mjs).
// wouter's <Router base> handles every <Link>, useLocation and setLocation;
// these helpers cover the paths that bypass it — window.location reads that
// are compared with app routes. At the root each of them is the identity.

export type AppBase = {
  /** `import.meta.env.BASE_URL`: `/` or `/segment/`. */
  baseUrl: string;
  /** wouter's `base`: `''` at the root, else the base without its trailing slash. */
  routerBase: string;
  /** Prefix an app path (`/data`) with the base for the browser. */
  toBrowserPath: (path: string) => string;
  /** Strip the base from a browser path; app paths pass through unchanged. */
  toAppPath: (path: string) => string;
};

export const createAppBase = (baseUrl: string): AppBase => {
  const routerBase = baseUrl === '/' ? '' : baseUrl.replace(/\/$/, '');
  // Anchored on a path boundary so `/v8`, `/v8?x` and `/v8#y` strip too, while
  // a path that merely starts with the same characters (`/v80`) does not.
  const basePattern =
    routerBase === ''
      ? null
      : new RegExp(
          `^${routerBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[/?#]|$)`,
        );

  return {
    baseUrl,
    routerBase,
    toBrowserPath: (path) => `${routerBase}${path}`,
    toAppPath: (path) => {
      if (!basePattern?.test(path)) return path;
      const stripped = path.replace(basePattern, '');
      return stripped.startsWith('/') ? stripped : `/${stripped}`;
    },
  };
};

const appBase = createAppBase(import.meta.env.BASE_URL);

export const APP_BASE_URL = appBase.baseUrl;
export const ROUTER_BASE = appBase.routerBase;
// Compared directly rather than read from `appBase`, so the bundler can fold it
// to a constant: code that only one kind of build runs is left out of the
// other's bundle.
export const IS_SUBPATH_BUILD = import.meta.env.BASE_URL !== '/';
export const toAppPath = appBase.toAppPath;
