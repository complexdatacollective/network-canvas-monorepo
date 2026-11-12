'use client';

import { useId, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { AppErrorMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { setAppSetting } from '~/actions/appSettings';
import SettingsField from '~/components/settings/SettingsField';
import { captureClientException } from '~/lib/posthog-client';
import { type AppSetting } from '~/schemas/appSettings';

const messages = defineMessages({
  secret: {
    id: 'fresco.settings.s3.secret',
    defaultMessage: 'Secret Access Key',
    description:
      'Label and accessible name of a password-style field in the Storage card of Settings: the secret half of the S3 storage credentials. Not a passkey or a two-factor code.',
  },

  accessKey: {
    id: 'fresco.settings.s3.accessKey',
    defaultMessage: 'Access Key ID',
    description:
      'Label and accessible name of a password-style field in the Storage card of Settings: the identifier half of the S3 storage credentials. Not a passkey.',
  },

  region: {
    id: 'fresco.settings.s3.region',
    defaultMessage: 'Region',
    description:
      'Label and accessible name of the text field in the Storage card of Settings for the cloud region of the S3 storage bucket (a data-centre location, not a country setting).',
  },

  bucket: {
    id: 'fresco.settings.s3.bucket',
    defaultMessage: 'Bucket Name',
    description:
      'Label and accessible name of the text field in the Storage card of Settings for the name of the S3 bucket that holds uploaded files.',
  },

  publicURL: {
    id: 'fresco.settings.s3.publicURL',
    defaultMessage: 'Public URL',
    description:
      "Label and accessible name of the text field in the Storage card of Settings for the public web address (URL) through which the S3 bucket's files are reached.",
  },

  endpoint: {
    id: 'fresco.settings.s3.endpoint',
    defaultMessage: 'Endpoint URL',
    description:
      'Label and accessible name of the text field in the Storage card of Settings for the web address (URL) of the S3-compatible storage service Fresco connects to.',
  },

  copyFailedToSaveSetting: {
    id: 'fresco.settings.UpdateS3Settings.copyFailedToSaveSetting',
    defaultMessage: 'Failed to save setting',
    description:
      'Error shown in red under an S3 storage field in Settings when saving the value the researcher entered failed.',
  },
  copySaving: {
    id: 'fresco.settings.UpdateS3Settings.copySaving',
    defaultMessage: 'Saving...',
    description:
      'Label of the Save button under an S3 storage field in Settings while the value is being saved (progress state).',
  },
  reset: {
    id: 'fresco.settings.UpdateS3Settings.reset',
    defaultMessage: 'Reset',
    description:
      'Button beside Save under an S3 storage field in Settings, shown after the text was changed; puts the field back to its last saved value (verb).',
  },
});

type S3Field = {
  key: Extract<AppSetting, `s3${string}`>;
  label: MessageDescriptor;
  type: 'text' | 'password';
};

const s3Fields: S3Field[] = [
  { key: 's3Endpoint', label: messages.endpoint, type: 'text' },
  { key: 's3PublicUrl', label: messages.publicURL, type: 'text' },
  { key: 's3Bucket', label: messages.bucket, type: 'text' },
  { key: 's3Region', label: messages.region, type: 'text' },
  { key: 's3AccessKeyId', label: messages.accessKey, type: 'password' },
  { key: 's3SecretAccessKey', label: messages.secret, type: 'password' },
];

export default function UpdateS3Settings({
  initialValues,
}: {
  initialValues: Partial<Record<S3Field['key'], string>>;
}) {
  const intl = useAppIntl();
  return (
    <>
      {s3Fields.map((field) => (
        <SettingsField key={field.key} label={intl.formatMessage(field.label)}>
          <S3FieldEditor
            label={intl.formatMessage(field.label)}
            settingsKey={field.key}
            inputType={field.type}
            initialValue={initialValues[field.key] ?? ''}
          />
        </SettingsField>
      ))}
    </>
  );
}

function S3FieldEditor({
  label,
  settingsKey,
  inputType,
  initialValue,
}: {
  label: string;
  settingsKey: S3Field['key'];
  inputType: 'text' | 'password';
  initialValue: string;
}) {
  const intl = useAppIntl();

  const errorId = useId();
  const [value, setValue] = useState(initialValue);
  const [isSaving, setSaving] = useState(false);
  const [savedValue, setSavedValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  // Secret values are write-only: they are never sent to the client, so the
  // input starts empty and saving an empty value is disallowed to prevent
  // accidentally blanking the stored secret.
  const isWriteOnly = inputType === 'password';

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await setAppSetting(settingsKey, value);
      setSavedValue(value);
    } catch (caught) {
      captureClientException(caught);
      setError(createMessageError(messages.copyFailedToSaveSetting));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <InputField
        aria-label={label}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        value={value}
        onChange={(v) => setValue(v ?? '')}
        type={inputType}
        placeholder={isWriteOnly ? secretPlaceholder : undefined}
        className="w-full"
        disabled={isSaving}
      />
      {error && (
        <p id={errorId} role="alert" className="text-destructive mt-2 text-sm">
          <AppErrorMessage error={error} />
        </p>
      )}
      {value !== savedValue && (
        <div className="mt-2 flex justify-end gap-2">
          <Button
            onClick={() => {
              setValue(savedValue);
            }}
          >
            {intl.formatMessage(messages.reset)}
          </Button>
          <Button
            onClick={handleSave}
            color="primary"
            disabled={isSaving || (isWriteOnly && value === '')}
          >
            {isSaving
              ? intl.formatMessage(messages.copySaving)
              : intl.formatMessage(commonMessages.save)}
          </Button>
        </div>
      )}
    </div>
  );
}

// Stable brand/data display; not translated application copy.
const secretPlaceholder = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
