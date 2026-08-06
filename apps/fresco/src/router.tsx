import { createRouter } from '@tanstack/react-router';

import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    scrollRestoration: true,
  });
}

/**
 * `interface`, not `type`, despite the repo convention in
 * `apps/fresco/CLAUDE.md`: TanStack Router's `Register` is declaration-merged,
 * and only an interface merges. `oxlint --fix` rewrites this to a type alias,
 * which turns into `TS2300: Duplicate identifier 'Register'` — so the fixer
 * silently breaks the build every time it runs over this file.
 */
declare module '@tanstack/react-router' {
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
