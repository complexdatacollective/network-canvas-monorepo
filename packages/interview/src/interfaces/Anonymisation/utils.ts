import type { Variable } from '@codaco/protocol-validation';
import type {
  NcNode,
  EntityAttributesProperty,
  EntitySecureAttributesMeta,
  VariableValue,
} from '@codaco/shared-consts';

import { encryptValue } from './encryptionFormat';

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
 * An encrypted write was refused because the interview's encryption key is
 * not in force: no passphrase has been entered since it was opened.
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
 * An encrypted write was refused because no passphrase can ever put the
 * interview's key in force: its encryption header is outside the runtime's
 * bounds.
 */
const ENCRYPTION_UNAVAILABLE = 'EncryptionUnavailableError';

export class EncryptionUnavailableError extends Error {
  constructor() {
    super('No passphrase can open this interview to save encrypted data');
    this.name = ENCRYPTION_UNAVAILABLE;
  }
}

/** As `isPassphraseRequiredError`, for an EncryptionUnavailableError. */
export const isEncryptionUnavailableError = (
  error: { name?: string } | undefined,
) => error?.name === ENCRYPTION_UNAVAILABLE;

/**
 * Whether storing these attribute values encrypts any of them, by the rule
 * `generateSecureAttributes` applies: a string value of a variable the
 * codebook marks encrypted.
 */
export function writesEncryptedValue(
  attributes: Readonly<Record<string, VariableValue | undefined>>,
  codebookVariables: Record<string, Variable>,
): boolean {
  return Object.entries(attributes).some(
    ([key, value]) =>
      !!codebookVariables[key]?.encrypted && typeof value === 'string',
  );
}

/**
 * Encrypts the string values of encrypted variables for the node `nodeId`,
 * which each ciphertext is bound to. Other values pass through unchanged.
 */
export async function generateSecureAttributes(
  attributes: NcNode[EntityAttributesProperty],
  codebookVariables: Record<string, Variable>,
  key: CryptoKey,
  nodeId: string,
): Promise<{
  secureAttributes: NcNode[EntitySecureAttributesMeta];
  encryptedAttributes: NcNode[EntityAttributesProperty];
}> {
  const secureAttributes: NcNode[EntitySecureAttributesMeta] = {};
  const encryptedAttributes: NcNode[EntityAttributesProperty] = {
    ...attributes,
  };

  for (const [variableId, value] of Object.entries(attributes)) {
    if (!codebookVariables[variableId]?.encrypted) continue;

    // Only text variables can be encrypted, so a string is the only value
    // there is to encrypt.
    if (typeof value === 'string') {
      const { iv, data } = await encryptValue(key, value, {
        nodeId,
        variableId,
      });
      writeOwnProperty(secureAttributes, variableId, { iv });
      writeOwnProperty(encryptedAttributes, variableId, data);
    }
  }

  return {
    secureAttributes,
    encryptedAttributes,
  };
}
