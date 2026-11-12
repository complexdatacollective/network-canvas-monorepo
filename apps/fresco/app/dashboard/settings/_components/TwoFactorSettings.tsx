'use client';

import { RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { disableTotp, regenerateRecoveryCodes } from '~/actions/totp';
import FormDialog from '~/components/FormDialog';
import RecoveryCodes from '~/components/RecoveryCodes';
import SettingsField from '~/components/settings/SettingsField';
import { useTwoFactorSetup } from '~/components/TwoFactorSetup';
import TwoFactorVerify from '~/components/TwoFactorVerify';

const messages = defineMessages({
  regenerating: {
    id: 'fresco.TwoFactorSettings.regenerating',
    defaultMessage: 'Regenerating...',
    description:
      'Label of the Regenerate button of the recovery codes dialog in Settings while new recovery codes are being created. A progress state, not a command.',
  },

  disabling: {
    id: 'fresco.TwoFactorSettings.disabling',
    defaultMessage: 'Disabling...',
    description:
      'Label of the Disable button of the two-factor authentication dialog in Settings while two-factor authentication is being turned off. A progress state, not a command.',
  },

  twoFactorAuthentication: {
    id: 'fresco.settings.TwoFactorSettings.twoFactorAuthentication',
    defaultMessage: 'Two-Factor Authentication',
    description:
      "Label of the Settings row with the switch that turns two-factor authentication on or off for the researcher's own account.",
  },
  twoFactorAuthentication2FAAddsAnExtra: {
    id: 'fresco.settings.TwoFactorSettings.twoFactorAuthentication2FAAddsAnExtra',
    defaultMessage:
      'Two factor authentication (2FA) adds an extra layer of security to your account by requiring a second form of verification in addition to your password. This can be a code from an authenticator app or a recovery code.',
    description:
      'Hint under the Two-Factor Authentication label in Settings. The second form of verification is a code from an authenticator app, or a recovery code.',
  },
  toggleTwoFactorAuthentication: {
    id: 'fresco.settings.TwoFactorSettings.toggleTwoFactorAuthentication',
    defaultMessage: 'Toggle two-factor authentication',
    description:
      'Accessible name of the switch in Settings that turns two-factor authentication on or off; read only by screen readers.',
  },
  regenerateRecoveryCodes: {
    id: 'fresco.settings.TwoFactorSettings.regenerateRecoveryCodes',
    defaultMessage: 'Regenerate Recovery Codes',
    description:
      "Label of the button in Settings, and title of the dialog it opens, for replacing the account's two-factor recovery codes (single-use backup codes) with new ones.",
  },
  disableTwoFactorAuthentication: {
    id: 'fresco.settings.TwoFactorSettings.disableTwoFactorAuthentication',
    defaultMessage: 'Disable Two-Factor Authentication',
    description:
      'Title of the dialog in Settings that asks the researcher to verify with a code before turning off two-factor authentication on their account.',
  },
  enterYourCurrentAuthenticatorCodeOrA: {
    id: 'fresco.settings.TwoFactorSettings.enterYourCurrentAuthenticatorCodeOrA',
    defaultMessage:
      'Enter your current authenticator code or a recovery code to disable two-factor authentication.',
    description:
      'Description under the title of the dialog for turning off two-factor authentication. The authenticator code is the changing code from the app; the recovery code is a single-use backup code.',
  },
  disable: {
    id: 'fresco.settings.TwoFactorSettings.disable',
    defaultMessage: 'Disable',
    description:
      "Destructive confirm button of the dialog in Settings that turns off two-factor authentication for the researcher's account. Disable is a verb.",
  },
  ifYouCanAposTAccessYour: {
    id: 'fresco.settings.TwoFactorSettings.ifYouCanAposTAccessYour',
    defaultMessage:
      "If you can't access your authenticator app, you need to use a recovery code to disable two-factor authentication. If you don't have any valid recovery codes, you will need another user to disable two-factor authentication for you.",
    description:
      'Info notice inside the dialog for turning off two-factor authentication, for researchers who lost their authenticator app. Another user means another researcher account on this installation.',
  },
  enterYourCurrentAuthenticatorCodeToGenerate: {
    id: 'fresco.settings.TwoFactorSettings.enterYourCurrentAuthenticatorCodeToGenerate',
    defaultMessage:
      'Enter your current authenticator code to generate new recovery codes. Your existing codes will be invalidated.',
    description:
      'Description under the title of the dialog for regenerating recovery codes. The authenticator code is the changing code from the app; old recovery codes stop working.',
  },
  regenerate: {
    id: 'fresco.settings.TwoFactorSettings.regenerate',
    defaultMessage: 'Regenerate',
    description:
      "Confirm button of the dialog in Settings that replaces the account's recovery codes with newly created ones. Regenerate is a verb.",
  },
  ifYouCanAposTAccessYour2: {
    id: 'fresco.settings.TwoFactorSettings.ifYouCanAposTAccessYour2',
    defaultMessage:
      "If you can't access your authenticator app, you need to disable two-factor authentication using an existing recovery code before you generate new codes. If you don't have any valid recovery codes, you will need another user to disable two-factor authentication for you.",
    description:
      'Info notice inside the dialog for regenerating recovery codes, for researchers who lost their authenticator app. Another user means another researcher account on this installation.',
  },
  newRecoveryCodes: {
    id: 'fresco.settings.TwoFactorSettings.newRecoveryCodes',
    defaultMessage: 'New Recovery Codes',
    description:
      'Title of the dialog in Settings that shows the newly generated two-factor recovery codes (single-use backup codes) after regeneration.',
  },
  yourPreviousRecoveryCodesHaveBeenInvalidated: {
    id: 'fresco.settings.TwoFactorSettings.yourPreviousRecoveryCodesHaveBeenInvalidated',
    defaultMessage:
      'Your previous recovery codes have been invalidated. Save these new codes.',
    description:
      'Description under the title of the dialog that shows newly generated recovery codes, telling the researcher the old codes no longer work and to keep the new ones.',
  },
  requiredOnThisInstallation: {
    id: 'fresco.settings.TwoFactorSettings.requiredOnThisInstallation',
    defaultMessage:
      'Two-factor authentication is required on this installation for every account that signs in with a password, so it cannot be turned off here.',
    description:
      'Shown beside the per-account two-factor switch when the REQUIRE_TWO_FACTOR environment variable is set.',
  },
});

type TwoFactorSettingsProps = {
  hasTwoFactor: boolean;
  userCount: number;
  sandboxMode?: boolean;
  /** Whether the installation requires two-factor authentication (`REQUIRE_TWO_FACTOR`). */
  twoFactorRequired?: boolean;
};

export default function TwoFactorSettings({
  hasTwoFactor: initialHasTwoFactor,
  userCount,
  sandboxMode = false,
  twoFactorRequired = false,
}: TwoFactorSettingsProps) {
  const intl = useAppIntl();

  const [hasTwoFactor, setHasTwoFactor] = useState(initialHasTwoFactor);
  const [showDisable, setShowDisable] = useState(false);
  const [showRegenerateVerify, setShowRegenerateVerify] = useState(false);
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const startTwoFactorSetup = useTwoFactorSetup(userCount);

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      const completed = await startTwoFactorSetup();
      if (completed) {
        setHasTwoFactor(true);
      }
    } else {
      setShowDisable(true);
    }
  };

  return (
    <>
      <SettingsField
        label={intl.formatMessage(messages.twoFactorAuthentication)}
        description={intl.formatMessage(
          messages.twoFactorAuthentication2FAAddsAnExtra,
        )}
        testId="two-factor-field"
        control={
          <ToggleField
            value={hasTwoFactor}
            onChange={(checked) => void handleToggle(checked ?? false)}
            // The server refuses to disable it while the policy is on; the
            // switch says so rather than offering a change that cannot happen.
            disabled={sandboxMode || (hasTwoFactor && twoFactorRequired)}
            aria-label={intl.formatMessage(
              messages.toggleTwoFactorAuthentication,
            )}
          />
        }
      >
        {hasTwoFactor && twoFactorRequired && (
          <Alert variant="info" className="mb-3">
            <AlertDescription>
              {intl.formatMessage(messages.requiredOnThisInstallation)}
            </AlertDescription>
          </Alert>
        )}
        {hasTwoFactor && (
          <Button
            size="sm"
            onClick={() => setShowRegenerateVerify(true)}
            icon={<RefreshCw />}
          >
            {intl.formatMessage(messages.regenerateRecoveryCodes)}
          </Button>
        )}
      </SettingsField>

      <FormStoreProvider>
        <FormDialog
          open={showDisable}
          closeDialog={() => setShowDisable(false)}
          title={intl.formatMessage(messages.disableTwoFactorAuthentication)}
          description={intl.formatMessage(
            messages.enterYourCurrentAuthenticatorCodeOrA,
          )}
          renderFooter={(heldOpen) => (
            <>
              <Button onClick={() => setShowDisable(false)} disabled={heldOpen}>
                {intl.formatMessage(commonMessages.cancel)}
              </Button>
              <SubmitButton
                form="disable-2fa"
                color="destructive"
                submittingText={intl.formatMessage(messages.disabling)}
              >
                {intl.formatMessage(messages.disable)}
              </SubmitButton>
            </>
          )}
        >
          <Alert variant="info">
            <AlertDescription>
              {intl.formatMessage(messages.ifYouCanAposTAccessYour)}
            </AlertDescription>
          </Alert>
          <TwoFactorVerify
            formId="disable-2fa"
            onVerify={async (code) => {
              const result = await disableTotp({ code });
              if (result.error) {
                return { success: false, formErrors: [result.error] };
              }
              setHasTwoFactor(false);
              setShowDisable(false);
              return { success: true };
            }}
            allowRecoveryCodes
          />
        </FormDialog>
      </FormStoreProvider>

      <FormStoreProvider>
        <FormDialog
          open={showRegenerateVerify}
          closeDialog={() => setShowRegenerateVerify(false)}
          title={intl.formatMessage(messages.regenerateRecoveryCodes)}
          description={intl.formatMessage(
            messages.enterYourCurrentAuthenticatorCodeToGenerate,
          )}
          renderFooter={(heldOpen) => (
            <>
              <Button
                onClick={() => setShowRegenerateVerify(false)}
                disabled={heldOpen}
              >
                {intl.formatMessage(commonMessages.cancel)}
              </Button>
              <SubmitButton
                form="regenerate-recovery-codes"
                submittingText={intl.formatMessage(messages.regenerating)}
              >
                {intl.formatMessage(messages.regenerate)}
              </SubmitButton>
            </>
          )}
        >
          <Alert variant="info">
            <AlertDescription>
              {intl.formatMessage(messages.ifYouCanAposTAccessYour2)}
            </AlertDescription>
          </Alert>
          <TwoFactorVerify
            formId="regenerate-recovery-codes"
            onVerify={async (code) => {
              const result = await regenerateRecoveryCodes({ code });
              if (result.error) {
                return { success: false, formErrors: [result.error] };
              }
              if (result.data) {
                setShowRegenerateVerify(false);
                setRecoveryCodes(result.data.recoveryCodes);
                setShowRecoveryCodes(true);
              }
              return { success: true };
            }}
          />
        </FormDialog>
      </FormStoreProvider>

      <Dialog
        open={showRecoveryCodes}
        closeDialog={() => {
          setShowRecoveryCodes(false);
          setRecoveryCodes([]);
        }}
        title={intl.formatMessage(messages.newRecoveryCodes)}
        description={intl.formatMessage(
          messages.yourPreviousRecoveryCodesHaveBeenInvalidated,
        )}
        footer={
          <Button
            color="primary"
            onClick={() => {
              setShowRecoveryCodes(false);
              setRecoveryCodes([]);
            }}
          >
            {intl.formatMessage(commonMessages.done)}
          </Button>
        }
      >
        <RecoveryCodes codes={recoveryCodes} />
      </Dialog>
    </>
  );
}
