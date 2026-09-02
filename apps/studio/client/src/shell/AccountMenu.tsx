import { Link } from '@tanstack/react-router';
import { UserRound } from 'lucide-react';

import { Alert } from '@codaco/fresco-ui/Alert';
import { IconButton } from '@codaco/fresco-ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@codaco/fresco-ui/DropdownMenu';

import { SIGN_OUT_FAILURE_MESSAGE, useSignOut } from './useSignOut.ts';

/**
 * The header's account menu (§5.5): profile, language, sign out.
 *
 * Profile and Language are ordinary router navigations into the account area,
 * which means the editor's dirty-state blocker applies to them without
 * anything here knowing about it (§6.5). Sign out cannot be one — it ends the
 * session — so it runs `useSignOut`'s sequence instead, which is the one
 * `AppLayout` performed with §6.5's generation token added to it. This menu is
 * app-shell chrome, so its sequence returns through `/account`.
 */
export default function AccountMenu() {
  const { signOut, signOutFailed } = useSignOut('/account');

  return (
    <>
      {signOutFailed && (
        <Alert variant="destructive">{SIGN_OUT_FAILURE_MESSAGE}</Alert>
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
