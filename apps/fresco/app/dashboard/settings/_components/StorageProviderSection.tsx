import type { ReactNode } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Link from '~/components/Link';
import SettingsCard from '~/components/settings/SettingsCard';
import SettingsField from '~/components/settings/SettingsField';
import { getServerIntl } from '~/i18n/server';
import { storageMessages } from '~/i18n/storageMessages';
import { getStorageEnvStatus } from '~/lib/storage/config';
import { getAppSetting } from '~/queries/appSettings';
import { getStorageProvider } from '~/queries/storageProvider';

import UpdateS3Settings from './UpdateS3Settings';
import UpdateUploadThingToken from './UpdateUploadThingToken';

const messages = defineMessages({
  uploadThingHelp: {
    id: 'fresco.settings.storage.uploadThingHelp',
    defaultMessage:
      'The API key used to communicate with UploadThing. See the <link>deployment documentation</link> for details.',
    description:
      'Hint under the UploadThing API key field in the Storage card of Settings. The link tag wraps the words that link to the deployment documentation; keep the tag.',
  },

  storage: {
    id: 'fresco.settings.StorageProviderSection.storage',
    defaultMessage: 'Storage',
    description:
      'Title of the Storage card in Settings, where the researcher sees and edits where uploaded files are stored.',
  },
  storageProvider: {
    id: 'fresco.settings.StorageProviderSection.storageProvider',
    defaultMessage: 'Storage Provider',
    description:
      'Label of the first field in the Storage card of Settings; names the service (S3-compatible storage or UploadThing) that stores uploaded files.',
  },
  filesAreStoredUsing: {
    id: 'fresco.settings.StorageProviderSection.filesAreStoredUsing',
    defaultMessage: 'Files are stored using {value1}.',
    description:
      'Hint under the Storage Provider label in Settings. value1 is the name of the storage provider in use: S3-compatible storage or UploadThing.',
  },
  storageIsConfiguredViaEnvironmentVariablesAnd: {
    id: 'fresco.settings.StorageProviderSection.storageIsConfiguredViaEnvironmentVariablesAnd',
    defaultMessage:
      'Storage is configured via environment variables ( {value1}) and cannot be edited here. Remove these variables to manage storage from this dashboard.',
    description:
      'Info alert in the Storage card of Settings, shown when the storage is set by server environment variables. value1 is the list of those variable names. Removing them makes storage editable here.',
  },
  theStorageProviderTypeCannotBeChanged: {
    id: 'fresco.settings.StorageProviderSection.theStorageProviderTypeCannotBeChanged',
    defaultMessage:
      'The storage provider type cannot be changed once the application has been deployed. You can update the credentials below.',
    description:
      'Info alert in the Storage card of Settings: the choice of storage provider is fixed after deployment, but its credentials listed below can be edited.',
  },
  uploadThingAPIKey: {
    id: 'fresco.settings.StorageProviderSection.uploadThingAPIKey',
    defaultMessage: 'UploadThing API Key',
    description:
      'Label and accessible name of the field in the Storage card of Settings for the secret token that authorises Fresco to use UploadThing. Not a passkey or a two-factor code.',
  },
});

const renderUploadThingHelpLinkChunks = (chunks: ReactNode[]) => (
  <Link href="https://documentation.networkcanvas.com/en/fresco/deployment/guide#create-a-storage-bucket-using-uploadthing">
    {chunks}
  </Link>
);

export default async function StorageProviderSection() {
  const intl = await getServerIntl();

  const [provider, s3Endpoint, s3PublicUrl, s3Bucket, s3Region] =
    await Promise.all([
      getStorageProvider(),
      getAppSetting('s3Endpoint'),
      getAppSetting('s3PublicUrl'),
      getAppSetting('s3Bucket'),
      getAppSetting('s3Region'),
    ]);

  const envStatus = getStorageEnvStatus();
  const providerLabel =
    provider === 's3'
      ? intl.formatMessage(storageMessages.s3Label)
      : 'UploadThing';

  const activeProviderEnvManaged =
    provider === 's3'
      ? envStatus.s3EnvManaged
      : envStatus.uploadThingEnvManaged;

  if (activeProviderEnvManaged) {
    return (
      <SettingsCard
        id="storage"
        title={intl.formatMessage(messages.storage)}
        divideChildren
      >
        <SettingsField
          label={intl.formatMessage(messages.storageProvider)}
          description={intl.formatMessage(messages.filesAreStoredUsing, {
            value1: providerLabel,
          })}
        >
          <Alert variant="info">
            <AlertDescription>
              {intl.formatMessage(
                messages.storageIsConfiguredViaEnvironmentVariablesAnd,
                { value1: intl.formatList(envStatus.setVariables) },
              )}
            </AlertDescription>
          </Alert>
        </SettingsField>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      id="storage"
      title={intl.formatMessage(messages.storage)}
      divideChildren
    >
      <SettingsField
        label={intl.formatMessage(messages.storageProvider)}
        description={intl.formatMessage(messages.filesAreStoredUsing, {
          value1: providerLabel,
        })}
      >
        <Alert variant="info">
          <AlertDescription>
            {intl.formatMessage(messages.theStorageProviderTypeCannotBeChanged)}
          </AlertDescription>
        </Alert>
      </SettingsField>

      {provider === 'uploadthing' && (
        <SettingsField
          label={intl.formatMessage(messages.uploadThingAPIKey)}
          description={intl.formatMessage(messages.uploadThingHelp, {
            link: renderUploadThingHelpLinkChunks,
          })}
        >
          <UpdateUploadThingToken
            label={intl.formatMessage(messages.uploadThingAPIKey)}
          />
        </SettingsField>
      )}

      {provider === 's3' && (
        <UpdateS3Settings
          initialValues={{
            s3Endpoint: s3Endpoint ?? undefined,
            s3PublicUrl: s3PublicUrl ?? undefined,
            s3Bucket: s3Bucket ?? undefined,
            s3Region: s3Region ?? undefined,
          }}
        />
      )}
    </SettingsCard>
  );
}
