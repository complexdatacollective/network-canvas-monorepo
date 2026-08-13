import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';

import { authClient } from './lib/auth.ts';
import AppLayout from './routes/AppLayout.tsx';
import ErrorScreen, { ServerUnreachableError } from './routes/ErrorScreen.tsx';
import Home from './routes/Home.tsx';
import SignIn from './routes/SignIn.tsx';

/**
 * One session probe with three honest outcomes: signed in, signed out, or
 * "couldn't tell". Guards must not conflate the last two — a briefly
 * unreachable server is not a sign-out.
 */
async function probeSession(): Promise<
  'signedIn' | 'signedOut' | 'unreachable'
> {
  try {
    const { data, error } = await authClient.getSession();
    // A server with no database answers /api/auth/* with 503 — the supported
    // degradation, not a failure. That is a reachable server saying nobody is
    // signed in, so it belongs on the sign-in page, which reads the same
    // capability from the status query and explains it.
    if (error) return error.status === 503 ? 'signedOut' : 'unreachable';
    return data ? 'signedIn' : 'signedOut';
  } catch {
    return 'unreachable';
  }
}

const rootRoute = createRootRoute({
  component: Outlet,
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  validateSearch: (search): { error?: string } =>
    typeof search.error === 'string' ? { error: search.error } : {},
  // A signed-in visitor has no business here; an unreachable server still
  // renders the page (it degrades to the form, which will fail loudly).
  beforeLoad: async () => {
    if ((await probeSession()) === 'signedIn') {
      throw redirect({ to: '/' });
    }
  },
  component: SignIn,
});

// Pathless layout guarding everything that isn't the sign-in page: Studio
// has no anonymous surface.
const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  beforeLoad: async () => {
    const session = await probeSession();
    if (session === 'signedOut') {
      throw redirect({ to: '/sign-in' });
    }
    if (session === 'unreachable') {
      // Renders the router's defaultErrorComponent rather than bouncing a
      // possibly-still-authenticated user to the sign-in page.
      throw new ServerUnreachableError();
    }
  },
  component: AppLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/',
  component: Home,
});

const routeTree = rootRoute.addChildren([
  signInRoute,
  authenticatedRoute.addChildren([indexRoute]),
]);

/** Tests pass a memory history; the app uses the browser default. */
export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    defaultErrorComponent: ErrorScreen,
  });
}

export const router = createAppRouter();

declare module '@tanstack/react-router' {
  // Interface merging is the documented registration mechanism for router
  // type inference; a type alias cannot merge.
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface Register {
    router: typeof router;
  }
}
