'use client';

import { useCallback, useEffect, useState } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import {
  AppErrorMessage,
  AppMessage,
  useAppIntl,
} from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SegmentedCodeField from '@codaco/fresco-ui/form/fields/SegmentedCodeField';
import { surfaceSpacingVariants } from '@codaco/fresco-ui/layout/Surface';
import Spinner from '@codaco/fresco-ui/Spinner';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { enableTotp, verifyTotpSetup } from '~/actions/totp';
import RecoveryCodes from '~/components/RecoveryCodes';
import { captureClientException } from '~/lib/posthog-client';

const messages = defineMessages({
  setupFailed: {
    id: 'fresco.TwoFactorSetup.setupFailed',
    defaultMessage: 'Two-factor authentication setup failed. Try again.',
    description:
      'Fallback for an unexpected error while preparing or verifying two-factor authentication setup.',
  },
  requiredCode: {
    id: 'fresco.TwoFactorSetup.requiredCode',
    defaultMessage: 'Code is required',
    description:
      'Validation error under the 6-digit code field of the two-factor setup wizard, shown when the researcher continues without entering the code from their authenticator app.',
  },

  copyCopied: {
    id: 'fresco.TwoFactorSetup.copyCopied',
    defaultMessage: 'Copied!',
    description:
      'Label of the small copy button beside the setup secret in the two-factor setup wizard for two seconds after the secret was copied. Confirms the copy; not an action.',
  },
  copyCopy: {
    id: 'fresco.TwoFactorSetup.copyCopy',
    defaultMessage: 'Copy',
    description:
      'Small button beside the secret text field in the two-factor setup wizard; it copies the secret to the clipboard. A verb, not a noun.',
  },
  copyVerify: {
    id: 'fresco.TwoFactorSetup.copyVerify',
    defaultMessage: 'Verify',
    description:
      'Label of the next button on the code-entry step of the two-factor setup wizard; it checks the 6-digit code from the authenticator app. A verb.',
  },
  copyIVeSavedMyRecoveryCodes: {
    id: 'fresco.TwoFactorSetup.copyIVeSavedMyRecoveryCodes',
    defaultMessage: "I've saved my recovery codes",
    description:
      'Label of the final button of the two-factor setup wizard, shown under the list of recovery codes. Pressing it confirms the codes are stored safely and finishes setup.',
  },
  singleAccountWarning: {
    id: 'fresco.TwoFactorSetup.singleAccountWarning',
    defaultMessage: 'Single account warning',
    description:
      'Title of the warning box at the top of the first step of the two-factor setup wizard, shown only when the installation has a single researcher account.',
  },
  youAreTheOnlyUserAccountIf: {
    id: 'fresco.TwoFactorSetup.youAreTheOnlyUserAccountIf',
    defaultMessage:
      'You are the only user account. If you lose access to your authenticator app and recovery codes, there will be no way to recover your account. Consider creating a second user account first.',
    description:
      'Text of the warning box on the first step of the two-factor setup wizard, shown when the researcher has the only account. User account means researcher account; the warning is about being locked out.',
  },
  generatingSecret: {
    id: 'fresco.TwoFactorSetup.generatingSecret',
    defaultMessage: 'Generating secret...',
    description:
      'Loading text with a spinner on the first step of the two-factor setup wizard while the secret and QR code are being generated.',
  },
  qRCodeForAuthenticatorApp: {
    id: 'fresco.TwoFactorSetup.qRCodeForAuthenticatorApp',
    defaultMessage: 'QR code for authenticator app',
    description:
      'Alternative text of the QR code image in the two-factor setup wizard, which the researcher scans with an authenticator app. Read only by screen readers.',
  },
  canTScanTheQRCodeEnter: {
    id: 'fresco.TwoFactorSetup.canTScanTheQRCodeEnter',
    defaultMessage: "Can't scan the QR code? Enter this secret manually:",
    description:
      'Label above the read-only field under the QR code in the two-factor setup wizard. The field shows the secret text that can be typed into an authenticator app when the QR code cannot be scanned.',
  },
  enterYour6DigitCodeFromYour: {
    id: 'fresco.TwoFactorSetup.enterYour6DigitCodeFromYour',
    defaultMessage: 'Enter your 6-digit code from your authenticator app',
    description:
      'Label of the 6-digit code field on the second step of the two-factor setup wizard. The code is the current one-time two-factor code, not a recovery code.',
  },
  setUpTwoFactorAuthentication: {
    id: 'fresco.TwoFactorSetup.setUpTwoFactorAuthentication',
    defaultMessage: 'Set Up Two-Factor Authentication',
    description:
      'Title of the wizard dialog, and of its first step, that guides a researcher through turning on two-factor authentication for their account.',
  },
  scanTheQRCodeWithYourAuthenticator: {
    id: 'fresco.TwoFactorSetup.scanTheQRCodeWithYourAuthenticator',
    defaultMessage:
      'Scan the QR code with your authenticator app, then enter the code to verify.',
    description:
      'Instruction under the title of the first step of the two-factor setup wizard, telling the researcher to scan the QR code with an authenticator app.',
  },
  verifyCode: {
    id: 'fresco.TwoFactorSetup.verifyCode',
    defaultMessage: 'Verify Code',
    description:
      'Title of the second step of the two-factor setup wizard, where the researcher types the 6-digit code from their authenticator app to check that setup works.',
  },
  enterThe6DigitCodeFromYour: {
    id: 'fresco.TwoFactorSetup.enterThe6DigitCodeFromYour',
    defaultMessage:
      'Enter the 6-digit code from your authenticator app to verify setup.',
    description:
      'Instruction under the title of the second step of the two-factor setup wizard, asking for the current 6-digit code from the authenticator app.',
  },
  saveRecoveryCodes: {
    id: 'fresco.TwoFactorSetup.saveRecoveryCodes',
    defaultMessage: 'Save Recovery Codes',
    description:
      'Title of the last step of the two-factor setup wizard, which lists the one-time recovery codes the researcher must store for use if the authenticator app is lost.',
  },
});

