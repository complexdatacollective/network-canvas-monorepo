'use client';

import {
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { Plus, Trash, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { use, useCallback, useState } from 'react';
import { z } from 'zod/mini';

import { commonMessages } from '@codaco/app-i18n/common';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import {
  AppErrorMessage,
  AppMessage,
  useAppIntl,
} from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';
import { DataTableColumnHeader } from '@codaco/fresco-ui/DataTable/ColumnHeader';
import { DataTable } from '@codaco/fresco-ui/DataTable/DataTable';
import { DataTableFloatingBar } from '@codaco/fresco-ui/DataTable/DataTableFloatingBar';
import { type StrictColumnDef } from '@codaco/fresco-ui/DataTable/types';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import { type FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  changePassword,
  checkUsernameAvailable,
  createUser,
  deleteUsers,
} from '~/actions/users';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  resetAuthForUser,
  switchToPasskeyMode,
  switchToPasswordMode,
  verifyPasskeyReauth,
} from '~/actions/webauthn';
import PasskeySettings from '~/app/dashboard/settings/_components/PasskeySettings';
import TwoFactorSettings from '~/app/dashboard/settings/_components/TwoFactorSettings';
import FormDialog from '~/components/FormDialog';
import SettingsField from '~/components/settings/SettingsField';
import { useClientDataTable } from '~/hooks/useClientDataTable';
import { describePasskeyCeremonyError } from '~/i18n/passkeyCeremony';
import { type GetUsersReturnType } from '~/queries/users';
import {
  getPasswordRules,
  passwordMessages,
  PASSWORD_MIN_LENGTH,
} from '~/utils/isStrongPassword';

const messages = defineMessages({
  deleteCount: {
    id: 'fresco.settings.UserManagement.deleteCount',
    defaultMessage:
      '{count, plural, one {Delete # user} other {Delete # users}}',
    description:
      'Confirm button of the dialog opened by Delete Selected in the users table in Settings when several accounts are selected. count is the number of researcher accounts that will be deleted.',
  },

  passwordAuth: {
    id: 'fresco.settings.users.passwordAuth',
    defaultMessage: 'Password',
    description:
      'Value in the Auth Method column of the users table in Settings: the researcher account signs in with a password only.',
  },

  passwordTwoFactor: {
    id: 'fresco.settings.users.passwordTwoFactor',
    defaultMessage: 'Password + 2FA',
    description:
      'Value in the Auth Method column of the users table in Settings: the account signs in with a password plus a two-factor authentication (2FA) code.',
  },

  passkeyAuth: {
    id: 'fresco.settings.users.passkeyAuth',
    defaultMessage: 'Passkey',
    description:
      'Value in the Auth Method column of the users table in Settings: the account signs in with a passkey (a device-based credential, not a password).',
  },

  usernameTaken: {
    id: 'fresco.settings.users.usernameTaken',
    defaultMessage: 'Username is already taken',
    description:
      'Validation error below the username field of the Add User dialog in Settings, when another researcher account already has that username.',
  },

  usernameSpaces: {
    id: 'fresco.settings.users.usernameSpaces',
    defaultMessage: 'Username cannot contain spaces',
    description:
      'Validation error below the username field of the Add User dialog in Settings, when the username contains a space.',
  },

  usernameMinimum: {
    id: 'fresco.settings.users.usernameMinimum',
    defaultMessage: 'Username must be at least 4 characters',
    description:
      'Validation error below the username field of the Add User dialog in Settings, when the username is shorter than four characters.',
  },

  copyYouCannotDeleteYourOwnAccount: {
    id: 'fresco.settings.UserManagement.copyYouCannotDeleteYourOwnAccount',
    defaultMessage: 'You cannot delete your own account',
    description:
      'Error raised when the researcher uses Delete Selected in the users table in Settings and the only selected account is their own, which cannot be deleted.',
  },
  copyDeleteUser: {
    id: 'fresco.settings.UserManagement.copyDeleteUser',
    defaultMessage: 'Delete User',
    description:
      'Title and confirm button of the dialog that asks the researcher to confirm deleting the single account selected with Delete Selected in the users table in Settings.',
  },
  copyDeleteMultipleUsers: {
    id: 'fresco.settings.UserManagement.copyDeleteMultipleUsers',
    defaultMessage: 'Delete Multiple Users',
    description:
      'Title of the dialog that asks the researcher to confirm deleting several accounts selected with Delete Selected in the users table in Settings.',
  },
  copyAreYouSureYouWantToDelete: {
    id: 'fresco.settings.UserManagement.copyAreYouSureYouWantToDelete',
    defaultMessage:
      'Are you sure you want to delete the user "{value1}"? This action cannot be undone.',
    description:
      "Body of the confirmation dialog for deleting the single account selected with Delete Selected in the users table in Settings. value1 is that account's username.",
  },
  copyAreYouSureYouWantToDelete2: {
    id: 'fresco.settings.UserManagement.copyAreYouSureYouWantToDelete2',
    defaultMessage:
      'Are you sure you want to delete {value1, plural, one {# user} other {# users}}? This action cannot be undone.',
    description:
      'Body of the confirmation dialog for deleting several accounts selected with Delete Selected in the users table in Settings. value1 is the number of researcher accounts.',
  },
  copyPasswordsDoNotMatch: {
    id: 'fresco.settings.UserManagement.copyPasswordsDoNotMatch',
    defaultMessage: 'Passwords do not match',
    description:
      'Form error shown in the Add User dialog, and in the Switch to Password Authentication dialog, in Settings, when the password and its confirmation differ.',
  },
  copyNewPasswordsDoNotMatch: {
    id: 'fresco.settings.UserManagement.copyNewPasswordsDoNotMatch',
    defaultMessage: 'New passwords do not match',
    description:
      'Form error shown in the Change Password dialog in Settings when the new password and its confirmation differ.',
  },
  copyFailedToStartRegistration: {
    id: 'fresco.settings.UserManagement.copyFailedToStartRegistration',
    defaultMessage: 'Failed to start registration',
    description:
      "Fallback form error in the Switch to Passkey Authentication dialog in Settings when the server could not prepare creating a passkey, before the browser's passkey prompt appeared.",
  },
  copyPasskeyCreationFailed: {
    id: 'fresco.settings.UserManagement.copyPasskeyCreationFailed',
    defaultMessage: 'Passkey creation failed.',
    description:
      'Fallback form error in the Switch to Passkey Authentication dialog in Settings when creating the passkey in the browser failed and no more specific message applies.',
  },
  copyFailedToStartVerification: {
    id: 'fresco.settings.UserManagement.copyFailedToStartVerification',
    defaultMessage: 'Failed to start verification',
    description:
      'Fallback error in the Switch to Password Authentication dialog in Settings when the server could not start the passkey identity check.',
  },
  copyVerificationFailed: {
    id: 'fresco.settings.UserManagement.copyVerificationFailed',
    defaultMessage: 'Verification failed',
    description:
      'Fallback error in the Switch to Password Authentication dialog in Settings when the passkey identity check in the browser failed and no more specific message applies.',
  },
  copyVerifying: {
    id: 'fresco.settings.UserManagement.copyVerifying',
    defaultMessage: 'Verifying...',
    description:
      'Label of the Verify with passkey button in the Switch to Password Authentication dialog while the passkey check is in progress.',
  },
  copyVerifyWithPasskey: {
    id: 'fresco.settings.UserManagement.copyVerifyWithPasskey',
    defaultMessage: 'Verify with passkey',
    description:
      "Button in the Switch to Password Authentication dialog in Settings; opens the browser's passkey prompt so the researcher proves who they are.",
  },
  selectAll: {
    id: 'fresco.settings.UserManagement.selectAll',
    defaultMessage: 'Select all',
    description:
      'Accessible name of the checkbox in the header of the users table in Settings that selects every row; read only by screen readers.',
  },
  selectRow: {
    id: 'fresco.settings.UserManagement.selectRow',
    defaultMessage: 'Select row',
    description:
      'Accessible name of the checkbox on each row of the users table in Settings that selects that researcher account; read only by screen readers.',
  },
  username: {
    id: 'fresco.settings.UserManagement.username',
    defaultMessage: 'Username',
    description:
      'Column heading of the users table in Settings and label of the username field in the Add User dialog; the name a researcher signs in with.',
  },
  you: {
    id: 'fresco.settings.UserManagement.you',
    defaultMessage: '(you)',
    description:
      "Small marker shown after the username of the signed-in researcher's own row in the users table in Settings.",
  },
  authMethod: {
    id: 'fresco.settings.UserManagement.authMethod',
    defaultMessage: 'Auth Method',
    description:
      'Column heading of the users table in Settings; the column says how each researcher account signs in (password, password with two-factor, or passkey).',
  },
  actions: {
    id: 'fresco.settings.UserManagement.actions',
    defaultMessage: 'Actions',
    description:
      'Column heading of the users table in Settings for the row buttons (reset authentication, delete).',
  },
  resetAuth: {
    id: 'fresco.settings.UserManagement.resetAuth',
    defaultMessage: 'Reset Auth',
    description:
      "Button in a row of the users table in Settings, for other accounts that have two-factor or passkeys, and confirm button of its dialog; removes that account's sign-in methods (verb).",
  },
  deleteUser: {
    id: 'fresco.settings.UserManagement.deleteUser',
    defaultMessage: 'Delete User',
    description:
      'Title and confirm button of the dialog opened by the Delete button in a row of the users table in Settings; asks to confirm deleting that researcher account.',
  },
  areYouSureYouWantToDelete: {
    id: 'fresco.settings.UserManagement.areYouSureYouWantToDelete',
    defaultMessage:
      'Are you sure you want to delete the user "{value1}"? This action cannot be undone.',
    description:
      'Body of the confirmation dialog opened by the Delete button in a row of the users table in Settings. value1 is the username of that researcher account.',
  },
  resetAuthentication: {
    id: 'fresco.settings.UserManagement.resetAuthentication',
    defaultMessage: 'Reset Authentication',
    description:
      "Title of the dialog that asks the researcher to confirm resetting another account's authentication, opened by Reset Auth in the users table in Settings.",
  },
  thisWillRemoveAllPasskeys2FAAnd: {
    id: 'fresco.settings.UserManagement.thisWillRemoveAllPasskeys2FAAnd',
    defaultMessage:
      'This will remove all passkeys, 2FA, and recovery codes for {value1}, and set a temporary password. They will need to set up their authentication again.',
    description:
      'Body of the Reset Authentication confirmation dialog. value1 is the username of the researcher account being reset. 2FA is two-factor authentication; recovery codes are its backup codes.',
  },
  loggedInAs: {
    id: 'fresco.settings.UserManagement.loggedInAs',
    defaultMessage: 'Logged in as:',
    description:
      "Small caption above the signed-in researcher's username at the top of the account section in Settings; ends with a colon.",
  },
  changePassword: {
    id: 'fresco.settings.UserManagement.changePassword',
    defaultMessage: 'Change Password',
    description:
      "Button in the account section of Settings that opens the dialog for changing the researcher's own password, and the title of that dialog (verb).",
  },
  securityWarning: {
    id: 'fresco.settings.UserManagement.securityWarning',
    defaultMessage: 'Security Warning',
    description:
      'Title of a warning alert in the account section of Settings, shown to a researcher who signs in with a password but has no two-factor authentication.',
  },
  yourAccountIsOnlyProtectedByA: {
    id: 'fresco.settings.UserManagement.yourAccountIsOnlyProtectedByA',
    defaultMessage:
      'Your account is only protected by a password. Enable two-factor authentication for stronger security.',
    description:
      'Body of the Security Warning alert in the account section of Settings; advises turning on two-factor authentication.',
  },
  switchToPasskeyAuthentication: {
    id: 'fresco.settings.UserManagement.switchToPasskeyAuthentication',
    defaultMessage: 'Switch to Passkey Authentication',
    description:
      "Label of a setting in the account section of Settings, and title of its dialog; changes the researcher's own account from password sign-in to passkey sign-in.",
  },
  removeYourPasswordAndTwoFactorAuthentication: {
    id: 'fresco.settings.UserManagement.removeYourPasswordAndTwoFactorAuthentication',
    defaultMessage:
      'Remove your password and two-factor authentication, and use a passkey to sign in instead.',
    description:
      'Hint under the Switch to Passkey Authentication label in Settings; says the password and two-factor authentication are removed in favour of a passkey.',
  },
  switchToPasskey: {
    id: 'fresco.settings.UserManagement.switchToPasskey',
    defaultMessage: 'Switch to Passkey',
    description:
      'Destructive button next to the Switch to Passkey Authentication setting in Settings, and confirm button of its dialog (verb).',
  },
  youAreTheOnlyUserIfYou: {
    id: 'fresco.settings.UserManagement.youAreTheOnlyUserIfYou',
    defaultMessage:
      'You are the only user. If you lose access to your passkey, you will be locked out. Consider adding another user or backing up your passkey.',
    description:
      'Info alert in the account section of Settings, shown to a passkey researcher when theirs is the only researcher account on the installation; warns of lockout if the passkey is lost.',
  },
  switchToPasswordAuthentication: {
    id: 'fresco.settings.UserManagement.switchToPasswordAuthentication',
    defaultMessage: 'Switch to Password Authentication',
    description:
      "Label of a setting in the account section of Settings, and title of its dialog; changes the researcher's own account from passkey sign-in to password sign-in.",
  },
  removeAllPasskeysAndSwitchToPassword: {
    id: 'fresco.settings.UserManagement.removeAllPasskeysAndSwitchToPassword',
    defaultMessage:
      'Remove all passkeys and switch to password-based authentication.',
    description:
      "Hint under the Switch to Password Authentication label in Settings; says all the account's passkeys are removed.",
  },
  switchToPassword: {
    id: 'fresco.settings.UserManagement.switchToPassword',
    defaultMessage: 'Switch to Password',
    description:
      'Destructive button next to the Switch to Password Authentication setting in Settings, and confirm button of its dialog (verb).',
  },
  allUsers: {
    id: 'fresco.settings.UserManagement.allUsers',
    defaultMessage: 'All Users',
    description:
      'Heading above the users table in Settings, also its accessible name; the table lists the researcher accounts of this installation.',
  },
  addUser: {
    id: 'fresco.settings.UserManagement.addUser',
    defaultMessage: 'Add User',
    description:
      'Button above the users table in Settings and title of the dialog it opens; creates a new researcher account (verb).',
  },
  noUsersCreatedYet: {
    id: 'fresco.settings.UserManagement.noUsersCreatedYet',
    defaultMessage: 'No users created yet.',
    description:
      'Text shown in place of rows when the users table in Settings is empty.',
  },
  deleteSelected: {
    id: 'fresco.settings.UserManagement.deleteSelected',
    defaultMessage: 'Delete Selected',
    description:
      'Button in the floating bar of the users table in Settings once rows are selected; starts deleting the selected researcher accounts.',
  },
  updateYourAccountPassword: {
    id: 'fresco.settings.UserManagement.updateYourAccountPassword',
    defaultMessage: 'Update your account password.',
    description:
      'Description under the title of the Change Password dialog in Settings.',
  },
  updatePassword: {
    id: 'fresco.settings.UserManagement.updatePassword',
    defaultMessage: 'Update Password',
    description:
      'Submit button of the Change Password dialog in Settings; saves the new password (verb).',
  },
  passwordUpdatedSuccessfully: {
    id: 'fresco.settings.UserManagement.passwordUpdatedSuccessfully',
    defaultMessage: 'Password updated successfully!',
    description:
      'Success message that replaces the form of the Change Password dialog in Settings for a moment after the password was changed.',
  },
  currentPassword: {
    id: 'fresco.settings.UserManagement.currentPassword',
    defaultMessage: 'Current Password',
    description:
      "Label of the field for the researcher's existing password, in the Change Password and Switch to Passkey Authentication dialogs in Settings.",
  },
  newPassword: {
    id: 'fresco.settings.UserManagement.newPassword',
    defaultMessage: 'New Password',
    description:
      'Label of the field for the password the researcher wants to use from now on, in the Change Password and Switch to Password Authentication dialogs in Settings.',
  },
  atLeast8CharactersWithLowercaseUppercase: {
    id: 'fresco.settings.UserManagement.atLeast8CharactersWithLowercaseUppercase',
    defaultMessage:
      'At least 8 characters with lowercase, uppercase, number, and symbol',
    description:
      'Hint under a new-password field (Add User, Change Password and Switch to Password dialogs in Settings) stating the password rules.',
  },
  confirmNewPassword: {
    id: 'fresco.settings.UserManagement.confirmNewPassword',
    defaultMessage: 'Confirm New Password',
    description:
      'Label of the field in which the new password is typed a second time, in the Change Password and Switch to Password Authentication dialogs in Settings.',
  },
  createUser: {
    id: 'fresco.settings.UserManagement.createUser',
    defaultMessage: 'Create User',
    description:
      'Submit button of the Add User dialog in Settings; creates the new researcher account (verb).',
  },
  atLeast4CharactersNoSpaces: {
    id: 'fresco.settings.UserManagement.atLeast4CharactersNoSpaces',
    defaultMessage: 'At least 4 characters, no spaces',
    description:
      'Hint listing the rules for the username field of the Add User dialog in Settings.',
  },
  mustBeUnique: {
    id: 'fresco.settings.UserManagement.mustBeUnique',
    defaultMessage: 'Must be unique',
    description:
      'Hint for the username field of the Add User dialog in Settings: no other researcher account may have the same username.',
  },
  password: {
    id: 'fresco.settings.UserManagement.password',
    defaultMessage: 'Password',
    description:
      'Label of the password field of the Add User dialog in Settings; the password of the account being created.',
  },
  confirmPassword: {
    id: 'fresco.settings.UserManagement.confirmPassword',
    defaultMessage: 'Confirm Password',
    description:
      'Label of the field in which the password is typed a second time, in the Add User dialog in Settings.',
  },
  temporaryPassword: {
    id: 'fresco.settings.UserManagement.temporaryPassword',
    defaultMessage: 'Temporary Password',
    description:
      "Title of the dialog shown after another account's authentication was reset in the users table in Settings; the dialog displays the temporary password.",
  },
  theUserSAuthenticationHasBeenReset: {
    id: 'fresco.settings.UserManagement.theUserSAuthenticationHasBeenReset',
    defaultMessage:
      "The user's authentication has been reset. Share this temporary password with them so they can sign in and set up their account again.",
    description:
      'Description in the Temporary Password dialog in Settings. The user is the researcher account that was reset; the researcher reading it must pass the password on to that person.',
  },
  enterYourCurrentPasswordThenRegisterA: {
    id: 'fresco.settings.UserManagement.enterYourCurrentPasswordThenRegisterA',
    defaultMessage:
      'Enter your current password, then register a passkey. Your password and two-factor authentication will be removed.',
    description:
      'Description under the title of the Switch to Passkey Authentication dialog in Settings; the researcher enters their password, then creates a passkey.',
  },
  allYourPasskeysWillBeRemovedAnd: {
    id: 'fresco.settings.UserManagement.allYourPasskeysWillBeRemovedAnd',
    defaultMessage:
      'All your passkeys will be removed and replaced with a password.',
    description:
      'Description under the title of the Switch to Password Authentication dialog in Settings; warns that every passkey of the account is removed.',
  },
  verifyYourIdentityWithAPasskeyTo: {
    id: 'fresco.settings.UserManagement.verifyYourIdentityWithAPasskeyTo',
    defaultMessage: 'Verify your identity with a passkey to continue.',
    description:
      'Instruction in the first step of the Switch to Password Authentication dialog in Settings, above the Verify with passkey button.',
  },
});

type UserRow = GetUsersReturnType[number];

type Passkey = {
  id: string;
  friendlyName: string | null;
  deviceType: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  backedUp: boolean;
};

type UserManagementProps = {
  usersPromise: Promise<GetUsersReturnType>;
  currentUserId: string;
  currentUsername: string;
  hasTwoFactorPromise: Promise<boolean>;
  passkeysPromise: Promise<Passkey[]>;
  hasPasswordPromise: Promise<boolean>;
  sandboxMode: boolean;
  /** Whether the installation requires two-factor authentication (`REQUIRE_TWO_FACTOR`). */
  twoFactorRequired: boolean;
};

// Reads a text field out of a submitted form's values. The forms require each
// of their fields, so a missing or non-text value reads as an empty string and
// fails the same checks an empty field does.
function readString(values: unknown, key: string): string {
  const value =
    typeof values === 'object' && values !== null && key in values
      ? Reflect.get(values, key)
      : undefined;
  return typeof value === 'string' ? value : '';
}

function makeUserColumns(
  intl: IntlShape,
  currentUserId: string,
  userCount: number,
  onDeleteUser: (user: UserRow) => void,
  onResetAuth: (user: UserRow) => void,
): StrictColumnDef<UserRow>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value: boolean) =>
            table.toggleAllPageRowsSelected(value)
          }
          aria-label={intl.formatMessage(messages.selectAll)}
        />
      ),
      cell: ({ row }) => {
        const isCurrentUser = row.original.id === currentUserId;
        return (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value: boolean) => row.toggleSelected(value)}
            aria-label={intl.formatMessage(messages.selectRow)}
            disabled={isCurrentUser}
          />
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: 'username',
      accessorKey: 'username',
      sortFn: 'text',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={intl.formatMessage(messages.username)}
        />
      ),
      cell: ({ row }) => {
        const isCurrentUser = row.original.id === currentUserId;
        return (
          <div
            className="flex items-center gap-2"
            data-testid={`user-row-${row.original.username}`}
          >
            <span>{row.original.username}</span>
            {isCurrentUser && (
              <span className="text-sm text-current/50">
                {intl.formatMessage(messages.you)}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'authMethod',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={intl.formatMessage(messages.authMethod)}
        />
      ),
      cell: ({ row }) => {
        const hasPasskeys = row.original.webAuthnCredentials.length > 0;
        const has2FA = row.original.totpCredential?.verified === true;

        if (hasPasskeys) return intl.formatMessage(messages.passkeyAuth);
        if (has2FA) return intl.formatMessage(messages.passwordTwoFactor);
        return intl.formatMessage(messages.passwordAuth);
      },
    },
    {
      id: 'actions',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={intl.formatMessage(messages.actions)}
        />
      ),
      cell: ({ row }) => {
        const isCurrentUser = row.original.id === currentUserId;
        const isLastUser = userCount <= 1;
        const hasAuth =
          row.original.totpCredential?.verified === true ||
          row.original.webAuthnCredentials.length > 0;
        return (
          <div className="flex gap-2">
            {hasAuth && !isCurrentUser && (
              <Button
                onClick={() => onResetAuth(row.original)}
                size="sm"
                data-testid={`reset-auth-${row.original.username}`}
              >
                {intl.formatMessage(messages.resetAuth)}
              </Button>
            )}
            <Button
              onClick={() => onDeleteUser(row.original)}
              color="destructive"
              size="sm"
              disabled={isCurrentUser || isLastUser}
              data-testid={`delete-user-${row.original.username}`}
            >
              {intl.formatMessage(commonMessages.delete)}
            </Button>
          </div>
        );
      },
    },
  ];
}

