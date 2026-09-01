import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { UserRound } from 'lucide-react';
import { useState } from 'react';

import { Alert } from '@codaco/fresco-ui/Alert';
import { IconButton } from '@codaco/fresco-ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@codaco/fresco-ui/DropdownMenu';

import { closeStudioEditorSessions } from '../editor/sessionLifecycle.ts';
import { authClient } from '../lib/auth.ts';

/**
 * The header's account menu (§5.5): profile, language, sign out.
 *
 * Profile and Language are ordinary router navigations into the account area,
 * which means the editor's dirty-state blocker applies to them without
 * anything here knowing about it (§6.5). Sign out cannot be one — it ends the
 * session — so it runs the sequence below instead.
 *
 * That sequence is the one `AppLayout` performed, moved verbatim. Its ordering
 * is load-bearing and each step's comment says why.
 */
export default function AccountMenu() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [signOutFailed, setSignOutFailed] = useState(false);

  const signOut = () => {
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
  };

  return (
    <>
      {signOutFailed && (
        <Alert variant="destructive">
          Sign-out did not complete. Try again.
        </Alert>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <IconButton
              size="sm"
              variant="text"
              aria-label="Account"
              icon={<UserRound aria-hidden />}
            />
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link to="/account" />}>
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/account/language" />}>
            Language
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
