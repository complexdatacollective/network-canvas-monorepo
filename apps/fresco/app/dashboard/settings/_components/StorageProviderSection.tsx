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
      'Researcher-facing settings.storage: The API key used to communicate with UploadThing. See the <link>deployment documentation</link> for details.',
  },

  storage: {
    id: 'fresco.settings.StorageProviderSection.storage',
    defaultMessage: 'Storage',
    description: 'Researcher-facing settings / StorageProviderSection: Storage',
  },
  storageProvider: {
    id: 'fresco.settings.StorageProviderSection.storageProvider',
    defaultMessage: 'Storage Provider',
    description:
      'Researcher-facing settings / StorageProviderSection: Storage Provider',
  },
  filesAreStoredUsing: {
    id: 'fresco.settings.StorageProviderSection.filesAreStoredUsing',
    defaultMessage: 'Files are stored using {value1}.',
    description:
      'Researcher-facing settings / StorageProviderSection: Files are stored using value.',
  },
  storageIsConfiguredViaEnvironmentVariablesAnd: {
    id: 'fresco.settings.StorageProviderSection.storageIsConfiguredViaEnvironmentVariablesAnd',
    defaultMessage:
      'Storage is configured via environment variables ( {value1}) and cannot be edited here. Remove these variables to manage storage from this dashboard.',
    description:
      'Researcher-facing settings / StorageProviderSection: Storage is configured via environment variables ( value) and cannot be edited here. Remove these variables to manage sto',
  },
  theStorageProviderTypeCannotBeChanged: {
    id: 'fresco.settings.StorageProviderSection.theStorageProviderTypeCannotBeChanged',
    defaultMessage:
      'The storage provider type cannot be changed once the application has been deployed. You can update the credentials below.',
    description:
      'Researcher-facing settings / StorageProviderSection: The storage provider type cannot be changed once the application has been deployed. You can update the credentials below',
  },
  uploadThingAPIKey: {
    id: 'fresco.settings.StorageProviderSection.uploadThingAPIKey',
    defaultMessage: 'UploadThing API Key',
    description:
      'Researcher-facing settings / StorageProviderSection: UploadThing API Key',
  },
});

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
            link: (chunks) => (
              <Link href="https://documentation.networkcanvas.com/en/fresco/deployment/guide#create-a-storage-bucket-using-uploadthing">
                {chunks}
              </Link>
            ),
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
