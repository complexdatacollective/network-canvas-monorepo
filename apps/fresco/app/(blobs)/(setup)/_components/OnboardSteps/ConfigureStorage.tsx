'use client';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { type StorageEnvStatus } from '~/lib/storage/config';
import { type S3EnvValues } from '~/schemas/s3Settings';

import StorageProviderSelector from '../StorageProviderSelector';

const messages = defineMessages({
  configureStorage: {
    id: 'fresco.OnboardSteps.ConfigureStorage.configureStorage',
    defaultMessage: 'Configure Storage',
    description:
      'Heading of the storage step of the first-time setup wizard, where the researcher chooses where uploaded protocol files and exported data are kept.',
  },
  frescoNeedsAStorageProviderForProtocol: {
    id: 'fresco.OnboardSteps.ConfigureStorage.frescoNeedsAStorageProviderForProtocol',
    defaultMessage:
      'Fresco needs a storage provider for protocol assets and data exports. Choose between UploadThing (managed service) or an S3-compatible bucket (self-hosted or cloud).',
    description:
      'Explanatory paragraph under the heading of the storage step of the first-time setup wizard, introducing the choice between the two storage providers shown below it.',
  },
});

export default function ConfigureStorage({
  storageEnv,
  s3EnvValues,
}: {
  storageEnv: StorageEnvStatus;
  s3EnvValues: S3EnvValues | null;
}) {
  const intl = useAppIntl();

  return (
    <div className="w-full">
      <div className="mb-4">
        <Heading level="h2">
          {intl.formatMessage(messages.configureStorage)}
        </Heading>
        <Paragraph>
          {intl.formatMessage(messages.frescoNeedsAStorageProviderForProtocol)}
        </Paragraph>
        <StorageProviderSelector
          envStatus={storageEnv}
          s3EnvValues={s3EnvValues}
        />
      </div>
    </div>
  );
}
