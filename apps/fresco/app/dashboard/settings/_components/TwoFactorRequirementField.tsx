import { type ReactNode } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import SettingsField from '~/components/settings/SettingsField';
import { getServerIntl } from '~/i18n/server';

import ReadOnlyEnvAlert from '../ReadOnlyEnvAlert';

const messages = defineMessages({
  requireTwoFactorAuthentication: {
    id: 'fresco.settings.TwoFactorRequirementField.requireTwoFactorAuthentication',
    defaultMessage: 'Require Two-Factor Authentication',
    description:
      'Label of the read-only field that reports whether the installation requires two-factor authentication of every password account.',
  },
  whenTheEnvironmentVariableIsSet: {
    id: 'fresco.settings.TwoFactorRequirementField.whenTheEnvironmentVariableIsSet',
    defaultMessage:
      'When the <tag1>REQUIRE_TWO_FACTOR</tag1> environment variable is set to true, every account that signs in with a password must set up two-factor authentication before it can use the dashboard, and cannot turn it off. Accounts that sign in with a passkey are not affected.',
    description:
      'Explains what the REQUIRE_TWO_FACTOR environment variable enforces and that passkey accounts are exempt. tag1 wraps the variable name in code formatting.',
  },
  whetherTwoFactorAuthenticationIsRequired: {
    id: 'fresco.settings.TwoFactorRequirementField.whetherTwoFactorAuthenticationIsRequired',
    defaultMessage: 'Whether two-factor authentication is required',
    description:
      'Accessible name of the read-only switch that shows whether the installation requires two-factor authentication.',
  },
});

const renderCode = (chunks: ReactNode) => <code>{chunks}</code>;

/**
 * Reports the installation-wide requirement without offering to change it:
 * it comes from the environment precisely so that no account can switch it
 * off from here (see lib/auth/twoFactorPolicy.ts).
 */
export default async function TwoFactorRequirementField({
  required,
}: {
  required: boolean;
}) {
  const intl = await getServerIntl();

  return (
    <SettingsField
      label={intl.formatMessage(messages.requireTwoFactorAuthentication)}
      description={intl.formatMessage(
        messages.whenTheEnvironmentVariableIsSet,
        {
          tag1: renderCode,
        },
      )}
      testId="require-two-factor-field"
      control={
        <ToggleField
          value={required}
          disabled
          aria-label={intl.formatMessage(
            messages.whetherTwoFactorAuthenticationIsRequired,
          )}
        />
      }
    >
      <ReadOnlyEnvAlert />
    </SettingsField>
  );
}
