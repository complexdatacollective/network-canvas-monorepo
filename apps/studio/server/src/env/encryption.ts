import { z } from 'zod';

import { createAwsKmsRootKeyLoader } from '../pii/aws-kms.ts';
import {
  developmentKeyConfiguration,
  loadDevelopmentRoot,
} from '../pii/development.ts';
import {
  createBase64RootKeyLoader,
  KeyConfigurationError,
  type RootKeyLoader,
} from '../pii/keys.ts';
import { isLocalDatabase, type StudioEnv } from './resolve.ts';

export type EncryptionEnv = {
  configuration: unknown;
  loadRootKey: RootKeyLoader;
};

const references = z.object({
  roots: z
    .array(
      z.object({
        reference: z
          .string()
          .regex(/^STUDIO_ENCRYPTION_ROOT_[A-Z0-9_]{1,100}$/),
      }),
    )
    .min(1)
    .max(32),
});

/** Pure environment resolver; only env.ts reads process.env. */
export function resolveEncryptionEnv(
  source: Readonly<Record<string, string | undefined>>,
  development?: Pick<StudioEnv, 'devDefaults' | 'db'>,
): EncryptionEnv {
  const provider = source.STUDIO_ENCRYPTION_KEY_PROVIDER ?? 'environment';
  if (provider !== 'environment' && provider !== 'aws-kms')
    throw new KeyConfigurationError();
  const raw = source.STUDIO_ENCRYPTION_KEYSET;
  if (!raw?.trim()) {
    if (
      provider === 'environment' &&
      development?.devDefaults &&
      development.db &&
      isLocalDatabase(development.db.url)
    )
      return {
        configuration: developmentKeyConfiguration,
        loadRootKey: loadDevelopmentRoot,
      };
    throw new KeyConfigurationError();
  }
  if (raw.length > 32_768) throw new KeyConfigurationError();
  try {
    const configuration: unknown = JSON.parse(raw);
    const selected = references.parse(configuration);
    // Snapshot only explicitly referenced names. No generic access to the
    // process environment survives this boundary or enters the key loader.
    const values = Object.fromEntries(
      selected.roots.map(({ reference }) => [reference, source[reference]]),
    );
    if (provider === 'aws-kms')
      return {
        configuration,
        loadRootKey: createAwsKmsRootKeyLoader({
          keyArn: source.STUDIO_ENCRYPTION_KMS_KEY_ARN,
          deployment: source.STUDIO_ENCRYPTION_KMS_DEPLOYMENT,
          credentials: {
            accessKeyId: source.STUDIO_ENCRYPTION_KMS_ACCESS_KEY_ID,
            secretAccessKey: source.STUDIO_ENCRYPTION_KMS_SECRET_ACCESS_KEY,
            ...(source.STUDIO_ENCRYPTION_KMS_SESSION_TOKEN === undefined
              ? {}
              : {
                  sessionToken: source.STUDIO_ENCRYPTION_KMS_SESSION_TOKEN,
                }),
          },
          encryptedRoots: values,
        }),
      };
    return {
      configuration,
      loadRootKey: createBase64RootKeyLoader((reference) => values[reference]),
    };
  } catch {
    throw new KeyConfigurationError();
  }
}
