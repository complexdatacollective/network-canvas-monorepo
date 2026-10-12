import { createHash } from 'node:crypto';

import {
  createSecretsCipher,
  type SecretsCipherApi,
} from '../../secrets/cipher.ts';
import { type KeyringApi, parseKeyring } from '../../secrets/keyring.ts';

// The keyring every suite that touches a secret uses, so no test invents key
// material of its own and every one of them can seal a value another suite
// can open. Deliberately not the development keyring: a test that accidentally
// depended on `.env.development` would pass here and fail in CI's lanes.

/** Current first, as in a real keyring: `test-1` is what new values use. */
const TEST_KEY_IDS = ['test-1', 'test-2'] as const;

/**
 * Key material derived from the id, so any id names a usable key and the same
 * id always names the same one. A rotation test can therefore ask for
 * `testKeyring(['test-2', 'test-1'])` and get the same two keys with the other
 * one current.
 */
export function testKeyringEntry(id: string): string {
  const key = createHash('sha256').update(`studio-secrets-test:${id}`).digest();
  return `${id}:${key.toString('base64')}`;
}

export function testKeyring(ids: readonly string[] = TEST_KEY_IDS): KeyringApi {
  return parseKeyring(ids.map(testKeyringEntry).join(','));
}

export function testCipher(
  keyring: KeyringApi = testKeyring(),
): SecretsCipherApi {
  return createSecretsCipher(keyring);
}
