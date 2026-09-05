import { z } from 'zod';

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
  const raw = source.STUDIO_ENCRYPTION_KEYSET;
  if (!raw?.trim()) {
    if (
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
  try {
    const configuration: unknown = JSON.parse(raw);
    const selected = references.parse(configuration);
    // Snapshot only explicitly referenced names. No generic access to the
    // process environment survives this boundary or enters the key loader.
    const values = Object.fromEntries(
      selected.roots.map(({ reference }) => [reference, source[reference]]),
    );
    return {
      configuration,
      loadRootKey: createBase64RootKeyLoader((reference) => values[reference]),
    };
  } catch {
    throw new KeyConfigurationError();
  }
}