export default function UserManagement({
  usersPromise,
  currentUserId,
  currentUsername,
  hasTwoFactorPromise,
  passkeysPromise,
  hasPasswordPromise,
  sandboxMode,
  twoFactorRequired,
}: UserManagementProps) {
  'use no memo';

  const intl = useAppIntl();
  const usernameSchema = z
    .string({ error: createMessageError(messages.usernameMinimum) })
    .check(z.minLength(4, createMessageError(messages.usernameMinimum)))
    .check(
      z.refine(
        (s) => !s.includes(' '),
        createMessageError(messages.usernameSpaces),
      ),
    );

  const usernameUniqueSchema = z
    .string({ error: createMessageError(messages.usernameMinimum) })
    .check(
      z.refine(async (username) => {
        if (!username || username.length < 4 || username.includes(' ')) {
          return true; // Let the basic validation handle these cases
        }
        const result = await checkUsernameAvailable(username);
        return result.available;
      }, createMessageError(messages.usernameTaken)),
    );

  // Built from the shared rule in ~/utils/isStrongPassword rather than restating
  // it: the server enforces the same rule through `strongPasswordSchema`, which
  // cannot be imported here (schemas/ is server-only, and client code uses
  // zod/mini). Each check stays separate so the form reports precisely which
  // requirement is unmet.
  const passwordSchema = z
    .string({ error: createMessageError(passwordMessages.strong) })
    .check(
      z.minLength(
        PASSWORD_MIN_LENGTH,
        createMessageError(passwordMessages.minimum, {
          count: PASSWORD_MIN_LENGTH,
        }),
      ),
      ...getPasswordRules(createMessageError).map(({ pattern, message }) =>
        z.regex(pattern, message),
      ),
    );

  // TanStack Table: consumers must also opt out so React Compiler doesn't memoize JSX that depends on the table ref.

  const router = useRouter();
  const users = use(usersPromise);
  const hasTwoFactor = use(hasTwoFactorPromise);
  const initialPasskeys = use(passkeysPromise);
  const hasPassword = use(hasPasswordPromise);
  const [isCreating, setIsCreating] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSwitchToPasskey, setShowSwitchToPasskey] = useState(false);
  const [showSwitchToPassword, setShowSwitchToPassword] = useState(false);
  const [switchToPasswordReauthed, setSwitchToPasswordReauthed] =
    useState(false);
  const [switchToPasswordReauthError, setSwitchToPasswordReauthError] =
    useState<string | null>(null);
  const [switchToPasswordReauthLoading, setSwitchToPasswordReauthLoading] =
    useState(false);

  const { confirm } = useDialog();

  const doDeleteUsers = useCallback(
    async (usersToDelete: UserRow[]) => {
      const ids = usersToDelete.map((u) => u.id);
      const result = await deleteUsers({ ids });

      if (result.error) {
        setError(result.error);
        return;
      }

      router.refresh();
    },
    [router],
  );

  const handleDeleteUser = useCallback(
    (user: UserRow) => {
      void confirm({
        title: <AppMessage message={messages.deleteUser} />,
        description: (
          <AppMessage
            message={messages.areYouSureYouWantToDelete}
            values={{
              value1: user.username,
            }}
          />
        ),
        confirmLabel: <AppMessage message={messages.deleteUser} />,
        intent: 'destructive',
        onConfirm: () => doDeleteUsers([user]),
      });
    },
    [confirm, doDeleteUsers],
  );

  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const handleResetAuth = useCallback(
    (user: UserRow) => {
      void confirm({
        title: <AppMessage message={messages.resetAuthentication} />,
        description: (
          <AppMessage
            message={messages.thisWillRemoveAllPasskeys2FAAnd}
            values={{ value1: user.username }}
          />
        ),
        confirmLabel: <AppMessage message={messages.resetAuth} />,
        intent: 'destructive',
        onConfirm: async () => {
          const result = await resetAuthForUser(user.id);
          if (result.error) {
            setError(result.error);
          } else if (result.data?.temporaryPassword) {
            setTempPassword(result.data.temporaryPassword);
          }
        },
      });
    },
    [confirm],
  );

  const columns = makeUserColumns(
    intl,
    currentUserId,
    users.length,
    handleDeleteUser,
    handleResetAuth,
  );

  const handleDeleteSelected = useCallback(
    (selectedUsers: UserRow[]) => {
      const deletableUsers = selectedUsers.filter(
        (user) => user.id !== currentUserId,
      );

      if (deletableUsers.length === 0) {
        setError(
          createMessageError(messages.copyYouCannotDeleteYourOwnAccount),
        );
        return;
      }

      const isSingle = deletableUsers.length === 1;
      void confirm({
        title: isSingle ? (
          <AppMessage message={messages.copyDeleteUser} />
        ) : (
          <AppMessage message={messages.copyDeleteMultipleUsers} />
        ),
        description: isSingle ? (
          <AppMessage
            message={messages.copyAreYouSureYouWantToDelete}
            values={{
              value1: deletableUsers[0]?.username,
            }}
          />
        ) : (
          <AppMessage
            message={messages.copyAreYouSureYouWantToDelete2}
            values={{
              value1: deletableUsers.length,
            }}
          />
        ),
        confirmLabel: isSingle ? (
          <AppMessage message={messages.copyDeleteUser} />
        ) : (
          <AppMessage
            message={messages.deleteCount}
            values={{
              count: deletableUsers.length,
            }}
          />
        ),
        intent: 'destructive',
        onConfirm: () => doDeleteUsers(deletableUsers),
      });
    },
    [currentUserId, confirm, doDeleteUsers],
  );

  const { table } = useClientDataTable({
    data: users,
    columns,
    enablePagination: false,
    enableRowSelection: (row) => row.original.id !== currentUserId,
  });

  const handleCreateUser = async (
    values: unknown,
  ): Promise<FormSubmissionResult> => {
    setError(null);

    const username = readString(values, 'username');
    const password = readString(values, 'password');
    const confirmPassword = readString(values, 'confirmPassword');

    if (password !== confirmPassword) {
      return {
        success: false,
        formErrors: [createMessageError(messages.copyPasswordsDoNotMatch)],
      };
    }

    const result = await createUser({ username, password, confirmPassword });

    if (result.error) {
      return {
        success: false,
        formErrors: [result.error],
      };
    }

    setIsCreating(false);
    router.refresh();
    return { success: true };
  };

  const handleChangePassword = async (
    values: unknown,
  ): Promise<FormSubmissionResult> => {
    const currentPassword = readString(values, 'currentPassword');
    const newPassword = readString(values, 'newPassword');
    const confirmNewPassword = readString(values, 'confirmNewPassword');

    if (newPassword !== confirmNewPassword) {
      return {
        success: false,
        formErrors: [createMessageError(messages.copyNewPasswordsDoNotMatch)],
      };
    }

    const result = await changePassword({
      currentPassword,
      newPassword,
      confirmNewPassword,
    });

    if (result.error) {
      return {
        success: false,
        formErrors: [result.error],
      };
    }

    setPasswordChangeSuccess(true);
    setTimeout(() => {
      setIsChangingPassword(false);
      setPasswordChangeSuccess(false);
    }, 1500);

    return { success: true };
  };

  const handleSwitchToPasskey = async (
    values: unknown,
  ): Promise<FormSubmissionResult> => {
    const currentPassword = readString(values, 'currentPassword');

    const { error: genError, data } = await generateRegistrationOptions();
    if (genError || !data) {
      return {
        success: false,
        formErrors: [
          genError ??
            createMessageError(messages.copyFailedToStartRegistration),
        ],
      };
    }

    let credential;
    try {
      credential = await startRegistration({ optionsJSON: data.options });
    } catch (e) {
      return {
        success: false,
        formErrors: [
          describePasskeyCeremonyError(
            e,
            'registration',
            messages.copyPasskeyCreationFailed,
          ),
        ],
      };
    }

    const result = await switchToPasskeyMode({ currentPassword, credential });

    if (result.error) {
      return { success: false, formErrors: [result.error] };
    }

    setShowSwitchToPasskey(false);
    router.refresh();
    return { success: true };
  };

  const handleSwitchToPasswordReauth = async () => {
    setSwitchToPasswordReauthError(null);
    setSwitchToPasswordReauthLoading(true);

    try {
      const { error: genError, data: regData } =
        await generateAuthenticationOptions();
      if (genError || !regData) {
        setSwitchToPasswordReauthError(
          genError ??
            createMessageError(messages.copyFailedToStartVerification),
        );
        return;
      }

      const credential = await startAuthentication({
        optionsJSON: regData.options,
      });

      const result = await verifyPasskeyReauth({ credential });

      if (result.error) {
        setSwitchToPasswordReauthError(result.error);
        return;
      }

      setSwitchToPasswordReauthed(true);
    } catch (e) {
      setSwitchToPasswordReauthError(
        describePasskeyCeremonyError(
          e,
          'reauth',
          messages.copyVerificationFailed,
        ),
      );
    } finally {
      // It holds the dialog open, so it must clear however this ends.
      setSwitchToPasswordReauthLoading(false);
    }
  };

  const handleSwitchToPassword = async (
    values: unknown,
  ): Promise<FormSubmissionResult> => {
    const newPassword = readString(values, 'newPassword');
    const confirmNewPassword = readString(values, 'confirmNewPassword');

    if (newPassword !== confirmNewPassword) {
      return {
        success: false,
        formErrors: [createMessageError(messages.copyPasswordsDoNotMatch)],
      };
    }

    const result = await switchToPasswordMode(newPassword);

    if (result.error) {
      return { success: false, formErrors: [result.error] };
    }

    setShowSwitchToPassword(false);
    setSwitchToPasswordReauthed(false);
    router.refresh();
    return { success: true };
  };

  return (
    <div className="space-y-6">
      <Surface className="mt-2 divide-y divide-current/10 p-6" spacing="sm">
        <div className="flex flex-col justify-between gap-4 pb-4">
          <div className="tablet-landscape:flex-row tablet-landscape:items-center tablet-landscape:justify-between flex flex-col gap-4 pb-4">
            <div className="tablet-landscape:gap-6 flex items-center gap-4">
              <div className="bg-surface-2 text-surface-2-contrast tablet-landscape:size-14 inset-surface flex size-10 shrink-0 items-center justify-center rounded-full">
                <User className="tablet-landscape:size-8 size-5" />
              </div>
              <div className="min-w-0">
                <Paragraph intent="smallText" margin="none">
                  {intl.formatMessage(messages.loggedInAs)}
                </Paragraph>
                <Heading level="h4" margin="none">
                  {currentUsername}
                </Heading>
              </div>
            </div>
            {hasPassword && !sandboxMode && (
              <Button
                onClick={() => setIsChangingPassword(true)}
                size="sm"
                className="tablet-landscape:w-auto w-full"
                color="primary"
              >
                {intl.formatMessage(messages.changePassword)}
              </Button>
            )}
          </div>
          {hasPassword && !hasTwoFactor && !sandboxMode && (
            <Alert variant="warning" className="my-0">
              <AlertTitle>
                {intl.formatMessage(messages.securityWarning)}
              </AlertTitle>
              <AlertDescription>
                {intl.formatMessage(messages.yourAccountIsOnlyProtectedByA)}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {hasPassword ? (
          <>
            <TwoFactorSettings
              hasTwoFactor={hasTwoFactor}
              userCount={users.length}
              sandboxMode={sandboxMode}
              twoFactorRequired={twoFactorRequired}
            />
            {!sandboxMode && (
              <SettingsField
                label={intl.formatMessage(
                  messages.switchToPasskeyAuthentication,
                )}
                description={intl.formatMessage(
                  messages.removeYourPasswordAndTwoFactorAuthentication,
                )}
                control={
                  <Button
                    onClick={() => setShowSwitchToPasskey(true)}
                    size="sm"
                    color="destructive"
                  >
                    {intl.formatMessage(messages.switchToPasskey)}
                  </Button>
                }
              />
            )}
          </>
        ) : (
          <>
            <PasskeySettings
              initialPasskeys={initialPasskeys}
              sandboxMode={sandboxMode}
              hasPassword={hasPassword}
            />
            {users.length === 1 && (
              <div className="py-4">
                <Alert variant="info" className="my-0">
                  <AlertDescription>
                    {intl.formatMessage(messages.youAreTheOnlyUserIfYou)}
                  </AlertDescription>
                </Alert>
              </div>
            )}
            {!sandboxMode && (
              <SettingsField
                label={intl.formatMessage(
                  messages.switchToPasswordAuthentication,
                )}
                description={intl.formatMessage(
                  messages.removeAllPasskeysAndSwitchToPassword,
                )}
                control={
                  <Button
                    onClick={() => setShowSwitchToPassword(true)}
                    size="sm"
                    color="destructive"
                  >
                    {intl.formatMessage(messages.switchToPassword)}
                  </Button>
                }
              />
            )}
          </>
        )}
      </Surface>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Heading level="label">
            {intl.formatMessage(messages.allUsers)}
          </Heading>
          <Button
            onClick={() => setIsCreating(true)}
            size="sm"
            color="primary"
            icon={<Plus />}
            className="shrink-0"
          >
            {intl.formatMessage(messages.addUser)}
          </Button>
        </div>

        <DataTable
          table={table}
          aria-label={intl.formatMessage(messages.allUsers)}
          emptyText={intl.formatMessage(messages.noUsersCreatedYet)}
          showPagination={false}
          floatingBar={
            <DataTableFloatingBar table={table}>
              <Button
                onClick={() =>
                  handleDeleteSelected(
                    table.getSelectedRowModel().rows.map((r) => r.original),
                  )
                }
                color="destructive"
                icon={<Trash className="size-4" />}
              >
                {intl.formatMessage(messages.deleteSelected)}
              </Button>
            </DataTableFloatingBar>
          }
        />
      </div>
      <FormStoreProvider>
        <FormDialog
          open={isChangingPassword}
          closeDialog={() => {
            setIsChangingPassword(false);
            setPasswordChangeSuccess(false);
          }}
          title={intl.formatMessage(messages.changePassword)}
          description={intl.formatMessage(messages.updateYourAccountPassword)}
          renderFooter={(heldOpen) =>
            passwordChangeSuccess ? null : (
              <>
                <Button
                  type="button"
                  disabled={heldOpen}
                  onClick={() => {
                    setIsChangingPassword(false);
                    setPasswordChangeSuccess(false);
                  }}
                >
                  {intl.formatMessage(commonMessages.cancel)}
                </Button>
                <SubmitButton form="changePasswordForm">
                  {intl.formatMessage(messages.updatePassword)}
                </SubmitButton>
              </>
            )
          }
        >
          {passwordChangeSuccess ? (
            <div className="text-success text-center">
              {intl.formatMessage(messages.passwordUpdatedSuccessfully)}
            </div>
          ) : (
            <FormWithoutProvider
              onSubmit={handleChangePassword}
              id="changePasswordForm"
            >
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={currentUsername}
                readOnly
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
              />
              <Field
                name="currentPassword"
                label={intl.formatMessage(messages.currentPassword)}
                component={PasswordField}
                required
                autoComplete="current-password"
              />
              <Field
                name="newPassword"
                label={intl.formatMessage(messages.newPassword)}
                component={PasswordField}
                showStrengthMeter
                required
                autoComplete="new-password"
                custom={{
                  schema: passwordSchema,
                  hint: intl.formatMessage(
                    messages.atLeast8CharactersWithLowercaseUppercase,
                  ),
                }}
              />
              <Field
                name="confirmNewPassword"
                label={intl.formatMessage(messages.confirmNewPassword)}
                component={PasswordField}
                required
                autoComplete="new-password"
                sameAs="newPassword"
              />
            </FormWithoutProvider>
          )}
        </FormDialog>
      </FormStoreProvider>
      {/* Create User Dialog */}
      <FormStoreProvider>
        <FormDialog
          open={isCreating}
          closeDialog={() => {
            setIsCreating(false);
            setError(null);
          }}
          title={intl.formatMessage(messages.addUser)}
          renderFooter={(heldOpen) => (
            <>
              <Button
                type="button"
                disabled={heldOpen}
                onClick={() => {
                  setIsCreating(false);
                  setError(null);
                }}
              >
                {intl.formatMessage(commonMessages.cancel)}
              </Button>
              <SubmitButton form="createUserForm">
                {intl.formatMessage(messages.createUser)}
              </SubmitButton>
            </>
          )}
        >
          <FormWithoutProvider onSubmit={handleCreateUser} id="createUserForm">
            {error && (
              <div className="text-destructive mb-4 text-sm">
                <AppErrorMessage error={error} />
              </div>
            )}
            <Field
              name="username"
              label={intl.formatMessage(messages.username)}
              component={InputField}
              required
              autoComplete="off"
              showValidationHints
              validateOnChange
              validateOnChangeDelay={500}
              custom={[
                {
                  schema: usernameSchema,
                  hint: intl.formatMessage(messages.atLeast4CharactersNoSpaces),
                },
                {
                  schema: usernameUniqueSchema,
                  hint: intl.formatMessage(messages.mustBeUnique),
                },
              ]}
              autoFocus
            />
            <Field
              name="password"
              label={intl.formatMessage(messages.password)}
              component={PasswordField}
              showStrengthMeter
              showValidationHints
              required
              autoComplete="off"
              custom={{
                schema: passwordSchema,
                hint: intl.formatMessage(
                  messages.atLeast8CharactersWithLowercaseUppercase,
                ),
              }}
            />
            <Field
              name="confirmPassword"
              label={intl.formatMessage(messages.confirmPassword)}
              component={PasswordField}
              required
              autoComplete="off"
            />
          </FormWithoutProvider>
        </FormDialog>
      </FormStoreProvider>
      <Dialog
        open={tempPassword !== null}
        closeDialog={() => setTempPassword(null)}
        title={intl.formatMessage(messages.temporaryPassword)}
        description={intl.formatMessage(
          messages.theUserSAuthenticationHasBeenReset,
        )}
        footer={
          <Button color="primary" onClick={() => setTempPassword(null)}>
            {intl.formatMessage(commonMessages.done)}
          </Button>
        }
      >
        <div className="bg-surface-1 rounded p-4 text-center">
          <code className="font-monospace text-lg tracking-wider">
            {tempPassword}
          </code>
        </div>
      </Dialog>
      {/* Switch to Passkey Dialog */}
      <FormStoreProvider>
        <FormDialog
          open={showSwitchToPasskey}
          closeDialog={() => setShowSwitchToPasskey(false)}
          title={intl.formatMessage(messages.switchToPasskeyAuthentication)}
          description={intl.formatMessage(
            messages.enterYourCurrentPasswordThenRegisterA,
          )}
          renderFooter={(heldOpen) => (
            <>
              <Button
                type="button"
                disabled={heldOpen}
                onClick={() => setShowSwitchToPasskey(false)}
              >
                {intl.formatMessage(commonMessages.cancel)}
              </Button>
              <SubmitButton form="switchToPasskeyForm" color="destructive">
                {intl.formatMessage(messages.switchToPasskey)}
              </SubmitButton>
            </>
          )}
        >
          <FormWithoutProvider
            onSubmit={handleSwitchToPasskey}
            id="switchToPasskeyForm"
          >
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={currentUsername}
              readOnly
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
            />
            <Field
              name="currentPassword"
              label={intl.formatMessage(messages.currentPassword)}
              component={PasswordField}
              required
              autoComplete="current-password"
            />
          </FormWithoutProvider>
        </FormDialog>
      </FormStoreProvider>
      {/* Switch to Password Dialog */}
      <FormStoreProvider>
        <FormDialog
          open={showSwitchToPassword}
          // The passkey re-authentication finishes once started, and would then
          // mark this dialog verified for its next opening, so it holds the
          // dialog open just as the password form's submission does.
          busy={switchToPasswordReauthLoading}
          closeDialog={() => {
            setShowSwitchToPassword(false);
            setSwitchToPasswordReauthed(false);
            setSwitchToPasswordReauthError(null);
          }}
          title={intl.formatMessage(messages.switchToPasswordAuthentication)}
          description={intl.formatMessage(
            messages.allYourPasskeysWillBeRemovedAnd,
          )}
          renderFooter={(heldOpen) =>
            switchToPasswordReauthed ? (
              <>
                <Button
                  type="button"
                  disabled={heldOpen}
                  onClick={() => {
                    setShowSwitchToPassword(false);
                    setSwitchToPasswordReauthed(false);
                    setSwitchToPasswordReauthError(null);
                  }}
                >
                  {intl.formatMessage(commonMessages.cancel)}
                </Button>
                <SubmitButton form="switchToPasswordForm" color="destructive">
                  {intl.formatMessage(messages.switchToPassword)}
                </SubmitButton>
              </>
            ) : null
          }
        >
          {switchToPasswordReauthed ? (
            <FormWithoutProvider
              onSubmit={handleSwitchToPassword}
              id="switchToPasswordForm"
            >
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={currentUsername}
                readOnly
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
              />
              <Field
                name="newPassword"
                label={intl.formatMessage(messages.newPassword)}
                component={PasswordField}
                showStrengthMeter
                required
                autoComplete="new-password"
                custom={{
                  schema: passwordSchema,
                  hint: intl.formatMessage(
                    messages.atLeast8CharactersWithLowercaseUppercase,
                  ),
                }}
              />
              <Field
                name="confirmNewPassword"
                label={intl.formatMessage(messages.confirmNewPassword)}
                component={PasswordField}
                required
                autoComplete="new-password"
                sameAs="newPassword"
              />
            </FormWithoutProvider>
          ) : (
            <div className="flex flex-col items-center gap-4 py-4">
              <Paragraph className="text-center">
                {intl.formatMessage(messages.verifyYourIdentityWithAPasskeyTo)}
              </Paragraph>
              {switchToPasswordReauthError && (
                <p className="text-destructive text-sm">
                  <AppErrorMessage error={switchToPasswordReauthError} />
                </p>
              )}
              <Button
                onClick={() => void handleSwitchToPasswordReauth()}
                disabled={switchToPasswordReauthLoading}
                color="primary"
              >
                {switchToPasswordReauthLoading
                  ? intl.formatMessage(messages.copyVerifying)
                  : intl.formatMessage(messages.copyVerifyWithPasskey)}
              </Button>
            </div>
          )}
        </FormDialog>
      </FormStoreProvider>
    </div>
  );
}
