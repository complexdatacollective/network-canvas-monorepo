import { Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { Alert } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';

import { authClient } from '../lib/auth.ts';

export default function AppLayout() {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const [signOutFailed, setSignOutFailed] = useState(false);

  useEffect(() => {
    if (!isPending && !session) {
      void navigate({ to: '/sign-in' });
    }
  }, [isPending, session, navigate]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-end gap-4 px-4 py-2">
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
            void authClient
              .signOut()
              .then((result) => {
                // better-fetch resolves failed requests with an error field
                // instead of throwing; a failed sign-out leaves the cookie
                // valid, so pretending it worked would be a lie.
                if (result.error) {
                  setSignOutFailed(true);
                  return;
                }
                return navigate({ to: '/sign-in' });
              })
              .catch(() => setSignOutFailed(true));
          }}
        >
          Sign out
        </Button>
      </header>
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
