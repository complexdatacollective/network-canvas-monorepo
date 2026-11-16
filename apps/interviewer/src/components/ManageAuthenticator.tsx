import { KeyRound, ShieldOff } from 'lucide-react';
import { type ReactNode, createElement, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
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
    description:
      'Error shown in the Change PIN form when the new PIN is not exactly 8 digits. Appears in a red alert box after pressing the save button.',
  },
  theTwoNewPINsDoNotMatch: {
    id: 'interviewer.manageAuthenticator.theTwoNewPINsDoNotMatch',
    defaultMessage: 'The two new PINs do not match.',
    description:
      'Error shown in the Change PIN form when the "New PIN" and "Confirm new PIN" entries differ. Appears in a red alert box after pressing the save button.',
  },
  weCouldNotChangeYourPIN: {
    id: 'interviewer.manageAuthenticator.weCouldNotChangeYourPIN',
    defaultMessage: 'We could not change your PIN.',
    description:
      'Fallback error shown in the Change PIN form when saving the new PIN fails and no more specific reason is available.',
  },
  currentPIN: {
    id: 'interviewer.manageAuthenticator.currentPIN',
    defaultMessage: 'Current PIN',
    description:
      'Field label for the PIN that is currently set on the device, in the Change PIN form in Settings. The researcher enters it to confirm the change.',
  },
  newPIN: {
    id: 'interviewer.manageAuthenticator.newPIN',
    defaultMessage: 'New PIN',
    description:
      'Field label for the new 8-digit PIN to be set, in the Change PIN form in Settings.',
  },
  confirmNewPIN: {
    id: 'interviewer.manageAuthenticator.confirmNewPIN',
    defaultMessage: 'Confirm new PIN',
    description:
      'Field label for re-entering the new 8-digit PIN to check it was typed correctly, in the Change PIN form in Settings.',
  },
  saving: {
    id: 'interviewer.manageAuthenticator.saving',
    defaultMessage: 'Saving…',
    description:
      'Label of the save button in the Change PIN and Change passphrase forms while the change is being saved.',
  },
  saveNewPIN: {
    id: 'interviewer.manageAuthenticator.saveNewPIN',
    defaultMessage: 'Save new PIN',
    description:
      'Button in the Change PIN form in Settings that replaces the device PIN with the new one entered.',
  },
  yourNewPassphraseMustBeAtLeast: {
    id: 'interviewer.manageAuthenticator.yourNewPassphraseMustBeAtLeast',
    defaultMessage:
      'Your new passphrase must be at least 12 characters and combine uppercase, lowercase, numbers, and symbols.',
    description:
      'Error shown in the Change passphrase form when the new passphrase is too short or too weak. Appears in a red alert box after pressing the save button.',
  },
  theTwoNewPassphrasesDoNotMatch: {
    id: 'interviewer.manageAuthenticator.theTwoNewPassphrasesDoNotMatch',
    defaultMessage: 'The two new passphrases do not match.',
    description:
      'Error shown in the Change passphrase form when the new passphrase and its confirmation differ. Appears in a red alert box after pressing the save button.',
  },
  weCouldNotChangeYourPassphrase: {
    id: 'interviewer.manageAuthenticator.weCouldNotChangeYourPassphrase',
    defaultMessage: 'We could not change your passphrase.',
    description:
      'Fallback error shown in the Change passphrase form when saving the new passphrase fails and no more specific reason is available.',
  },
  currentPassphrase: {
    id: 'interviewer.manageAuthenticator.currentPassphrase',
    defaultMessage: 'Current passphrase',
    description:
      'Field label for the passphrase currently set on the device, in the Change passphrase form in Settings. The researcher enters it to confirm the change.',
  },
  newPassphrase: {
    id: 'interviewer.manageAuthenticator.newPassphrase',
    defaultMessage: 'New passphrase',
    description:
      'Field label for the new passphrase to be set, in the Change passphrase form in Settings.',
  },
  atLeast12CharactersCombiningUppercaseLowercase: {
    id: 'interviewer.manageAuthenticator.atLeast12CharactersCombiningUppercaseLowercase',
    defaultMessage:
      'At least 12 characters, combining uppercase, lowercase, numbers, and symbols.',
    description:
      'Hint shown under the "New passphrase" field, describing the strength requirements a new passphrase must meet.',
  },
  confirmNewPassphrase: {
    id: 'interviewer.manageAuthenticator.confirmNewPassphrase',
    defaultMessage: 'Confirm new passphrase',
    description:
      'Field label for re-entering the new passphrase to check it was typed correctly, in the Change passphrase form in Settings.',
  },
  passphrasesDoNotMatch: {
    id: 'interviewer.manageAuthenticator.passphrasesDoNotMatch',
    defaultMessage: 'Passphrases do not match.',
    description:
      'Inline error shown under the confirmation field of the Change passphrase form as soon as it has text that differs from the new passphrase.',
  },
  saveNewPassphrase: {
    id: 'interviewer.manageAuthenticator.saveNewPassphrase',
    defaultMessage: 'Save new passphrase',
    description:
      'Button in the Change passphrase form in Settings that replaces the device passphrase with the new one entered.',
  },
  deviceLock: {
    id: 'interviewer.manageAuthenticator.deviceLock',
    defaultMessage: 'Device lock',
    description:
      'Section heading in Settings shown when no device lock (PIN, passphrase or biometric) is set up. "Lock" is the security feature, not the action of locking.',
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
    description:
      'Explanatory note under the "Device lock" heading in Settings, shown when no device lock is set up. The "Get started wizard" is the app\'s security setup wizard.',
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
    description:
      'Title of the Settings row, and the label of its button, for changing the device PIN. Shown only when a PIN is the unlock method.',
  },
  changePassphrase: {
    id: 'interviewer.manageAuthenticator.changePassphrase',
    defaultMessage: 'Change passphrase',
    description:
      'Title of the Settings row, and the label of its button, for changing the device passphrase. Shown only when a passphrase is the unlock method.',
  },
  replaceYour8DigitPINWithA: {
    id: 'interviewer.manageAuthenticator.replaceYour8DigitPINWithA',
    defaultMessage:
      'Replace your 8-digit PIN with a new one. Your data stays intact.',
    description:
      'Description under the "Change PIN" row in Settings, explaining that a new PIN replaces the old one without losing any stored data.',
  },
  replaceYourPassphraseWithANewOne: {
    id: 'interviewer.manageAuthenticator.replaceYourPassphraseWithANewOne',
    defaultMessage:
      'Replace your passphrase with a new one. Your data stays intact.',
    description:
      'Description under the "Change passphrase" row in Settings, explaining that a new passphrase replaces the old one without losing any stored data.',
  },
  toChangeYourUnlockMethodResetThe: {
    id: 'interviewer.manageAuthenticator.toChangeYourUnlockMethodResetThe',
    defaultMessage:
      'To change your unlock method, reset the device and run setup again. Resetting destroys all data on this device.',
    description:
      'Note in Settings shown when biometric unlock is in use, explaining that the unlock method can only be changed by resetting the device, which deletes all its data.',
  },
  resetDeviceAndWipeData: {
    id: 'interviewer.manageAuthenticator.resetDeviceAndWipeData',
    defaultMessage: 'Reset device and wipe data?',
    description:
      'Title of the confirmation dialog for resetting the device, shown in Settings when no device lock is set up. Resetting deletes all data on the device.',
  },
  revokeDeviceLockAndWipeData: {
    id: 'interviewer.manageAuthenticator.revokeDeviceLockAndWipeData',
    defaultMessage: 'Revoke device lock and wipe data?',
    description:
      'Title of the confirmation dialog for removing the device lock, shown in Settings when a lock is set up. Doing so deletes all data on the device.',
  },
  thisWillDestroyAllDataOnThis: {
    id: 'interviewer.manageAuthenticator.thisWillDestroyAllDataOnThis',
    defaultMessage: 'This will destroy all data on this device. Continue?',
    description:
      'Warning text in the reset/revoke confirmation dialog, asking the researcher to confirm that all data on the device will be permanently destroyed.',
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
    description:
      'Title of the Settings row, and the label of its button, for resetting the device. Shown when no device lock is set up. It deletes all data and restarts setup.',
  },
  revokeDeviceLock: {
    id: 'interviewer.manageAuthenticator.revokeDeviceLock',
    defaultMessage: 'Revoke device lock',
    description:
      'Title of the Settings row for removing the device lock, shown when a lock is set up. It deletes all data and restarts setup.',
  },
  destroyAllProtocolsSessionsAndStoredCredentials: {
    id: 'interviewer.manageAuthenticator.destroyAllProtocolsSessionsAndStoredCredentials',
    defaultMessage:
      'Destroy all protocols, sessions, and stored credentials on this device, then restart setup.',
    description:
      'Description under the "Reset device" or "Revoke device lock" row in Settings, stating what the action deletes before setup restarts.',
  },
  pINChanged: {
    id: 'interviewer.manageAuthenticator.pINChanged',
    defaultMessage: 'PIN changed',
    description:
      'Title of the success toast shown after the device PIN has been changed in Settings.',
  },
  passphraseChanged: {
    id: 'interviewer.manageAuthenticator.passphraseChanged',
    defaultMessage: 'Passphrase changed',
    description:
      'Title of the success toast shown after the device passphrase has been changed in Settings.',
  },
  revoke: {
    id: 'interviewer.manageAuthenticator.revoke',
    defaultMessage: 'Revoke',
    description:
      'Label of the destructive button in Settings that removes the device lock. "Revoke" is a verb; it opens a confirmation dialog and deletes all device data.',
  },
  pinMethod: {
    id: 'interviewer.manageAuthenticator.pinMethod',
    defaultMessage: 'PIN',
    description:
      'Name of the PIN unlock method, shown as the value of "Mode" in the Settings device lock section. A PIN is an 8-digit code.',
  },
  passphraseMethod: {
    id: 'interviewer.manageAuthenticator.passphraseMethod',
    defaultMessage: 'Passphrase',
    description:
      'Name of the passphrase unlock method, shown as the value of "Mode" in the Settings device lock section.',
  },
  biometricMethod: {
    id: 'interviewer.manageAuthenticator.biometricMethod',
    defaultMessage: 'Biometric (with recovery passphrase)',
    description:
      'Name of the biometric unlock method, shown as the value of "Mode" in the Settings device lock section. A recovery passphrase is also set as a fallback.',
  },
  noLock: {
    id: 'interviewer.manageAuthenticator.noLock',
    defaultMessage: 'No device lock',
    description:
      'Value of "Mode" in the Settings device lock section when no unlock method is set up.',
  },
  unknownMethod: {
    id: 'interviewer.manageAuthenticator.unknownMethod',
    defaultMessage: 'Unknown',
    description:
      'Value of "Mode" in the Settings device lock section when the unlock method cannot be identified.',
  },
});

