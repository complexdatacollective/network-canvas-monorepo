import { createSecretKey, hkdfSync, type KeyObject } from 'node:crypto';

import { z } from 'zod';

const keyId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/);
const namespace = z.strictObject({
  current: keyId,
  keys: z
    .array(z.strictObject({ id: keyId, rootId: keyId }))
    .min(1)
    .max(32),
});

const configurationSchema = z.strictObject({
  roots: z
    .array(
      z.strictObject({
        id: keyId,
        reference: z.string().trim().min(1).max(2048),
      }),
    )
    .min(1)
    .max(32),
  pii: namespace,
  integration: namespace,
  blindIndex: namespace,
});

export type KeysetConfiguration = z.infer<typeof configurationSchema>;
export type KeyPurpose = 'pii-enc' | 'pii-index' | 'integration-enc';

/** The deployment boundary supplies environment or KMS-backed key material. */
export type RootKeyLoader = (reference: string) => Promise<Uint8Array>;

export class KeyConfigurationError extends Error {
  constructor() {
    // Never include raw input, loader errors, or their causes. A rejected
    // environment value or KMS response can contain application secrets.
    super('Studio encryption key configuration is invalid or unavailable.');
    this.name = 'KeyConfigurationError';
  }
}

/**
 * Environment-compatible adapter without reading process.env in this module.
 * Node's base64 decoder is permissive, so verify the canonical encoding too.
 */
export function createBase64RootKeyLoader(
  read: (reference: string) => string | undefined,
): RootKeyLoader {
  return async (reference) => {
    try {
      const raw = read(reference);
      if (!raw || !/^[A-Za-z0-9+/]{43}=$/.test(raw)) {
        throw new KeyConfigurationError();
      }
      const bytes = Buffer.from(raw, 'base64');
      if (bytes.byteLength !== 32 || bytes.toString('base64') !== raw) {
        throw new KeyConfigurationError();
      }
      return bytes;
    } catch {
      throw new KeyConfigurationError();
    }
  };
}

type LoadedNamespace = {
  current: string;
  rootsByKeyId: ReadonlyMap<string, KeyObject>;
};

/**
 * Server-internal key material. Private fields keep it out of JSON/log
 * inspection; neither root bytes nor derived keys are serialized by this API.
 * Application reads belong through protection.ts's audit-bound readers.
 */
class LoadedEncryptionKeys {
  #namespaces: Readonly<Record<KeyPurpose, LoadedNamespace>>;

  constructor(namespaces: Readonly<Record<KeyPurpose, LoadedNamespace>>) {
    this.#namespaces = namespaces;
  }

  currentId(purpose: KeyPurpose): string {
    return this.#namespaces[purpose].current;
  }

  has(purpose: KeyPurpose, id: string): boolean {
    return this.#namespaces[purpose].rootsByKeyId.has(id);
  }

  /** Internal to the encryption boundary; scope is an unambiguous tuple. */
  derive(purpose: KeyPurpose, id: string, scope: readonly string[]): KeyObject {
    const root = this.#namespaces[purpose].rootsByKeyId.get(id);
    if (!root) throw new KeyConfigurationError();
    const info = JSON.stringify([
      'studio-encryption.v1',
      purpose,
      id,
      ...scope,
    ]);
    const bytes = Buffer.from(hkdfSync('sha256', root, '', info, 32));
    const key = createSecretKey(bytes);
    bytes.fill(0);
    return key;
  }
}

export type EncryptionKeys = LoadedEncryptionKeys;

/**
 * Validates all references before loading a secret. Encryption and index
 * selectors are independent: changing pii.current never changes blindIndex.
 */
export async function loadEncryptionKeys(
  input: unknown,
  loadRootKey: RootKeyLoader,
): Promise<EncryptionKeys> {
  const parsed = configurationSchema.safeParse(input);
  if (!parsed.success) throw new KeyConfigurationError();
  const config = parsed.data;
  const rootIds = new Set(config.roots.map((root) => root.id));
  if (rootIds.size !== config.roots.length) throw new KeyConfigurationError();

  const configuredNamespaces = {
    'pii-enc': config.pii,
    'integration-enc': config.integration,
    'pii-index': config.blindIndex,
  } as const;

  for (const definition of Object.values(configuredNamespaces)) {
    const ids = new Set(definition.keys.map((key) => key.id));
    if (
      ids.size !== definition.keys.length ||
      !ids.has(definition.current) ||
      definition.keys.some((key) => !rootIds.has(key.rootId))
    ) {
      throw new KeyConfigurationError();
    }
  }

  const roots = new Map<string, KeyObject>();
  try {
    for (const root of config.roots) {
      const material = await loadRootKey(root.reference);
      if (!(material instanceof Uint8Array) || material.byteLength !== 32) {
        throw new KeyConfigurationError();
      }
      const bytes = Buffer.from(material);
      roots.set(root.id, createSecretKey(bytes));
      bytes.fill(0);
    }
  } catch {
    throw new KeyConfigurationError();
  }

  function loadNamespace(
    definition: KeysetConfiguration['pii'],
  ): LoadedNamespace {
    const rootsByKeyId = new Map<string, KeyObject>();
    for (const key of definition.keys) {
      const root = roots.get(key.rootId);
      if (!root) throw new KeyConfigurationError();
      rootsByKeyId.set(key.id, root);
    }
    return { current: definition.current, rootsByKeyId };
  }

  return new LoadedEncryptionKeys({
    'pii-enc': loadNamespace(config.pii),
    'integration-enc': loadNamespace(config.integration),
    'pii-index': loadNamespace(config.blindIndex),
  });
}
