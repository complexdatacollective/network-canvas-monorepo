'use server';

import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { z as zm } from 'zod/mini';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { setAppSetting } from '~/actions/appSettings';
import { requireApiAuth } from '~/lib/auth/guards';
import { captureException } from '~/lib/posthog-server';
import { getStorageEnvStatus } from '~/lib/storage/config';
import { hasProtocols, type StorageProvider } from '~/queries/storageProvider';
import { createS3SettingsSchemas } from '~/schemas/s3Settings';

const messages = defineMessages({
  copyTheStorageProviderIsConfiguredViaThe: {
    id: 'fresco.actions.storageProvider.copyTheStorageProviderIsConfiguredViaThe',
    defaultMessage:
      'The storage provider is configured via the STORAGE_PROVIDER environment variable and cannot be changed here.',
    description:
      'Researcher-facing actions / storageProvider: The storage provider is configured via the STORAGE_PROVIDER environment variable and cannot be changed here.',
  },
  copyCannotChangeStorageProviderAfterProtocolsHave: {
    id: 'fresco.actions.storageProvider.copyCannotChangeStorageProviderAfterProtocolsHave',
    defaultMessage:
      'Cannot change storage provider after protocols have been uploaded.',
    description:
      'Researcher-facing actions / storageProvider: Cannot change storage provider after protocols have been uploaded.',
  },
  copyS3StorageIsConfiguredViaEnvironmentVariables: {
    id: 'fresco.actions.storageProvider.copyS3StorageIsConfiguredViaEnvironmentVariables',
    defaultMessage:
      'S3 storage is configured via environment variables and cannot be changed here.',
    description:
      'Researcher-facing actions / storageProvider: S3 storage is configured via environment variables and cannot be changed here.',
  },
  copyTheStorageProviderIsPinnedToUploadThing: {
    id: 'fresco.actions.storageProvider.copyTheStorageProviderIsPinnedToUploadThing',
    defaultMessage:
      'The storage provider is pinned to UploadThing via the STORAGE_PROVIDER environment variable.',
    description:
      'Researcher-facing actions / storageProvider: The storage provider is pinned to UploadThing via the STORAGE_PROVIDER environment variable.',
  },
  copyCannotChangeStorageConfigurationAfterProtocolsHave: {
    id: 'fresco.actions.storageProvider.copyCannotChangeStorageConfigurationAfterProtocolsHave',
    defaultMessage:
      'Cannot change storage configuration after protocols have been uploaded.',
    description:
      'Researcher-facing actions / storageProvider: Cannot change storage configuration after protocols have been uploaded.',
  },
  copyCouldNotConnectToS3Bucket: {
    id: 'fresco.actions.storageProvider.copyCouldNotConnectToS3Bucket',
    defaultMessage:
      'Could not connect to the S3 bucket. Check the endpoint, bucket name, and credentials.',
    description:
      'Researcher-facing actions / storageProvider: Could not connect to S3 bucket: value',
  },
});

export async function setStorageProvider(provider: StorageProvider) {
  await requireApiAuth();

  const { pinnedProvider } = getStorageEnvStatus();
  if (pinnedProvider !== null) {
    // When STORAGE_PROVIDER pins the same provider the database value is
    // irrelevant, so treat this as a successful no-op. A conflicting value
    // is an error.
    if (pinnedProvider === provider) {
      return { success: true as const };
    }
    return {
      success: false as const,
      error: createMessageError(
        messages.copyTheStorageProviderIsConfiguredViaThe,
      ),
    };
  }

  const protocolsExist = await hasProtocols();
  if (protocolsExist) {
    return {
      success: false as const,
      error: createMessageError(
        messages.copyCannotChangeStorageProviderAfterProtocolsHave,
      ),
    };
  }

  await setAppSetting('storageProvider', provider);
  return { success: true as const };
}

export async function saveS3Config(rawData: unknown) {
  const { s3ConfigSchema } = createS3SettingsSchemas(createMessageError);

  await requireApiAuth();

  const envStatus = getStorageEnvStatus();
  if (envStatus.s3EnvManaged) {
    return {
      success: false as const,
      fieldErrors: {},
      error: createMessageError(
        messages.copyS3StorageIsConfiguredViaEnvironmentVariables,
      ),
    };
  }
  if (envStatus.pinnedProvider && envStatus.pinnedProvider !== 's3') {
    return {
      success: false as const,
      fieldErrors: {},
      error: createMessageError(
        messages.copyTheStorageProviderIsPinnedToUploadThing,
      ),
    };
  }

  const protocolsExist = await hasProtocols();
  if (protocolsExist) {
    return {
      success: false as const,
      fieldErrors: {},
      error: createMessageError(
        messages.copyCannotChangeStorageConfigurationAfterProtocolsHave,
      ),
    };
  }

  const parsed = s3ConfigSchema.safeParse(rawData);
  if (!parsed.success) {
    const flattened = zm.flattenError(parsed.error);
    return {
      success: false as const,
      fieldErrors: flattened.fieldErrors,
    };
  }

  const {
    s3Endpoint,
    s3PublicUrl,
    s3Bucket,
    s3Region,
    s3AccessKeyId,
    s3SecretAccessKey,
  } = parsed.data;

  // Validate credentials by attempting a HeadBucket call
  try {
    const client = new S3Client({
      endpoint: s3Endpoint,
      region: s3Region,
      credentials: {
        accessKeyId: s3AccessKeyId,
        secretAccessKey: s3SecretAccessKey,
      },
      forcePathStyle: true,
    });

    await client.send(
      new ListObjectsV2Command({ Bucket: s3Bucket, MaxKeys: 0 }),
    );
  } catch (error) {
    await captureException(error);
    return {
      success: false as const,
      fieldErrors: {},
      error: createMessageError(messages.copyCouldNotConnectToS3Bucket),
    };
  }

  // When STORAGE_PROVIDER is pinned to 's3' via env the database provider
  // value is ignored (and setAppSetting would reject the write).
  if (!envStatus.pinnedProvider) {
    await setAppSetting('storageProvider', 's3');
  }
  await setAppSetting('s3Endpoint', s3Endpoint);
  await setAppSetting('s3PublicUrl', s3PublicUrl);
  await setAppSetting('s3Bucket', s3Bucket);
  await setAppSetting('s3Region', s3Region);
  await setAppSetting('s3AccessKeyId', s3AccessKeyId);
  await setAppSetting('s3SecretAccessKey', s3SecretAccessKey);

  return { success: true as const };
}