const MODE_LABEL: Record<string, MessageDescriptor> = {
  pin: messages.pinMethod,
  passphrase: messages.passphraseMethod,
  biometric: messages.biometricMethod,
  none: messages.noLock,
};

const PIN_PATTERN = /^\d{8}$/;

// Localised nodes handed to the toast and confirm APIs. Built once at module
// scope so the handlers that pass them along stay plain callbacks rather than
// element factories re-created on every render.
const pinChangedTitle = createElement(AppMessage, {
  message: messages.pINChanged,
});
const passphraseChangedTitle = createElement(AppMessage, {
  message: messages.passphraseChanged,
});
const resetDeviceTitle = createElement(AppMessage, {
  message: messages.resetDeviceAndWipeData,
});
const revokeDeviceLockTitle = createElement(AppMessage, {
  message: messages.revokeDeviceLockAndWipeData,
});
const revokeDescription = createElement(AppMessage, {
  message: messages.thisWillDestroyAllDataOnThis,
});
const revokeConfirmLabel = createElement(AppMessage, {
  message: messages.destroyDeviceData,
});
const describeGenericError = () => (
  <AppMessage message={commonMessages.genericError} />
);

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
        <Paragraph
          intent="smallText"
          margin="none"
          className="text-destructive"
        >
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
              title: pinChangedTitle,
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
              title: passphraseChangedTitle,
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
      title: isReset ? resetDeviceTitle : revokeDeviceLockTitle,
      description: revokeDescription,
      confirmLabel: revokeConfirmLabel,
      intent: 'destructive',
      describeError: describeGenericError,
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
