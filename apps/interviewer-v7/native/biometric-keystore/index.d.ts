/**
 * macOS Keychain biometric-ACL bindings.
 *
 * On macOS, secrets are stored with `kSecAttrAccessControl` =
 * `USER_PRESENCE` so the OS prompts for Touch ID (or device passcode as a
 * fallback) on every `load()`. On non-macOS platforms, every function
 * either returns `false` or rejects.
 */
export declare function isAvailable(): Promise<boolean>;

/**
 * Store a secret in the keychain. Overwrites any existing item with the same
 * service/account. No biometric prompt at write time.
 */
export declare function store(
  service: string,
  account: string,
  secret: Uint8Array,
): Promise<void>;

/**
 * Read the secret. macOS will display a Touch ID / passcode prompt.
 * Rejects with "User cancelled the biometric prompt" if the user dismisses it,
 * or "No keychain item found for the given service and account" if the item
 * was never written / has been deleted.
 */
export declare function load(service: string, account: string): Promise<Buffer>;

/**
 * Delete the stored secret. Resolves cleanly if the item does not exist.
 */
export declare function delete_(
  service: string,
  account: string,
): Promise<void>;
export { delete_ as delete };
