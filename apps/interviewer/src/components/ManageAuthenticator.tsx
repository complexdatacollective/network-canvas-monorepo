import { KeyRound, ShieldOff } from 'lucide-react';
import { type ReactNode, createElement, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import { getPasswordStrength } from '@codaco/fresco-ui/form/fields/getPasswordStrength';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import SegmentedCodeField from '@codaco/fresco-ui/form/fields/SegmentedCodeField';
import { useToast } from '@codaco/fresco-ui/Toast';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { SettingsRow } from '~/components/SettingsRow';
import type { AuthResult } from '~/lib/auth/api';
import { useAuth } from '~/lib/auth/AuthContext';

const messages = defineMessages({
  yourNewPINMustBeExactly8: {
    id: 'interviewer.manageAuthenticator.yourNewPINMustBeExactly8',
    defaultMessage: 'Your new PIN must be exactly 8 digits.',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  theTwoNewPINsDoNotMatch: {
    id: 'interviewer.manageAuthenticator.theTwoNewPINsDoNotMatch',
    defaultMessage: 'The two new PINs do not match.',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  weCouldNotChangeYourPIN: {
    id: 'interviewer.manageAuthenticator.weCouldNotChangeYourPIN',
    defaultMessage: 'We could not change your PIN.',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  currentPIN: {
    id: 'interviewer.manageAuthenticator.currentPIN',
    defaultMessage: 'Current PIN',
    description: 'The label label in Interviewer Manage Authenticator.',
  },
  newPIN: {
    id: 'interviewer.manageAuthenticator.newPIN',
    defaultMessage: 'New PIN',
    description: 'The label label in Interviewer Manage Authenticator.',
  },
  confirmNewPIN: {
    id: 'interviewer.manageAuthenticator.confirmNewPIN',
    defaultMessage: 'Confirm new PIN',
    description: 'The label label in Interviewer Manage Authenticator.',
  },
  saving: {
    id: 'interviewer.manageAuthenticator.saving',
    defaultMessage: 'Saving…',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  saveNewPIN: {
    id: 'interviewer.manageAuthenticator.saveNewPIN',
    defaultMessage: 'Save new PIN',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  yourNewPassphraseMustBeAtLeast: {
    id: 'interviewer.manageAuthenticator.yourNewPassphraseMustBeAtLeast',
    defaultMessage:
      'Your new passphrase must be at least 12 characters and combine uppercase, lowercase, numbers, and symbols.',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  theTwoNewPassphrasesDoNotMatch: {
    id: 'interviewer.manageAuthenticator.theTwoNewPassphrasesDoNotMatch',
    defaultMessage: 'The two new passphrases do not match.',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  weCouldNotChangeYourPassphrase: {
    id: 'interviewer.manageAuthenticator.weCouldNotChangeYourPassphrase',
    defaultMessage: 'We could not change your passphrase.',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  currentPassphrase: {
    id: 'interviewer.manageAuthenticator.currentPassphrase',
    defaultMessage: 'Current passphrase',
    description: 'The label label in Interviewer Manage Authenticator.',
  },
  newPassphrase: {
    id: 'interviewer.manageAuthenticator.newPassphrase',
    defaultMessage: 'New passphrase',
    description: 'The label label in Interviewer Manage Authenticator.',
  },
  atLeast12CharactersCombiningUppercaseLowercase: {
    id: 'interviewer.manageAuthenticator.atLeast12CharactersCombiningUppercaseLowercase',
    defaultMessage:
      'At least 12 characters, combining uppercase, lowercase, numbers, and symbols.',
    description: 'The hint label in Interviewer Manage Authenticator.',
  },
  confirmNewPassphrase: {
    id: 'interviewer.manageAuthenticator.confirmNewPassphrase',
    defaultMessage: 'Confirm new passphrase',
    description: 'The label label in Interviewer Manage Authenticator.',
  },
  passphrasesDoNotMatch: {
    id: 'interviewer.manageAuthenticator.passphrasesDoNotMatch',
    defaultMessage: 'Passphrases do not match.',
    description: 'Visible copy in Interviewer Manage Authenticator.',
  },
  saveNewPassphrase: {
    id: 'interviewer.manageAuthenticator.saveNewPassphrase',
    defaultMessage: 'Save new passphrase',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  deviceLock: {
    id: 'interviewer.manageAuthenticator.deviceLock',
    defaultMessage: 'Device lock',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  authenticator: {
    id: 'interviewer.manageAuthenticator.authenticator',
    defaultMessage: 'Authenticator',
    description: 'Settings heading for the enrolled device unlock credential.',
  },
  noDeviceLockIsConfiguredDataOn: {
    id: 'interviewer.manageAuthenticator.noDeviceLockIsConfiguredDataOn',
    defaultMessage:
      'No device lock is configured. Data on this device is not encrypted at the app layer. Use the Get started wizard below to enable app security and encrypt data stored by Interviewer.',
    description: 'Visible copy in Interviewer Manage Authenticator.',
  },
  mode: {
    id: 'interviewer.manageAuthenticator.mode',
    defaultMessage: 'Mode',
    description:
      'Label of the currently enrolled method used to unlock this device.',
  },
  changePIN: {
    id: 'interviewer.manageAuthenticator.changePIN',
    defaultMessage: 'Change PIN',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  changePassphrase: {
    id: 'interviewer.manageAuthenticator.changePassphrase',
    defaultMessage: 'Change passphrase',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  replaceYour8DigitPINWithA: {
    id: 'interviewer.manageAuthenticator.replaceYour8DigitPINWithA',
    defaultMessage:
      'Replace your 8-digit PIN with a new one. Your data stays intact.',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  replaceYourPassphraseWithANewOne: {
    id: 'interviewer.manageAuthenticator.replaceYourPassphraseWithANewOne',
    defaultMessage:
      'Replace your passphrase with a new one. Your data stays intact.',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  toChangeYourUnlockMethodResetThe: {
    id: 'interviewer.manageAuthenticator.toChangeYourUnlockMethodResetThe',
    defaultMessage:
      'To change your unlock method, reset the device and run setup again. Resetting destroys all data on this device.',
    description: 'Visible copy in Interviewer Manage Authenticator.',
  },
  resetDeviceAndWipeData: {
    id: 'interviewer.manageAuthenticator.resetDeviceAndWipeData',
    defaultMessage: 'Reset device and wipe data?',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  revokeDeviceLockAndWipeData: {
    id: 'interviewer.manageAuthenticator.revokeDeviceLockAndWipeData',
    defaultMessage: 'Revoke device lock and wipe data?',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  thisWillDestroyAllDataOnThis: {
    id: 'interviewer.manageAuthenticator.thisWillDestroyAllDataOnThis',
    defaultMessage: 'This will destroy all data on this device. Continue?',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  destroyDeviceData: {
    id: 'interviewer.manageAuthenticator.destroyDeviceData',
    defaultMessage: 'Destroy device data',
    description:
      'Destructive confirmation action that permanently wipes all protocols and interview data on this device.',
  },
  resetDevice: {
    id: 'interviewer.manageAuthenticator.resetDevice',
    defaultMessage: 'Reset device',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  revokeDeviceLock: {
    id: 'interviewer.manageAuthenticator.revokeDeviceLock',
    defaultMessage: 'Revoke device lock',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  destroyAllProtocolsSessionsAndStoredCredentials: {
    id: 'interviewer.manageAuthenticator.destroyAllProtocolsSessionsAndStoredCredentials',
    defaultMessage:
      'Destroy all protocols, sessions, and stored credentials on this device, then restart setup.',
    description: 'The desc label in Interviewer Manage Authenticator.',
  },
  pINChanged: {
    id: 'interviewer.manageAuthenticator.pINChanged',
    defaultMessage: 'PIN changed',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  passphraseChanged: {
    id: 'interviewer.manageAuthenticator.passphraseChanged',
    defaultMessage: 'Passphrase changed',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  revoke: {
    id: 'interviewer.manageAuthenticator.revoke',
    defaultMessage: 'Revoke',
    description: 'User-facing message in Interviewer Manage Authenticator.',
  },
  pinMethod: {
    id: 'interviewer.manageAuthenticator.pinMethod',
    defaultMessage: 'PIN',
    description: 'Administration text in Interviewer ManageAuthenticator.',
  },
  passphraseMethod: {
    id: 'interviewer.manageAuthenticator.passphraseMethod',
    defaultMessage: 'Passphrase',
    description: 'Administration text in Interviewer ManageAuthenticator.',
  },
  biometricMethod: {
    id: 'interviewer.manageAuthenticator.biometricMethod',
    defaultMessage: 'Biometric (with recovery passphrase)',
    description: 'Administration text in Interviewer ManageAuthenticator.',
  },
  noLock: {
    id: 'interviewer.manageAuthenticator.noLock',
    defaultMessage: 'No device lock',
    description: 'Administration text in Interviewer ManageAuthenticator.',
  },
  unknownMethod: {
    id: 'interviewer.manageAuthenticator.unknownMethod',
    defaultMessage: 'Unknown',
    description: 'Administration text in Interviewer ManageAuthenticator.',
  },
});

const MODE_LABEL: Record<string, MessageDescriptor> = {
  pin: messages.pinMethod,
  passphrase: messages.passphraseMethod,
  biometric: messages.biometricMethod,
  none: messages.noLock,
};

const PIN_PATTERN = /^\d{8}$/;

type ReEnrolHandler = (current: string, next: string) => Promise<AuthResult>;

export function ChangePinForm({
  onReEnrol,
  onSuccess,
  onCancel,
}: {
  onReEnrol: ReEnrolHandler;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const intl = useAppIntl();
  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [nextPinConfirm, setNextPinConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReactNode>(null);

  const handleSave = async () => {
    setError(null);
    if (!PIN_PATTERN.test(nextPin)) {
      setError(
        createElement(AppMessage, {
          message: messages.yourNewPINMustBeExactly8,
        }),
      );
      return;
    }
    if (nextPin !== nextPinConfirm) {
      setError(
        createElement(AppMessage, {
          message: messages.theTwoNewPINsDoNotMatch,
        }),
      );
      return;
    }
    setBusy(true);
    try {
      const result = await onReEnrol(currentPin, nextPin);
      if (result.ok) {
        onSuccess();
        return;
      }
      setError(
        createElement(AppMessage, {
          message:
            result.localizedMessage?.descriptor ??
            messages.weCouldNotChangeYourPIN,
          values: result.localizedMessage?.values,
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <UnconnectedField
        name="currentPin"
        label={intl.formatMessage(messages.currentPIN)}
        component={PasswordField}
        value={currentPin}
        onChange={(next) => setCurrentPin(next ?? '')}
        suppressPasswordManager
        showStrengthMeter={false}
        disabled={busy}
      />
      <UnconnectedField
        name="nextPin"
        label={intl.formatMessage(messages.newPIN)}
        component={SegmentedCodeField}
        segments={8}
        characterSet="numeric"
        sensitive
        minLength={8}
        maxLength={8}
        autoComplete="one-time-code"
        value={nextPin}
        onChange={(next) => setNextPin(next ?? '')}
        disabled={busy}
      />
      <UnconnectedField
        name="nextPinConfirm"
        label={intl.formatMessage(messages.confirmNewPIN)}
        component={SegmentedCodeField}
        segments={8}
        characterSet="numeric"
        sensitive
        minLength={8}
        maxLength={8}
        autoComplete="one-time-code"
        value={nextPinConfirm}
        onChange={(next) => setNextPinConfirm(next ?? '')}
        disabled={busy}
      />
      {error && (
        <div
          className="bg-destructive text-destructive-contrast rounded p-4"
          role="alert"
        >
          <Paragraph margin="none">{error}</Paragraph>
        </div>
      )}
      <div className="mt-4 mb-6 flex gap-2">
        <Button onClick={() => void handleSave()} disabled={busy}>
          {busy
            ? intl.formatMessage(messages.saving)
            : intl.formatMessage(messages.saveNewPIN)}
        </Button>
        <Button color="secondary" onClick={onCancel} disabled={busy}>
          {intl.formatMessage(commonMessages.cancel)}
        </Button>
      </div>
    </>
  );
}

export function ChangePassphraseForm({
  onReEnrol,
  onSuccess,
  onCancel,
}: {
  onReEnrol: ReEnrolHandler;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const intl = useAppIntl();
  const [currentPhrase, setCurrentPhrase] = useState('');
  const [nextPhrase, setNextPhrase] = useState('');
  const [nextPhraseConfirm, setNextPhraseConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReactNode>(null);

  const strength = getPasswordStrength(nextPhrase);
  const nextIsStrong = nextPhrase.length >= 12 && strength.score >= 3;

  const handleSave = async () => {
    setError(null);
    if (!nextIsStrong) {
      setError(
        createElement(AppMessage, {
          message: messages.yourNewPassphraseMustBeAtLeast,
        }),
      );
      return;
    }
    if (nextPhrase !== nextPhraseConfirm) {
      setError(
        createElement(AppMessage, {
          message: messages.theTwoNewPassphrasesDoNotMatch,
        }),
      );
      return;
    }
    setBusy(true);
    try {
      const result = await onReEnrol(currentPhrase, nextPhrase);
      if (result.ok) {
        onSuccess();
        return;
      }
      setError(
        createElement(AppMessage, {
          message:
            result.localizedMessage?.descriptor ??
            messages.weCouldNotChangeYourPassphrase,
          values: result.localizedMessage?.values,
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <UnconnectedField
        name="currentPassphrase"
        label={intl.formatMessage(messages.currentPassphrase)}
        component={PasswordField}
        value={currentPhrase}
        onChange={(next) => setCurrentPhrase(next ?? '')}
        suppressPasswordManager
        showStrengthMeter={false}
        disabled={busy}
      />
      <UnconnectedField
        name="nextPassphrase"
        label={intl.formatMessage(messages.newPassphrase)}
        hint={intl.formatMessage(
          messages.atLeast12CharactersCombiningUppercaseLowercase,
        )}
        component={PasswordField}
        value={nextPhrase}
        onChange={(next) => setNextPhrase(next ?? '')}
        suppressPasswordManager
        showStrengthMeter={true}
        disabled={busy}
      />
      <UnconnectedField
        name="nextPassphraseConfirm"
        label={intl.formatMessage(messages.confirmNewPassphrase)}
        component={PasswordField}
        value={nextPhraseConfirm}
        onChange={(next) => setNextPhraseConfirm(next ?? '')}
        suppressPasswordManager
        showStrengthMeter={false}
        disabled={busy}
      />
      {nextPhraseConfirm.length > 0 && nextPhrase !== nextPhraseConfirm && (
        <Paragraph margin="none" className="text-destructive text-sm">
          {intl.formatMessage(messages.passphrasesDoNotMatch)}
        </Paragraph>
      )}
      {error && (
        <div
          className="bg-destructive text-destructive-contrast rounded p-4"
          role="alert"
        >
          <Paragraph margin="none">{error}</Paragraph>
        </div>
      )}
      <div className="mt-4 mb-6 flex gap-2">
        <Button onClick={() => void handleSave()} disabled={busy}>
          {busy
            ? intl.formatMessage(messages.saving)
            : intl.formatMessage(messages.saveNewPassphrase)}
        </Button>
        <Button color="secondary" onClick={onCancel} disabled={busy}>
          {intl.formatMessage(commonMessages.cancel)}
        </Button>
      </div>
    </>
  );
}

export function ManageAuthenticator() {
  const intl = useAppIntl();
  const auth = useAuth();
  const toast = useToast();
  const [changing, setChanging] = useState(false);

  const canChange = auth.mode === 'pin' || auth.mode === 'passphrase';
  // Treat the unconfigured state (no vault yet; auth.mode === undefined) the
  // same as an explicitly-enrolled 'none' vault — both mean "no device lock",
  // matching how AuthGate treats a plain browser tab. Otherwise a fresh tab
  // shows the "Authenticator" heading for a lock that doesn't exist.
  const hasNoLock = !auth.mode || auth.mode === 'none';

  return (
    <section>
      <Heading level="label" margin="none">
        {hasNoLock
          ? intl.formatMessage(messages.deviceLock)
          : intl.formatMessage(messages.authenticator)}
      </Heading>
      {hasNoLock && (
        <Paragraph intent="smallText" emphasis="muted">
          {intl.formatMessage(messages.noDeviceLockIsConfiguredDataOn)}
        </Paragraph>
      )}
      <dl className="font-monospace mt-4 mb-6 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-text/60">{intl.formatMessage(messages.mode)}</dt>
        <dd>
          {intl.formatMessage(
            (auth.mode && MODE_LABEL[auth.mode]) || messages.unknownMethod,
          )}
        </dd>
      </dl>

      {canChange && changing && auth.mode === 'pin' && (
        <ChangePinForm
          onReEnrol={auth.reEnrolWithPin}
          onCancel={() => setChanging(false)}
          onSuccess={() => {
            toast.add({
              title: createElement(AppMessage, {
                message: messages.pINChanged,
              }),
              variant: 'success',
            });
            setChanging(false);
          }}
        />
      )}
      {canChange && changing && auth.mode === 'passphrase' && (
        <ChangePassphraseForm
          onReEnrol={auth.reEnrolWithPassphrase}
          onCancel={() => setChanging(false)}
          onSuccess={() => {
            toast.add({
              title: createElement(AppMessage, {
                message: messages.passphraseChanged,
              }),
              variant: 'success',
            });
            setChanging(false);
          }}
        />
      )}

      {canChange && !changing && (
        <SettingsRow
          title={
            auth.mode === 'pin'
              ? intl.formatMessage(messages.changePIN)
              : intl.formatMessage(messages.changePassphrase)
          }
          desc={
            auth.mode === 'pin'
              ? intl.formatMessage(messages.replaceYour8DigitPINWithA)
              : intl.formatMessage(messages.replaceYourPassphraseWithANewOne)
          }
          control={
            <Button
              onClick={() => setChanging(true)}
              icon={<KeyRound className="size-4" />}
            >
              {auth.mode === 'pin'
                ? intl.formatMessage(messages.changePIN)
                : intl.formatMessage(messages.changePassphrase)}
            </Button>
          }
        />
      )}

      {auth.mode === 'biometric' && (
        <Paragraph intent="smallText" emphasis="muted">
          {intl.formatMessage(messages.toChangeYourUnlockMethodResetThe)}
        </Paragraph>
      )}
    </section>
  );
}

export function ResetDeviceRow() {
  const intl = useAppIntl();
  const auth = useAuth();
  const { confirm } = useDialog();

  // Unconfigured (auth.mode === undefined) and enrolled 'none' both mean "no
  // device lock" — there is nothing to revoke, so present the "reset" variant
  // rather than "revoke device lock".
  const isReset = !auth.mode || auth.mode === 'none';

  const handleRevoke = async () => {
    await confirm({
      title: isReset
        ? createElement(AppMessage, {
            message: messages.resetDeviceAndWipeData,
          })
        : createElement(AppMessage, {
            message: messages.revokeDeviceLockAndWipeData,
          }),
      description: createElement(AppMessage, {
        message: messages.thisWillDestroyAllDataOnThis,
      }),
      confirmLabel: createElement(AppMessage, {
        message: messages.destroyDeviceData,
      }),
      intent: 'destructive',
      describeError: () => <AppMessage message={commonMessages.genericError} />,
      onConfirm: async () => {
        await auth.revoke();
      },
    });
  };

  return (
    <SettingsRow
      title={
        isReset
          ? intl.formatMessage(messages.resetDevice)
          : intl.formatMessage(messages.revokeDeviceLock)
      }
      desc={intl.formatMessage(
        messages.destroyAllProtocolsSessionsAndStoredCredentials,
      )}
      control={
        <Button
          color="destructive"
          onClick={() => void handleRevoke()}
          icon={<ShieldOff className="size-4" />}
        >
          {isReset
            ? intl.formatMessage(messages.resetDevice)
            : intl.formatMessage(messages.revoke)}
        </Button>
      }
    />
  );
}
