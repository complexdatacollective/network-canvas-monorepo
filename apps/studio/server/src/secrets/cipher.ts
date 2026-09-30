import { randomBytes } from 'node:crypto';

import {
  openSecret,
  type SealedSecret,
  sealSecret,
  type SecretRandom,
  SecretUnreadableError,
} from './envelope.ts';
import { isKeyId, type Keyring } from './keyring.ts';

// The whole of Studio's secret handling, as one function per place a secret is
// stored (#1900). There is deliberately no general `encrypt`/`decrypt` export:
// a caller cannot seal a value without naming the row it belongs to, so the
// row identity is always bound into the ciphertext and a value moved to
// another row stops opening.

export type { SealedSecret } from './envelope.ts';

/** `webhook_subscriptions.secret_ciphertext` / `secret_key_id`. */
export type WebhookSecretIdentity = {
  teamId: string;
  subscriptionId: string;
};

/** `protocol_asset_keys`: the `apikey` protocol asset's value. */
export type AssetKeyIdentity = {
  teamId: string;
  protocolId: string;
  assetId: string;
};

/**
 * better-auth's `account` token columns. The column is part of the identity so
 * that an access token cannot be moved into the refresh-token column of its
 * own row — provider and account alone would not separate the three.
 */
export type OAuthTokenColumn = 'accessToken' | 'refreshToken' | 'idToken';

export type OAuthTokenIdentity = {
  providerId: string;
  accountId: string;
  column: OAuthTokenColumn;
};

/**
 * better-auth owns the `account` table and types its token columns as `text`,
 * so an OAuth token cannot carry a key id in a column of its own: the id
 * travels inside the value, as `studio-secret:<keyId>:<base64url envelope>`.
 * The prefix is also what tells a sealed value from a plaintext one, which is
 * why a value without it is refused rather than returned.
 */
const OAUTH_PREFIX = 'studio-secret:';

export type SecretsCipher = {
  /**
   * The id every `seal` writes under. Rotation reads it to select the rows
   * that are not current yet (src/secrets/stores.ts); nothing else needs it,
   * because a caller never chooses a key.
   */
  readonly currentKeyId: string;

  sealWebhookSecret(
    identity: WebhookSecretIdentity,
    secret: string,
  ): SealedSecret;
  openWebhookSecret(
    identity: WebhookSecretIdentity,
    sealed: SealedSecret,
  ): string;
  /** Returns `sealed` unchanged when it is already under the current key. */
  resealWebhookSecret(
    identity: WebhookSecretIdentity,
    sealed: SealedSecret,
  ): SealedSecret;

  sealAssetKey(identity: AssetKeyIdentity, value: string): SealedSecret;
  openAssetKey(identity: AssetKeyIdentity, sealed: SealedSecret): string;
  /** Returns `sealed` unchanged when it is already under the current key. */
  resealAssetKey(
    identity: AssetKeyIdentity,
    sealed: SealedSecret,
  ): SealedSecret;

  sealOAuthToken(identity: OAuthTokenIdentity, token: string): string;
  openOAuthToken(identity: OAuthTokenIdentity, stored: string): string;
  /** Returns `stored` unchanged when it is already under the current key. */
  resealOAuthToken(identity: OAuthTokenIdentity, stored: string): string;
};

/**
 * The exact prefix `sealOAuthToken` writes for `keyId`. Exported so the
 * rotation's SQL can select on the string rather than on a LIKE pattern: a key
 * id may contain `_`, which LIKE reads as a wildcard, and a selection that
 * quietly matched one character too many is how a row stays behind.
 */
export function sealedOAuthTokenPrefix(keyId: string): string {
  return `${OAUTH_PREFIX}${keyId}:`;
}

/**
 * Reads the key id out of a stored OAuth token value, or `undefined` when the
 * value is not a sealed one. Pure, so the boot check and the rotation command
 * can ask the same question in JavaScript that the SQL asks with
 * `split_part(col, ':', 2)` on rows matching `studio-secret:%` — the two agree
 * for every id a keyring can hold, because an id cannot contain a `:`.
 */
