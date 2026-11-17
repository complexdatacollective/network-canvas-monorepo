'use client';

import type { ReactNode } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';

const messages = defineMessages({
  thisSettingIsControlledByYourEnv: {
    id: 'fresco.settings.ReadOnlyEnvAlert.thisSettingIsControlledByYourEnv',
    defaultMessage:
      'This setting is controlled by your <tag1>.env</tag1> file, and so can only be changed by modifying that file.',
    description:
      'Information banner shown in Settings above a setting that the installation fixes through its .env configuration file, so the control is disabled. The tag1 element formats the file name .env; do not translate it.',
  },
});

const renderCodeChunks = (chunks: ReactNode[]) => <code>{chunks}</code>;

export default function ReadOnlyEnvAlert() {
  const intl = useAppIntl();

  return (
    <Alert variant="info">
      <AlertDescription>
        {intl.formatMessage(messages.thisSettingIsControlledByYourEnv, {
          tag1: renderCodeChunks,
        })}
      </AlertDescription>
    </Alert>
  );
}
