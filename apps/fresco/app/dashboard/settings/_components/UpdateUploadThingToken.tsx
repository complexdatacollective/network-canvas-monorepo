'use client';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { createUploadThingSchemas } from '~/schemas/appSettings';

import UpdateSettingsValue from '../../_components/UpdateSettingsValue';

const messages = defineMessages({
  savedTokenIsHidden: {
    id: 'fresco.settings.UpdateUploadThingToken.savedTokenIsHidden',
    defaultMessage: '•••••••• (saved token is hidden)',
    description:
      'Placeholder of the empty UploadThing API token field in Settings; the dots stand for the saved token, which is never shown. Keep the dots.',
  },
});

// The saved token is write-only: it is never sent back to the client, so the
// editor starts empty and only allows saving a new value.
export default function UpdateUploadThingToken({ label }: { label: string }) {
  const intl = useAppIntl();
  const { createUploadThingTokenSchema } =
    createUploadThingSchemas(createMessageError);

  return (
    <UpdateSettingsValue
      label={label}
      settingsKey="uploadThingToken"
      schema={createUploadThingTokenSchema}
      placeholder={intl.formatMessage(messages.savedTokenIsHidden)}
    />
  );
}
