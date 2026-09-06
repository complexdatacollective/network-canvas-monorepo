'use client';

import { useState } from 'react';

import type { IntlShape } from '@codaco/app-i18n/messages';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import type { RichSelectOption } from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import { storageMessages } from '~/i18n/storageMessages';
import { type StorageEnvStatus } from '~/lib/storage/config';
import { type S3EnvValues } from '~/schemas/s3Settings';

import { S3ConfigForm } from './S3ConfigForm';
import { UploadThingTokenForm } from './UploadThingTokenForm';

const messages = defineMessages({
  s3Description: {
    id: 'fresco.StorageProviderSelector.s3Description',
    defaultMessage:
      'Self-hosted or cloud object storage (AWS S3, MinIO, Cloudflare R2, Backblaze B2).',
    description:
      'Researcher-facing StorageProviderSelector: Self-hosted or cloud object storage (AWS S3, MinIO, Cloudflare R2, Backblaze B2).',
  },

  uploadThingDescription: {
    id: 'fresco.StorageProviderSelector.uploadThingDescription',
    defaultMessage:
      'Third-party managed storage. Easy to set up \u2014 just paste your API token.',
    description:
      'Researcher-facing StorageProviderSelector: Third-party managed storage. Easy to set up \u2014 just paste your API token.',
  },

  theStorageProviderIsSetToVia: {
    id: 'fresco.StorageProviderSelector.theStorageProviderIsSetToVia',
    defaultMessage:
      'The storage provider is set to {value1} via the STORAGE_PROVIDER environment variable.',
    description:
      'Researcher-facing StorageProviderSelector: The storage provider is set to value via the STORAGE_PROVIDER environment variable.',
  },
});

type Provider = 'uploadthing' | 's3';

const getProviderOptions = (intl: IntlShape): RichSelectOption[] => [
  {
    value: 'uploadthing',
    label: 'UploadThing',
    description: intl.formatMessage(messages.uploadThingDescription),
  },
  {
    value: 's3',
    label: intl.formatMessage(storageMessages.s3Label),
    description: intl.formatMessage(messages.s3Description),
  },
];

export default function StorageProviderSelector({
  envStatus,
  s3EnvValues,
}: {
  envStatus: StorageEnvStatus;
  s3EnvValues: S3EnvValues | null;
}) {
  const intl = useAppIntl();

  const [selected, setSelected] = useState<Provider>(
    envStatus.pinnedProvider ?? 'uploadthing',
  );

  const pinned = Boolean(envStatus.pinnedProvider);

  const selectedEnvManaged =
    selected === 's3'
      ? envStatus.s3EnvManaged
      : envStatus.uploadThingEnvManaged;

  const providerOptions = getProviderOptions(intl);
  const options = pinned
    ? providerOptions.map((option) => ({ ...option, disabled: true }))
    : providerOptions;

  return (
    <div className="flex flex-col">
      {envStatus.pinnedProvider && (
        <Alert variant="info">
          <AlertDescription>
            {intl.formatMessage(messages.theStorageProviderIsSetToVia, {
              value1:
                envStatus.pinnedProvider === 's3'
                  ? intl.formatMessage(storageMessages.s3Label)
                  : 'UploadThing',
            })}
          </AlertDescription>
        </Alert>
      )}

      <RichSelectGroupField
        options={options}
        value={selected}
        onChange={(value) => {
          if (value === 'uploadthing' || value === 's3') {
            setSelected(value);
          }
        }}
        orientation="horizontal"
        size="md"
      />

      {selected === 'uploadthing' && (
        <>
          <hr />
          <UploadThingTokenForm disabled={selectedEnvManaged} />
        </>
      )}
      {selected === 's3' && (
        <>
          <hr />
          <S3ConfigForm
            disabled={selectedEnvManaged}
            defaultValues={s3EnvValues ?? undefined}
          />
        </>
      )}
    </div>
  );
}
