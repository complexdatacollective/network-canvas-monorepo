'use client';

import { startRegistration } from '@simplewebauthn/browser';
import { KeyRound, Plus, Trash } from 'lucide-react';
import { useState } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import {
  AppErrorMessage,
  AppMessage,
  useAppIntl,
} from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import { Button } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Surface from '@codaco/fresco-ui/layout/Surface';
import {
  generateRegistrationOptions,
  removePasskey,
  verifyRegistration,
} from '~/actions/webauthn';
import SettingsField from '~/components/settings/SettingsField';
import { formatPasskeyName } from '~/i18n/passkeyNames';

const messages = defineMessages({
  registeredCount: {
    id: 'fresco.settings.PasskeySettings.registeredCount',
    defaultMessage:
      '{count, plural, one {# passkey registered.} other {# passkeys registered.}}',
    description:
      'Researcher-facing settings.PasskeySettings: count, plural, one # passkey registered. other # passkeys registered.',
  },

  never: {
    id: 'fresco.settings.passkeys.never',
    defaultMessage: 'Never',
    description: 'Researcher-facing settings.passkeys: Never',
  },

  copyFailedToStartRegistration: {
    id: 'fresco.settings.PasskeySettings.copyFailedToStartRegistration',
    defaultMessage: 'Failed to start registration',
    description:
      'Researcher-facing settings / PasskeySettings: Failed to start registration',
  },
  copyPasskeyRegistrationFailed: {
    id: 'fresco.settings.PasskeySettings.copyPasskeyRegistrationFailed',
    defaultMessage: 'Passkey registration failed',
    description:
      'Researcher-facing settings / PasskeySettings: Passkey registration failed',
  },
  copyRegisterAPasskeyForTheHighestLevel: {
    id: 'fresco.settings.PasskeySettings.copyRegisterAPasskeyForTheHighestLevel',
    defaultMessage:
      'Register a passkey for the highest level of security. You will sign in without a password using biometrics or a security key.',
    description:
      'Researcher-facing settings / PasskeySettings: Register a passkey for the highest level of security. You will sign in without a password using biometrics or a security key.',
  },
  copyRegistering: {
    id: 'fresco.settings.PasskeySettings.copyRegistering',
    defaultMessage: 'Registering...',
    description: 'Researcher-facing settings / PasskeySettings: Registering...',
  },
  copyAddPasskey: {
    id: 'fresco.settings.PasskeySettings.copyAddPasskey',
    defaultMessage: 'Add passkey',
    description: 'Researcher-facing settings / PasskeySettings: Add passkey',
  },
  copySynced: {
    id: 'fresco.settings.PasskeySettings.copySynced',
    defaultMessage: 'Synced',
    description: 'Researcher-facing settings / PasskeySettings: Synced',
  },
  copyDeviceBound: {
    id: 'fresco.settings.PasskeySettings.copyDeviceBound',
    defaultMessage: 'Device-bound',
    description: 'Researcher-facing settings / PasskeySettings: Device-bound',
  },
  copySetAPasswordBeforeRemovingYourOnly: {
    id: 'fresco.settings.PasskeySettings.copySetAPasswordBeforeRemovingYourOnly',
    defaultMessage: 'Set a password before removing your only passkey',
    description:
      'Researcher-facing settings / PasskeySettings: Set a password before removing your only passkey',
  },
  removePasskey: {
    id: 'fresco.settings.PasskeySettings.removePasskey',
    defaultMessage: 'Remove Passkey',
    description: 'Researcher-facing settings / PasskeySettings: Remove Passkey',
  },
  removeYouWonTBeAbleTo: {
    id: 'fresco.settings.PasskeySettings.removeYouWonTBeAbleTo',
    defaultMessage:
      '{nameMode, select, named {Remove "{name}"?} other {Remove this unnamed passkey?}} You won\'t be able to sign in with it anymore.',
    description:
      'Researcher-facing settings / PasskeySettings: Remove "value"? You won\'t be able to sign in with it anymore.',
  },
  remove: {
    id: 'fresco.settings.PasskeySettings.remove',
    defaultMessage: 'Remove',
    description: 'Researcher-facing settings / PasskeySettings: Remove',
  },
  passkeys: {
    id: 'fresco.settings.PasskeySettings.passkeys',
    defaultMessage: 'Passkeys',
    description: 'Researcher-facing settings / PasskeySettings: Passkeys',
  },
  added: {
    id: 'fresco.settings.PasskeySettings.added',
    defaultMessage: 'Added {value1}',
    description: 'Researcher-facing settings / PasskeySettings: Added value',
  },
  lastUsed: {
    id: 'fresco.settings.PasskeySettings.lastUsed',
    defaultMessage: 'Last used {value1}',
    description:
      'Researcher-facing settings / PasskeySettings: Last used value',
  },
});

type Passkey = {
  id: string;
  friendlyName: string | null;
  deviceType: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  backedUp: boolean;
};

