import { useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { Alert } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';

import { closeStudioEditorSessions } from '../editor/sessionLifecycle.ts';
import { authClient } from '../lib/auth.ts';

export default function AppLayout() {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [signOutFailed, setSignOutFailed] = useState(false);

  useEffect(() => {
    if (!isPending && !session) {
      queryClient.clear();
      void navigate({ to: '/sign-in' });
    }
  }, [isPending, session, navigate, queryClient]);

  return (
    <div className="flex h-full flex-col">
      <a
        href="#main-content"
        className="focusable bg-surface text-surface-contrast fixed top-2 left-2 z-50 -translate-y-24 rounded px-4 py-2 focus:translate-y-0"
      >
        Skip to main content
      </a>
      <header className="flex items-center justify-between gap-4 px-4 py-2">
        <Link
          className="focusable font-heading rounded font-bold no-underline"
          to="/"
        >
          Studio
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-4">
          {signOutFailed && (
            <Alert variant="destructive">
              Sign-out did not complete. Try again.
            </Alert>
          )}
          {session && (
            <span className="text-sm">
              Signed in as {session.user.name || session.user.email}
            </span>
          )}
          <Button
            size="sm"
            onClick={() => {
              setSignOutFailed(false);
              void (async () => {
                try {
                  await navigate({ to: '/' });
                  // Editor route blockers settle before navigate resolves. A
                  // cancelled discard leaves us on the editor route, so stop
                  // before closing its lease or clearing authentication.
                  if (router.state.location.pathname !== '/') return;
                  await closeStudioEditorSessions();
                  const result = await authClient.signOut();
                  // better-fetch resolves failed requests with an error field
                  // instead of throwing; a failed sign-out leaves the cookie
                  // valid, so pretending it worked would be a lie.
                  if (result.error) {
                    setSignOutFailed(true);
                    return;
                  }
                  queryClient.clear();
                  await navigate({ to: '/sign-in' });
                } catch {
                  setSignOutFailed(true);
                }
              })();
            }}
          >
            Sign out
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