export function parseOAuthTokenKeyId(stored: string): string | undefined {
  if (!stored.startsWith(OAUTH_PREFIX)) return undefined;
  const rest = stored.slice(OAUTH_PREFIX.length);
  const separator = rest.indexOf(':');
  if (separator <= 0) return undefined;
  const keyId = rest.slice(0, separator);
  // Checked against the keyring's own id shape rather than returned raw: this
  // value comes out of a database column, and a boot refusal that names it
  // must not be a way to get arbitrary stored bytes into a log.
  return isKeyId(keyId) ? keyId : undefined;
}

export function createSecretsCipher(
  keyring: Keyring,
  options: { random?: SecretRandom } = {},
): SecretsCipher {
  // The seed is the only caller that passes one, so its synthetic webhook
  // secrets are reproducible; everything else takes the CSPRNG.
  const random = options.random ?? randomBytes;

  function seal(identity: readonly string[], plaintext: string): SealedSecret {
    return sealSecret(keyring, identity, plaintext, random);
  }

  function webhookIdentity(identity: WebhookSecretIdentity): string[] {
    return ['webhook', identity.teamId, identity.subscriptionId];
  }

  function assetKeyIdentity(identity: AssetKeyIdentity): string[] {
    return [
      'asset-key',
      identity.teamId,
      identity.protocolId,
      identity.assetId,
    ];
  }

  function oauthIdentity(identity: OAuthTokenIdentity): string[] {
    return ['oauth', identity.providerId, identity.accountId, identity.column];
  }

  function sealOAuthToken(identity: OAuthTokenIdentity, token: string): string {
    const sealed = seal(oauthIdentity(identity), token);
    return `${OAUTH_PREFIX}${sealed.keyId}:${sealed.ciphertext.toString('base64url')}`;
  }

  function openOAuthToken(
    identity: OAuthTokenIdentity,
    stored: string,
  ): string {
    const keyId = parseOAuthTokenKeyId(stored);
    if (!keyId) {
      // A token in this column that Studio did not seal is a fault, never a
      // value to hand back: returning it would turn a write that bypassed the
      // adapter into a silent plaintext-at-rest path.
      throw new SecretUnreadableError(
        'the stored value is not a sealed secret.',
      );
    }
    const encoded = stored.slice(OAUTH_PREFIX.length + keyId.length + 1);
    const ciphertext = Buffer.from(encoded, 'base64url');
    // Node's base64 decoding ignores what it cannot read, so a value that is
    // not exactly what was written is rejected here rather than decrypted as
    // whatever it happened to decode to.
    if (ciphertext.toString('base64url') !== encoded) {
      throw new SecretUnreadableError(
        'the stored value is not canonically encoded.',
      );
    }
    return openSecret(keyring, oauthIdentity(identity), { ciphertext, keyId });
  }

  return {
    currentKeyId: keyring.currentId,

    sealWebhookSecret: (identity, secret) =>
      seal(webhookIdentity(identity), secret),
    openWebhookSecret: (identity, sealed) =>
      openSecret(keyring, webhookIdentity(identity), sealed),
    resealWebhookSecret: (identity, sealed) =>
      sealed.keyId === keyring.currentId
        ? sealed
        : seal(
            webhookIdentity(identity),
            openSecret(keyring, webhookIdentity(identity), sealed),
          ),

    sealAssetKey: (identity, value) => seal(assetKeyIdentity(identity), value),
    openAssetKey: (identity, sealed) =>
      openSecret(keyring, assetKeyIdentity(identity), sealed),
    resealAssetKey: (identity, sealed) =>
      sealed.keyId === keyring.currentId
        ? sealed
        : seal(
            assetKeyIdentity(identity),
            openSecret(keyring, assetKeyIdentity(identity), sealed),
          ),

    sealOAuthToken,
    openOAuthToken,
    resealOAuthToken: (identity, stored) =>
      parseOAuthTokenKeyId(stored) === keyring.currentId
        ? stored
        : sealOAuthToken(identity, openOAuthToken(identity, stored)),
  };
}