type PasskeySettingsProps = {
  initialPasskeys: Passkey[];
  sandboxMode: boolean;
  hasPassword: boolean;
};

function RemovePasskeyDescription({ passkey }: { passkey: Passkey }) {
  const intl = useAppIntl();
  const name = formatPasskeyName(intl, passkey);
  return intl.formatMessage(messages.removeYouWonTBeAbleTo, {
    nameMode: name ? 'named' : 'unnamed',
    name,
  });
}

export default function PasskeySettings({
  initialPasskeys,
  sandboxMode,
  hasPassword,
}: PasskeySettingsProps) {
  const intl = useAppIntl();

  const [passkeys, setPasskeys] = useState<Passkey[]>(initialPasskeys);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm } = useDialog();

  const handleAddPasskey = async () => {
    setError(null);
    setLoading(true);

    try {
      const { error: genError, data } = await generateRegistrationOptions();
      if (genError || !data) {
        setError(
          genError ??
            createMessageError(messages.copyFailedToStartRegistration),
        );
        return;
      }

      // IMMEDIATELY call startRegistration — preserves Safari user gesture
      const credential = await startRegistration({
        optionsJSON: data.options,
      });

      const result = await verifyRegistration({ credential });
      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.data) {
        setPasskeys((prev) => [
          {
            id: result.data.id,
            friendlyName: result.data.friendlyName,
            deviceType: result.data.deviceType,
            createdAt: result.data.createdAt,
            lastUsedAt: null,
            backedUp: false,
          },
          ...prev,
        ]);
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'NotAllowedError') {
        return;
      }
      setError(createMessageError(messages.copyPasskeyRegistrationFailed));
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePasskey = (passkey: Passkey) => {
    void confirm({
      title: <AppMessage message={messages.removePasskey} />,
      description: <RemovePasskeyDescription passkey={passkey} />,
      confirmLabel: <AppMessage message={messages.remove} />,
      onConfirm: async () => {
        const result = await removePasskey(passkey.id);
        if (result.error) {
          setError(result.error);
        } else {
          setPasskeys((prev) => prev.filter((p) => p.id !== passkey.id));
        }
      },
    });
  };

  return (
    <SettingsField
      label={intl.formatMessage(messages.passkeys)}
      description={
        passkeys.length === 0
          ? intl.formatMessage(messages.copyRegisterAPasskeyForTheHighestLevel)
          : intl.formatMessage(messages.registeredCount, {
              count: passkeys.length,
            })
      }
      testId="passkey-field"
      control={
        <Button
          size="sm"
          onClick={() => void handleAddPasskey()}
          disabled={sandboxMode || loading}
          color="primary"
          icon={<Plus />}
        >
          {loading
            ? intl.formatMessage(messages.copyRegistering)
            : intl.formatMessage(messages.copyAddPasskey)}
        </Button>
      }
    >
      {error && (
        <p className="text-destructive mb-3 text-sm">
          <AppErrorMessage error={error} />
        </p>
      )}

      {passkeys.length > 0 && (
        <div className="flex flex-col gap-2">
          {passkeys.map((passkey) => (
            <Surface
              spacing="xs"
              key={passkey.id}
              data-testid="passkey-item"
              className="tablet-portrait:flex-row tablet-portrait:items-center tablet-portrait:justify-between flex flex-col items-start gap-3"
            >
              <div className="flex min-w-0 items-start gap-3">
                <KeyRound className="size-6 shrink-0" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium wrap-break-word">
                      {formatPasskeyName(intl, passkey)}
                    </span>
                    <Badge variant="outline">
                      {passkey.deviceType === 'multiDevice'
                        ? intl.formatMessage(messages.copySynced)
                        : intl.formatMessage(messages.copyDeviceBound)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    <span data-testid="passkey-date-created">
                      {intl.formatMessage(messages.added, {
                        value1: intl.formatDate(passkey.createdAt, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        }),
                      })}
                    </span>
                    <span data-testid="passkey-date-used">
                      {intl.formatMessage(messages.lastUsed, {
                        value1: passkey.lastUsedAt
                          ? intl.formatDate(passkey.lastUsedAt, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })
                          : intl.formatMessage(messages.never),
                      })}
                    </span>
                  </div>
                </div>
              </div>
              <Button
                variant="text"
                size="sm"
                className="tablet-portrait:shrink-0 tablet-portrait:self-center self-end"
                onClick={() => handleRemovePasskey(passkey)}
                disabled={
                  sandboxMode || (passkeys.length === 1 && !hasPassword)
                }
                title={
                  passkeys.length === 1 && !hasPassword
                    ? intl.formatMessage(
                        messages.copySetAPasswordBeforeRemovingYourOnly,
                      )
                    : undefined
                }
                icon={<Trash />}
                color="destructive"
              >
                {intl.formatMessage(messages.remove)}
              </Button>
            </Surface>
          ))}
        </div>
      )}
    </SettingsField>
  );
}
