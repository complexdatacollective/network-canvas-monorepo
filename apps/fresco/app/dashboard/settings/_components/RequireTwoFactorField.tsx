'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { AppErrorMessage, useAppIntl } from '@codaco/app-i18n/react';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import { setRequireTwoFactor } from '~/actions/appSettings';
import SettingsField from '~/components/settings/SettingsField';
import { captureClientException } from '~/lib/posthog-client';

const messages = defineMessages({
  requireTwoFactorAuthentication: {
    id: 'fresco.settings.RequireTwoFactorField.requireTwoFactorAuthentication',
    defaultMessage: 'Require Two-Factor Authentication',
    description:
      'Label of the installation-wide setting that makes two-factor authentication mandatory for every password account.',
  },
  whenEnabledEveryAccountThatSignsIn: {
    id: 'fresco.settings.RequireTwoFactorField.whenEnabledEveryAccountThatSignsIn',
    defaultMessage:
      'When enabled, every account that signs in with a password must set up two-factor authentication before it can use the dashboard, and cannot turn it off. Accounts that sign in with a passkey are not affected.',
    description:
      'Explains what the Require Two-Factor Authentication setting does and that passkey accounts are exempt.',
  },
  toggleRequireTwoFactorAuthentication: {
    id: 'fresco.settings.RequireTwoFactorField.toggleRequireTwoFactorAuthentication',
    defaultMessage: 'Toggle whether two-factor authentication is required',
    description:
      'Accessible name of the switch for the Require Two-Factor Authentication setting.',
  },
  failedToSaveSetting: {
    id: 'fresco.settings.RequireTwoFactorField.failedToSaveSetting',
    defaultMessage: 'Failed to save setting',
    description:
      'Error shown when the Require Two-Factor Authentication setting could not be saved for an unexpected reason.',
  },
});

/**
 * The installation-wide two-factor policy. Unlike the other setting switches
 * this one can be refused (a researcher may not require what their own
 * account lacks), so it reports the refusal beside the control instead of
 * throwing to the error boundary.
 */
export default function RequireTwoFactorField({
  initialValue,
  readOnly = false,
}: {
  initialValue: boolean;
  readOnly?: boolean;
}) {
  const intl = useAppIntl();
  const router = useRouter();
  const errorId = useId();
  const [enabled, setEnabled] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleChange = (checked: boolean | undefined) => {
    const next = checked ?? false;
    setError(null);
    startTransition(async () => {
      try {
        const result = await setRequireTwoFactor(next);
        if (result.error) {
          setError(result.error);
          return;
        }
        setEnabled(next);
        // The per-account two-factor controls above read the policy on the
        // server; refresh so they reflect the change at once.
        router.refresh();
      } catch (caught) {
        captureClientException(caught);
        setError(createMessageError(messages.failedToSaveSetting));
      }
    });
  };

  return (
    <SettingsField
      label={intl.formatMessage(messages.requireTwoFactorAuthentication)}
      description={intl.formatMessage(
        messages.whenEnabledEveryAccountThatSignsIn,
      )}
      testId="require-two-factor-field"
      control={
        <ToggleField
          value={enabled}
          onChange={handleChange}
          disabled={readOnly || isPending}
          aria-label={intl.formatMessage(
            messages.toggleRequireTwoFactorAuthentication,
          )}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        />
      }
    >
      {error && (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          <AppErrorMessage error={error} />
        </p>
      )}
    </SettingsField>
  );
}
