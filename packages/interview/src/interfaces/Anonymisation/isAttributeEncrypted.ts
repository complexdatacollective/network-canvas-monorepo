import type { Variable } from '@codaco/protocol-validation';

/**
 * Whether answers to `attributeId` are encrypted in this interview.
 *
 * The codebook marks a variable `encrypted`, but encryption is in effect only
 * while the protocol enables the encrypted-variables experiment
 * (`getShouldEncryptNames`). With the experiment off those answers are written,
 * read and shown as plaintext, so nothing may prompt for a passphrase, lock a
 * question, refuse a write or attempt a decryption on their account.
 */
export function isAttributeEncrypted(
  encryptionEnabled: boolean,
  variables: Readonly<Record<string, Variable>> | undefined,
  attributeId: string,
): boolean {
  return encryptionEnabled && variables?.[attributeId]?.encrypted === true;
}
