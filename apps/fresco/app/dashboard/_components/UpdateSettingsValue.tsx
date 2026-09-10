'use client';

import { Loader2 } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import type { z } from 'zod/mini';

import { commonMessages } from '@codaco/app-i18n/common';
import {
  formatMessageError,
  createMessageError,
  defineMessages,
} from '@codaco/app-i18n/messages';
import { AppErrorMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { setAppSetting } from '~/actions/appSettings';
import { captureClientException } from '~/lib/posthog-client';
import { type AppSetting } from '~/schemas/appSettings';

import ReadOnlyEnvAlert from '../settings/ReadOnlyEnvAlert';

const messages = defineMessages({
  invalid: {
    id: 'fresco.UpdateSettingsValue.invalid',
    defaultMessage: 'Invalid: {details}',
    description: 'Researcher-facing UpdateSettingsValue: Invalid: details',
  },

  copyFailedToSaveSetting: {
    id: 'fresco.UpdateSettingsValue.copyFailedToSaveSetting',
    defaultMessage: 'Failed to save setting',
    description:
      'Researcher-facing UpdateSettingsValue: Failed to save setting',
  },
  copySaving: {
    id: 'fresco.UpdateSettingsValue.copySaving',
    defaultMessage: 'Saving...',
    description: 'Researcher-facing UpdateSettingsValue: Saving...',
  },
  reset: {
    id: 'fresco.UpdateSettingsValue.reset',
    defaultMessage: 'Reset',
    description: 'Researcher-facing UpdateSettingsValue: Reset',
  },
});

export default function UpdateSettingsValue({
  label,
  settingsKey,
  initialValue,
  readOnly,
  schema,
  suffixComponent,
  placeholder,
}: {
  label: string;
  settingsKey: AppSetting;
  initialValue?: string;
  readOnly?: boolean;
  schema: z.ZodMiniType<string>;
  suffixComponent?: ReactNode;
  placeholder?: string;
}) {
  const intl = useAppIntl();
  const errorId = useId();

  const [newValue, setNewValue] = useState(initialValue);
  const [error, setError] = useState<string | string[] | null>(null);
  const [isSaving, setSaving] = useState(false);

  // If settingsKey is empty or invalid, set the error state
  const handleChange = (value: string | undefined) => {
    const result = schema.safeParse(value ?? initialValue ?? '');

    if (!result.success) {
      setError(result.error.issues.map((issue) => issue.message));
    } else {
      setError(null);
    }

    setNewValue(result.data);
  };

  const handleReset = () => {
    setSaving(false);
    setError(null);
    setNewValue(initialValue);
  };

  const handleSave = async () => {
    if (!newValue) return;

    setSaving(true);
    setError(null);
    try {
      await setAppSetting(settingsKey, newValue);
    } catch (caught) {
      captureClientException(caught);
      setError(createMessageError(messages.copyFailedToSaveSetting));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {readOnly && <ReadOnlyEnvAlert />}
      <InputField
        aria-label={label}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        value={newValue}
        onChange={handleChange}
        onFocus={(event) => {
          if (event.target instanceof HTMLInputElement) {
            event.target.select();
          }
        }}
        type="text"
        className="w-full"
        placeholder={placeholder}
        disabled={readOnly ?? isSaving}
        suffixComponent={suffixComponent}
      />
      {error && (
        <p id={errorId} role="alert" className="text-destructive mt-2 text-sm">
          {Array.isArray(error) ? (
            intl.formatMessage(messages.invalid, {
              details: intl.formatList(
                error.map(
                  (message) => formatMessageError(message, intl) ?? message,
                ),
              ),
            })
          ) : (
            <AppErrorMessage error={error} />
          )}
        </p>
      )}
      {newValue !== initialValue && (
        <div className="mt-4 flex justify-end gap-2">
          {!isSaving && (
            <Button onClick={handleReset}>
              {intl.formatMessage(messages.reset)}
            </Button>
          )}
          <Button
            disabled={!!error || !newValue}
            onClick={handleSave}
            color="primary"
          >
            {isSaving && <Loader2 className="mr-2 animate-spin" />}
            {isSaving
              ? intl.formatMessage(messages.copySaving)
              : intl.formatMessage(commonMessages.save)}
          </Button>
        </div>
      )}
    </>
  );
}
