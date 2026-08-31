import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { TeamInvitationIdSchema } from '@codaco/studio-rpc';

import { authClient } from './lib/auth.ts';
import AcceptInvitation from './routes/AcceptInvitation.tsx';
import AppLayout from './routes/AppLayout.tsx';
import Editor from './routes/Editor.tsx';
import ErrorScreen, { ServerUnreachableError } from './routes/ErrorScreen.tsx';
import Home from './routes/Home.tsx';
import SignIn from './routes/SignIn.tsx';
import TeamActivity from './routes/TeamActivity.tsx';

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

function RootLayout() {
  return (
    <DialogProvider>
      <Outlet />
    </DialogProvider>
  );
}

const rootRoute = createRootRoute({ component: RootLayout });

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  validateSearch: (search): { error?: string; invitationId?: string } => {
    const invitationId = TeamInvitationIdSchema.safeParse(search.invitationId);
    return {
      ...(typeof search.error === 'string' ? { error: search.error } : {}),
      ...(invitationId.success ? { invitationId: invitationId.data } : {}),
    };
  },
  beforeLoad: async ({ search }) => {
    if ((await probeSession()) === 'signedIn') {
      throw search.invitationId
        ? redirect({
            to: '/invitations/$invitationId',
            params: { invitationId: search.invitationId },
          })
        : redirect({ to: '/' });
    }
  },
  component: SignIn,
});

const invitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invitations/$invitationId',
  component: () => {
    const { invitationId } = invitationRoute.useParams();
    return <AcceptInvitation invitationId={invitationId} />;
  },
});

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

const editorRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/teams/$teamId/protocols/$protocolId/drafts/$draftId',
  component: Editor,
});

const teamActivityRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/teams/$teamId/activity',
  component: TeamActivity,
});

const routeTree = rootRoute.addChildren([
  signInRoute,
  invitationRoute,
  authenticatedRoute.addChildren([indexRoute, editorRoute, teamActivityRoute]),
]);

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
