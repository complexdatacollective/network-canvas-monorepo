import type { Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entitySecureAttributesMeta,
  type NcNode,
  type EntityAttributesProperty,
  type EntitySecureAttributesMeta,
  type VariableValue,
} from '@codaco/shared-consts';

import { isAttributeEncrypted } from './isAttributeEncrypted';

const writeOwnProperty = <Value>(
  target: Record<string, Value>,
  key: string,
  value: Value,
): void => {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
};

/**
 * An encrypted write was refused because no passphrase that can decrypt this
 * interview's data is in force.
 */
const PASSPHRASE_REQUIRED = 'PassphraseRequiredError';

export class PassphraseRequiredError extends Error {
  constructor() {
    super('A valid passphrase is required to save encrypted data');
    this.name = PASSPHRASE_REQUIRED;
  }
}

/**
 * Recognises a PassphraseRequiredError after Redux Toolkit has serialised it
 * into a rejected thunk action, where only its name survives.
 */
export const isPassphraseRequiredError = (
  error: { name?: string } | undefined,
) => error?.name === PASSPHRASE_REQUIRED;

/**
 * Creates a key from a passphrase and a random salt. The salt is used to
 * ensure the same passphrase results in a unique key each time.
 *
 * To derive a key from a passphrase, use the PBKDF2 algorithm to make the
 * encryption more secure by adding a random salt. This ensures the same
 * passphrase results in a unique key each time.
 */
async function generateKey(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

type EncryptedData = {
  secureAttributes: {
    iv: number[];
    salt: number[];
  };
  data: number[];
};

export async function decryptData(
  encrypted: EncryptedData,
  passphrase: string,
): Promise<string> {
  const {
    data,
    secureAttributes: { iv, salt },
  } = encrypted;

  const key = await generateKey(passphrase, new Uint8Array(salt));

  const decryptedData = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(iv),
    },
    key,
    new Uint8Array(data),
  );

  const decoder = new TextDecoder();

  // TODO: We need to look up the variable type and re-cast it here.

  return decoder.decode(decryptedData);
}

function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'number')
  );
}

/**
 * Whether any of the node's attribute values is stored encrypted and is
 * encrypted in this interview (see `isAttributeEncrypted`).
 */
export function hasEncryptedAttributes(
  node: NcNode,
  codebookVariables: Record<string, Variable>,
  encryptionEnabled: boolean,
): boolean {
  return Object.keys(node[entitySecureAttributesMeta] ?? {}).some((key) =>
    isAttributeEncrypted(encryptionEnabled, codebookVariables, key),
  );
}

/**
 * Returns a copy of the node with every encrypted value replaced by its
 * plaintext and that value's secure-attribute metadata removed, so the copy is
 * consistent on its own. Only values encrypted in this interview (see
 * `isAttributeEncrypted`) are decrypted. Throws when a value cannot be
 * decrypted, including a value of an encrypted variable that is ciphertext
 * without its metadata.
 */
export async function decryptNodeAttributes(
  node: NcNode,
  codebookVariables: Record<string, Variable>,
  passphrase: string,
  encryptionEnabled: boolean,
): Promise<NcNode> {
  const secureAttributes = node[entitySecureAttributesMeta] ?? {};
  const remainingSecureAttributes = { ...secureAttributes };

  const entries = await Promise.all(
    Object.entries(node[entityAttributesProperty]).map(
      async ([key, value]): Promise<[string, VariableValue]> => {
        if (!isAttributeEncrypted(encryptionEnabled, codebookVariables, key)) {
          return [key, value];
        }

        const secure = Object.hasOwn(secureAttributes, key)
          ? secureAttributes[key]
          : undefined;

        if (!secure) {
          if (isNumberArray(value)) {
            throw new Error(
              `Secure attributes missing for encrypted variable ${key}`,
            );
          }
          return [key, value];
        }

        if (!isNumberArray(value)) {
          throw new Error(`Encrypted value missing for variable ${key}`);
        }

        const plaintext = await decryptData(
          { secureAttributes: secure, data: value },
          passphrase,
        );
        delete remainingSecureAttributes[key];
        return [key, plaintext];
      },
    ),
  );

  const { [entitySecureAttributesMeta]: _decrypted, ...rest } = node;
  return {
    ...rest,
    [entityAttributesProperty]: Object.fromEntries(entries),
    ...(Object.keys(remainingSecureAttributes).length > 0
      ? { [entitySecureAttributesMeta]: remainingSecureAttributes }
      : {}),
  };
}

export async function generateSecureAttributes(
  attributes: NcNode[EntityAttributesProperty],
  codebookVariables: Record<string, Variable>,
  passphrase: string,
): Promise<{
  secureAttributes: NcNode[EntitySecureAttributesMeta];
  encryptedAttributes: NcNode[EntityAttributesProperty];
}> {
  const secureAttributes: NcNode[EntitySecureAttributesMeta] = {};
  const encryptedAttributes: NcNode[EntityAttributesProperty] = {
    ...attributes,
  };

  for (const [key, value] of Object.entries(attributes)) {
    // If this attribute is not encrypted, we can skip it
    if (!codebookVariables[key]?.encrypted) {
      continue;
    }

    // TODO: expand this for other variable types
    if (typeof value === 'string') {
      const encoder = new TextEncoder();
      // Create a new salt and IV for each encryption
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const encryptionKey = await generateKey(passphrase, salt);
      const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        encryptionKey,
        encoder.encode(value),
      );

      writeOwnProperty(secureAttributes, key, {
        iv: Array.from(iv),
        salt: Array.from(salt),
      });

      writeOwnProperty(
        encryptedAttributes,
        key,
        Array.from(new Uint8Array(encryptedData)),
      );
    }
  }

  return {
    secureAttributes,
    encryptedAttributes,
  };
}
