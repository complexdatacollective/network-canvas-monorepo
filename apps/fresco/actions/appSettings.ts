'use server';

import { createId } from '@paralleldrive/cuid2';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { type z } from 'zod';
import { z as zm } from 'zod/mini';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { addEvent } from '~/lib/activityFeed';
import { requireApiAuth } from '~/lib/auth/guards';
import { safeUpdateTag } from '~/lib/cache';
import { prisma } from '~/lib/db';
import {
  captureEvent,
  captureException,
  flushPostHog,
} from '~/lib/posthog-server';
import { getStorageEnvStatus } from '~/lib/storage/config';
import { getInstallationId } from '~/queries/appSettings';
import {
  type AppSetting,
  appSettingPreprocessedSchema,
  createUploadThingSchemas,
} from '~/schemas/appSettings';
import { getStringValue } from '~/utils/serializeHelpers';

const messages = defineMessages({
  copyInvalidAppSetting: {
    id: 'fresco.actions.appSettings.copyInvalidAppSetting',
    defaultMessage: 'Invalid app setting: {value1}',
    description:
      'Researcher-facing actions / appSettings: Invalid app setting: value',
  },
  copyStorageIsConfiguredViaEnvironmentVariablesAnd: {
    id: 'fresco.actions.appSettings.copyStorageIsConfiguredViaEnvironmentVariablesAnd',
    defaultMessage:
      'Storage is configured via environment variables and cannot be changed here.',
    description:
      'Researcher-facing actions / appSettings: Storage is configured via environment variables and cannot be changed here.',
  },
  copyCannotSetAppSettingToNull: {
    id: 'fresco.actions.appSettings.copyCannotSetAppSettingToNull',
    defaultMessage: 'Cannot set app setting to null',
    description:
      'Researcher-facing actions / appSettings: Cannot set app setting to null',
  },
  copyCannotSetAppSettingToUndefined: {
    id: 'fresco.actions.appSettings.copyCannotSetAppSettingToUndefined',
    defaultMessage: 'Cannot set app setting to undefined',
    description:
      'Researcher-facing actions / appSettings: Cannot set app setting to undefined',
  },
  copyInvalidValueForAppSetting: {
    id: 'fresco.actions.appSettings.copyInvalidValueForAppSetting',
    defaultMessage: 'Invalid value for app setting {value1}',
    description:
      'Researcher-facing actions / appSettings: Invalid value for app setting value',
  },
  copyFailedToUpdateAppSettings: {
    id: 'fresco.actions.appSettings.copyFailedToUpdateAppSettings',
    defaultMessage: 'Failed to update this setting.',
    description:
      'Researcher-facing actions / appSettings: Failed to update appSettings: value: value',
  },
  copyTheUploadThingTokenIsConfiguredViaThe: {
    id: 'fresco.actions.appSettings.copyTheUploadThingTokenIsConfiguredViaThe',
    defaultMessage:
      'The UploadThing token is configured via the UPLOADTHING_TOKEN environment variable and cannot be changed here.',
    description:
      'Researcher-facing actions / appSettings: The UploadThing token is configured via the UPLOADTHING_TOKEN environment variable and cannot be changed here.',
  },
  copyTokenIsMissingRequiredFieldsApiKeyAppId: {
    id: 'fresco.actions.appSettings.copyTokenIsMissingRequiredFieldsApiKeyAppId',
    defaultMessage: 'Token is missing required fields (apiKey, appId).',
    description:
      'Researcher-facing actions / appSettings: Token is missing required fields (apiKey, appId).',
  },
  copyTokenIsNotValidMakeSureYou: {
    id: 'fresco.actions.appSettings.copyTokenIsNotValidMakeSureYou',
    defaultMessage: 'Token is not valid. Make sure you copied the full token.',
    description:
      'Researcher-facing actions / appSettings: Token is not valid. Make sure you copied the full token.',
  },
  copyTokenVerificationFailed: {
    id: 'fresco.actions.appSettings.copyTokenVerificationFailed',
    defaultMessage: 'Token verification failed. Check the token and try again.',
    description:
      'Researcher-facing actions / appSettings: Token verification failed: value',
  },
});

const S3_SETTING_KEYS: AppSetting[] = [
  's3Endpoint',
  's3PublicUrl',
  's3Bucket',
  's3Region',
  's3AccessKeyId',
  's3SecretAccessKey',
];

/**
 * Storage settings managed via environment variables must not be editable
 * through server actions — UI locking alone would be cosmetic.
 */
function isStorageSettingEnvManaged(key: AppSetting): boolean {
  const status = getStorageEnvStatus();
  if (key === 'storageProvider') return status.pinnedProvider !== null;
  if (S3_SETTING_KEYS.includes(key)) return status.s3EnvManaged;
  if (key === 'uploadThingToken') return status.uploadThingEnvManaged;
  return false;
}

export async function setAppSetting<
  Key extends AppSetting,
  V extends z.infer<typeof appSettingPreprocessedSchema>[Key],
