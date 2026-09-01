import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { TeamInvitationIdSchema } from '@codaco/studio-rpc';

import { queryClient as applicationQueryClient } from './lib/queryClient.ts';
import {
  ServerUnreachableError,
  sessionQueryOptions,
  setUnauthorizedResponseHandler,
} from './lib/session.ts';
import AcceptInvitation from './routes/AcceptInvitation.tsx';
import AppLayout from './routes/AppLayout.tsx';
import Editor from './routes/Editor.tsx';
import ErrorScreen from './routes/ErrorScreen.tsx';
import Home from './routes/Home.tsx';
import SignIn from './routes/SignIn.tsx';
import TeamActivity from './routes/TeamActivity.tsx';

/**
 * Everything a guard or a loader may read (§6.1). Nothing that can go stale
 * belongs here: the session is a query, so a guard asks the client for it
 * rather than reading a value frozen when the router was built.
 */
type ShellContext = {
  queryClient: QueryClient;
};

function RootLayout() {
  return (
    <DialogProvider>
      <Outlet />
    </DialogProvider>
  );
}

const rootRoute = createRootRouteWithContext<ShellContext>()({
  component: RootLayout,
});

// One deployable serves four products, and the first thing the tree encodes is
// which of the four a route belongs to (§3, §5.3). Chrome is a property of
// route position: a route inherits its shell from the branch it sits on, so
// moving a route between branches is the only way to change its chrome, and
// the app shell can never leak into a participant's interview.
//
// Site (marketing) and participant (the interview runtime) have no routes yet;
// their content is owned by later slices. The branches exist so those routes
// are added in one place, under chrome that is already decided.

/** Marketing: `SiteNavigation` + `SiteFooter`, signed out, managed only. */
const siteLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'site',
});

/** Single-task screens: a centred panel and no navigation. */
const focusedLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'focused',
});

/** The interview owns the viewport: no chrome at all. */
const participantLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'participant',
});

const signInRoute = createRoute({
  getParentRoute: () => focusedLayoutRoute,
  path: '/sign-in',
  validateSearch: (search): { error?: string; invitationId?: string } => {
    const invitationId = TeamInvitationIdSchema.safeParse(search.invitationId);
    return {
      ...(typeof search.error === 'string' ? { error: search.error } : {}),
      ...(invitationId.success ? { invitationId: invitationId.data } : {}),
    };
  },
  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient
      .fetchQuery(sessionQueryOptions)
      .catch((error: unknown) => {
        // This guard's only question is "are you already signed in?". An
        // unreachable server cannot answer it, and not knowing is no reason to
        // replace the sign-in page with the error screen.
        if (error instanceof ServerUnreachableError) return undefined;
        throw error;
      });
    if (session !== 'signedIn') return;
    throw search.invitationId
      ? redirect({
          to: '/invitations/$invitationId',
          params: { invitationId: search.invitationId },
        })
      : redirect({ to: '/' });
  },
  component: SignIn,
});

const invitationRoute = createRoute({
  getParentRoute: () => focusedLayoutRoute,
  path: '/invitations/$invitationId',
  component: () => {
    const { invitationId } = invitationRoute.useParams();
    return <AcceptInvitation invitationId={invitationId} />;
  },
});

/** Header and sidebar; authenticated. The session guard lives here. */
const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ context }) => {
    // `fetchQuery` answers from the cache while the query is fresh, so the
    // whole authenticated tree costs one request rather than one per
    // navigation — and it re-asks once the query has been invalidated, which
    // `ensureQueryData` would not.
    const session = await context.queryClient.fetchQuery(sessionQueryOptions);
    if (session === 'signedOut') {
      throw redirect({ to: '/sign-in' });
    }
    // An unreachable server throws ServerUnreachableError out of the query and
    // out of this guard, so the router renders its defaultErrorComponent
    // rather than bouncing a possibly-still-authenticated researcher to the
    // sign-in page.
  },
  component: AppLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/',
  component: Home,
});

const editorRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/teams/$teamId/protocols/$protocolId/drafts/$draftId',
  component: Editor,
});

const teamActivityRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/teams/$teamId/activity',
  component: TeamActivity,
});

const routeTree = rootRoute.addChildren([
  siteLayoutRoute,
  focusedLayoutRoute.addChildren([signInRoute, invitationRoute]),
  participantLayoutRoute,
  appLayoutRoute.addChildren([indexRoute, editorRoute, teamActivityRoute]),
]);

export function createAppRouter(
  history?: RouterHistory,
  queryClient: QueryClient = applicationQueryClient,
) {
  const router = createRouter({
    routeTree,
    history,
    context: { queryClient },
    defaultErrorComponent: ErrorScreen,
    // Preloading on intent is safe because every guard and loader is a pure
    // read; `defaultPreloadStaleTime: 0` hands freshness back to TanStack
    // Query, so a hover re-runs the guard but not the request (§6.2).
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  });

  setUnauthorizedResponseHandler(async () => {
    // A procedure answering 401 makes the cached session a lie, but it cannot
    // say which lie: only /api/auth/* can tell signed-out from unreachable
    // from no-database. So mark it invalid without refetching here, then let
    // the guards re-ask on the spot rather than at the next navigation.
    await queryClient.invalidateQueries({
      queryKey: sessionQueryOptions.queryKey,
      refetchType: 'none',
    });
    await router.invalidate();
  });

  return router;
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
