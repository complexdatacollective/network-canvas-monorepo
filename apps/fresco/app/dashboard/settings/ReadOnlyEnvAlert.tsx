'use client';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';

const messages = defineMessages({
  thisSettingIsControlledByYourEnv: {
    id: 'fresco.settings.ReadOnlyEnvAlert.thisSettingIsControlledByYourEnv',
    defaultMessage:
      'This setting is controlled by your <tag1>.env</tag1> file, and so can only be changed by modifying that file.',
    description:
      'Researcher-facing settings / ReadOnlyEnvAlert: This setting is controlled by your .env file, and so can only be changed by modifying that file.',
  },
});

export default function ReadOnlyEnvAlert() {
  const intl = useAppIntl();

  return (
    <Alert variant="info">
      <AlertDescription>
        {intl.formatMessage(messages.thisSettingIsControlledByYourEnv, {
          tag1: (chunks) => <code>{chunks}</code>,
        })}
      </AlertDescription>
    </Alert>
  );
}