type SetupData = {
  secret: string;
  qrCodeDataUrl: string;
};

function QRCodeStep({ userCount }: { userCount: number }) {
  const intl = useAppIntl();

  const { setNextEnabled, setStepData } = useWizard();
  const [error, setError] = useState<string | null>(null);
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [secretCopied, setSecretCopied] = useState(false);

  useEffect(() => {
    setNextEnabled(false);
  }, [setNextEnabled]);

  useEffect(() => {
    let cancelled = false;

    async function fetchTotpData() {
      try {
        const result = await enableTotp();
        if (cancelled) return;
        if (result.data) {
          setSetupData(result.data);
          setStepData({ setupData: result.data });
          setNextEnabled(true);
        } else if (result.error) {
          setError(result.error);
        }
      } catch (caught) {
        captureClientException(caught);
        if (!cancelled) setError(createMessageError(messages.setupFailed));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void fetchTotpData();
    return () => {
      cancelled = true;
    };
  }, [setNextEnabled, setStepData]);

  const handleCopySecret = async () => {
    if (!setupData) return;
    await navigator.clipboard.writeText(setupData.secret);
    setSecretCopied(true);
    setTimeout(() => setSecretCopied(false), 2000);
  };

  return (
    <>
      {userCount === 1 && (
        <Alert variant="warning">
          <AlertTitle>
            {intl.formatMessage(messages.singleAccountWarning)}
          </AlertTitle>
          <AlertDescription>
            {intl.formatMessage(messages.youAreTheOnlyUserAccountIf)}
          </AlertDescription>
        </Alert>
      )}
      <fieldset
        className={cx(
          'flex h-96 flex-col items-center justify-center rounded border',
          surfaceSpacingVariants(),
        )}
      >
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              <AppErrorMessage error={error} />
            </AlertDescription>
          </Alert>
        ) : isLoading || !setupData ? (
          <>
            <Spinner />
            <Paragraph>
              {intl.formatMessage(messages.generatingSecret)}
            </Paragraph>
          </>
        ) : (
          <>
            <img
              src={setupData.qrCodeDataUrl}
              alt={intl.formatMessage(messages.qRCodeForAuthenticatorApp)}
              className="mx-auto aspect-square grow"
            />
            <UnconnectedField
              name="secret"
              component={InputField}
              readOnly
              label={intl.formatMessage(messages.canTScanTheQRCodeEnter)}
              value={setupData.secret}
              className="font-monospace"
              suffixComponent={
                <Button size="sm" onClick={() => void handleCopySecret()}>
                  {secretCopied
                    ? intl.formatMessage(messages.copyCopied)
                    : intl.formatMessage(messages.copyCopy)}
                </Button>
              }
            />
          </>
        )}
      </fieldset>
    </>
  );
}