>(key: Key, value: V): Promise<V> {
  const session = await requireApiAuth();

  if (!appSettingPreprocessedSchema.shape[key]) {
    throw new Error(
      createMessageError(messages.copyInvalidAppSetting, { value1: key }),
    );
  }

  if (isStorageSettingEnvManaged(key)) {
    throw new Error(
      createMessageError(
        messages.copyStorageIsConfiguredViaEnvironmentVariablesAnd,
      ),
    );
  }

  try {
    // Null values are not supported - caller should not pass null
    if (value === null) {
      throw new Error(
        createMessageError(messages.copyCannotSetAppSettingToNull),
      );
    }

    // Convert the typed value to a database string
    // Filter out undefined values as they're not supported by getStringValue
    if (value === undefined) {
      throw new Error(
        createMessageError(messages.copyCannotSetAppSettingToUndefined),
      );
    }
    const stringValue = getStringValue(value);

    // Validate the serialized value against the same schema the read path
    // uses (queries/appSettings.ts), so a stored value can never throw on
    // read-back (e.g. a malformed URL for s3PublicUrl).
    const validated =
      appSettingPreprocessedSchema.shape[key].safeParse(stringValue);
    if (!validated.success) {
      throw new Error(
        createMessageError(messages.copyInvalidValueForAppSetting, {
          value1: key,
        }),
      );
    }

    await prisma.appSettings.upsert({
      where: { key },
      create: { key, value: stringValue },
      update: { value: stringValue },
    });

    safeUpdateTag(`appSettings-${key}`);

    const REDACTED_KEYS: AppSetting[] = [
      'uploadThingToken',
      's3SecretAccessKey',
      's3AccessKeyId',
    ];
    const displayValue = REDACTED_KEYS.includes(key)
      ? '[REDACTED]'
      : String(value);

    await addEvent(
      'Setting Changed',
      `"${session.user.username}" changed "${key}" to "${displayValue}"`,
      {
        kind: 'settingChanged',
        values: {
          username: session.user.username,
          setting: key,
          value: displayValue,
        },
      },
    );

    return value;
  } catch (error) {
    throw new Error(
      createMessageError(messages.copyFailedToUpdateAppSettings),
      {
        cause: error,
      },
    );
  }
}

export async function setUploadThingToken(rawData: unknown) {
  const { createUploadThingTokenFormSchema } =
    createUploadThingSchemas(createMessageError);

  await requireApiAuth();

  if (getStorageEnvStatus().uploadThingEnvManaged) {
    return {
      success: false as const,
      fieldErrors: {
        uploadThingToken: [
          createMessageError(
            messages.copyTheUploadThingTokenIsConfiguredViaThe,
          ),
        ],
      },
    };
  }

  const parsed = createUploadThingTokenFormSchema.safeParse(rawData);
  if (!parsed.success) {
    const flattened = zm.flattenError(parsed.error);
    return {
      success: false as const,
      fieldErrors: flattened.fieldErrors,
    };
  }

  const token = parsed.data.uploadThingToken;

  // Verify the token is structurally valid (base64 JSON with expected fields)
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const data = JSON.parse(decoded) as Record<string, unknown>;
    if (!data.apiKey || !data.appId) {
      return {
        success: false as const,
        fieldErrors: {
          uploadThingToken: [
            createMessageError(
              messages.copyTokenIsMissingRequiredFieldsApiKeyAppId,
            ),
          ],
        },
      };
    }
  } catch {
    return {
      success: false as const,
      fieldErrors: {
        uploadThingToken: [
          createMessageError(messages.copyTokenIsNotValidMakeSureYou),
        ],
      },
    };
  }

  const verifyError = await verifyUploadThingToken(token);
  if (verifyError) {
    return {
      success: false as const,
      fieldErrors: {
        uploadThingToken: [verifyError],
      },
    };
  }

  await setAppSetting('uploadThingToken', token);
  return { success: true as const };
}

async function verifyUploadThingToken(token: string): Promise<string | null> {
  try {
    const { UTApi } = await import('uploadthing/server');
    const utapi = new UTApi({ token });
    // getUsageInfo makes an authenticated request to UploadThing; it succeeds
    // only if the token is valid.
    await utapi.getUsageInfo();
    return null;
  } catch (error) {
    await captureException(error);
    return createMessageError(messages.copyTokenVerificationFailed);
  }
}

export async function regenerateInstallationId() {
  await requireApiAuth();
  const newId = createId();
  await setAppSetting('installationId', newId);
  return newId;
}

export async function completeSetup() {
  // Only an authenticated user (the admin account created in step 1 of setup)
  // may finalize configuration. Without this, an unauthenticated caller could
  // mark a fresh instance as configured and lock out the real operator.
  await requireApiAuth();

  const installationId = await getInstallationId();
  if (!installationId) {
    await setAppSetting('installationId', createId());
  }
  await setAppSetting('configured', true);
  after(async () => {
    await captureEvent('AppSetup', {
      installationId,
    });
    await flushPostHog();
  });

  redirect('/dashboard');
}
