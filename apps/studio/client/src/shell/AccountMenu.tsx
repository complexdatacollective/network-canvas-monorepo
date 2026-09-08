import { Link } from '@tanstack/react-router';
import { UserRound } from 'lucide-react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import { IconButton } from '@codaco/fresco-ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@codaco/fresco-ui/DropdownMenu';

import { navLabelMessages } from './navigationManifest.ts';
import { SIGN_OUT_FAILURE_MESSAGE, useSignOut } from './useSignOut.ts';

const messages = defineMessages({
  trigger: {
    id: 'studio.shell.accountMenuTrigger',
    defaultMessage: 'Account',
    description:
      "Accessible name of the header's account menu button (the person icon).",
  },
  signOut: {
    id: 'studio.shell.signOut',
    defaultMessage: 'Sign out',
    description: 'Menu item and button that ends the session.',
  },
});

/**
 * The header's account menu (§5.5): profile, language, sign out.
 *
 * Profile and Language are ordinary router navigations into the account area,
 * which means the editor's dirty-state blocker applies to them without
 * anything here knowing about it (§6.5). Sign out cannot be one — it ends the
 * session — so it runs `useSignOut`'s sequence instead, which is the one
 * `AppLayout` performed with §6.5's generation token added to it. This menu is
 * app-shell chrome, so its sequence returns through `/account`.
 *
 * The two destination names come from the navigation manifest's own
 * descriptors, so the menu and the account sidebar cannot call one screen two
 * things.
 */
export default function AccountMenu() {
  const intl = useAppIntl();
  const { signOut, signOutFailed } = useSignOut('/account');

  return (
    <>
      {signOutFailed && (
        <Alert variant="destructive">
          {intl.formatMessage(SIGN_OUT_FAILURE_MESSAGE)}
        </Alert>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <IconButton
              size="sm"
              variant="text"
              aria-label={intl.formatMessage(messages.trigger)}
              icon={<UserRound aria-hidden />}
            />
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link to="/account" />}>
            {intl.formatMessage(navLabelMessages.profile)}
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/account/language" />}>
            {intl.formatMessage(navLabelMessages.language)}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>
            {intl.formatMessage(messages.signOut)}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