function VerifyStep() {
  const intl = useAppIntl();

  const { setNextEnabled, setStepData, setBeforeNext } = useWizard();
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | undefined>(undefined);

  useEffect(() => {
    setNextEnabled(false);
  }, [setNextEnabled]);

  useEffect(() => {
    setStepData({ code });
    setNextEnabled(code?.length === 6);
  }, [code, setNextEnabled, setStepData]);

  useEffect(() => {
    setBeforeNext(async () => {
      setIsVerifying(true);
      setError(null);
      try {
        const result = await verifyTotpSetup({ code });
        if (result.error) {
          setError(result.error);
          return false;
        }
        if (result.data) {
          setStepData({ recoveryCodes: result.data.recoveryCodes });
          return true;
        }
        return false;
      } catch (caught) {
        captureClientException(caught);
        setError(createMessageError(messages.setupFailed));
        return false;
      } finally {
        setIsVerifying(false);
      }
    });
  }, [code, setBeforeNext, setStepData]);

  return (
    <>
      <UnconnectedField
        name="code"
        label={intl.formatMessage(messages.enterYour6DigitCodeFromYour)}
        component={SegmentedCodeField}
        required={intl.formatMessage(messages.requiredCode)}
        segments={6}
        characterSet="numeric"
        size="lg"
        autoComplete="off"
        value={code}
        onChange={(value) => {
          setCode(value);
          setError(null);
        }}
        disabled={isVerifying}
        errors={error ? [error] : undefined}
        showErrors
        aria-invalid={!!error}
      />
    </>
  );
}

function RecoveryCodesStep() {
  const { data, setBackEnabled } = useWizard();

  useEffect(() => {
    setBackEnabled(false);
  }, [setBackEnabled]);

  // The set-up step stores the codes before this step is shown.
  const codes = Array.isArray(data.recoveryCodes)
    ? data.recoveryCodes.filter((code) => typeof code === 'string')
    : [];

  return <RecoveryCodes codes={codes} />;
}

export function useTwoFactorSetup(userCount: number) {
  const { openDialog } = useDialog();

  const startSetup = useCallback(async () => {
    const result = await openDialog({
      type: 'wizard',
      title: <AppMessage message={messages.setUpTwoFactorAuthentication} />,
      steps: [
        {
          title: <AppMessage message={messages.setUpTwoFactorAuthentication} />,
          description: (
            <AppMessage message={messages.scanTheQRCodeWithYourAuthenticator} />
          ),
          content: () => <QRCodeStep userCount={userCount} />,
        },
        {
          title: <AppMessage message={messages.verifyCode} />,
          description: (
            <AppMessage message={messages.enterThe6DigitCodeFromYour} />
          ),
          content: VerifyStep,
          nextLabel: <AppMessage message={messages.copyVerify} />,
        },
        {
          title: <AppMessage message={messages.saveRecoveryCodes} />,
          content: RecoveryCodesStep,
          nextLabel: (
            <AppMessage message={messages.copyIVeSavedMyRecoveryCodes} />
          ),
        },
      ],
    });

    return result !== null;
  }, [openDialog, userCount]);

  return startSetup;
}
