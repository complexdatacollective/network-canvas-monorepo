import { randomBytes, webcrypto } from 'node:crypto';
import { inspect } from 'node:util';

import { describe, expect, it, vi } from 'vitest';

import {
  testCipher,
  testKeyring,
  testKeyringEntry,
} from '../../__tests__/support/secrets.ts';
import {
  type AssetKeyIdentity,
  createSecretsCipher,
  type OAuthTokenIdentity,
  parseOAuthTokenKeyId,
  type SealedSecret,
  type WebhookSecretIdentity,
} from '../cipher.ts';
import { SecretUnreadableError } from '../envelope.ts';

const WEBHOOK: WebhookSecretIdentity = {
  teamId: 'team-one',
  subscriptionId: '3f1b0a9e-8c4d-4b2a-9f6e-1c2d3e4f5a6b',
};
const ASSET: AssetKeyIdentity = {
  teamId: 'team-one',
  protocolId: '8a7b6c5d-4e3f-4a2b-9c8d-7e6f5a4b3c2d',
  assetId: 'mapbox-token',
};
const OAUTH: OAuthTokenIdentity = {
  providerId: 'google',
  accountId: '104728836491028374651',
  column: 'accessToken',
};

const WEBHOOK_SECRET = 'whsec_2f1c9d0b8a7e6f5d4c3b2a190807f6e5';
const ASSET_KEY = 'pk.eyJ1IjoiZXhhbXBsZSJ9.not-a-real-mapbox-token';
const OAUTH_TOKEN = 'ya29.a0ARrdaM-not-a-real-access-token';

/**
 * The property the acceptance criteria turn on: whatever went wrong, what
 * comes back names no plaintext, no ciphertext and no key. A failure here is
 * the difference between a log line an operator can paste into an issue and
 * one that has to be treated as a breach.
 */
function expectNoLeak(error: unknown, ...secrets: string[]): void {
  const printed = inspect(error);
  for (const secret of secrets) {
    expect(printed).not.toContain(secret);
    expect(printed).not.toContain(Buffer.from(secret).toString('base64'));
    expect(printed).not.toContain(Buffer.from(secret).toString('hex'));
  }
}

function thrown(act: () => unknown): unknown {
  try {
    act();
    return undefined;
  } catch (error: unknown) {
    return error;
  }
}

describe('sealing and opening each kind of secret', () => {
  const cipher = testCipher();

  it('round trips a webhook signing secret under the current key', () => {
    const sealed = cipher.sealWebhookSecret(WEBHOOK, WEBHOOK_SECRET);
    expect(sealed.keyId).toBe('test-1');
    expect(cipher.openWebhookSecret(WEBHOOK, sealed)).toBe(WEBHOOK_SECRET);
  });

  it('round trips an asset API key', () => {
    const sealed = cipher.sealAssetKey(ASSET, ASSET_KEY);
    expect(cipher.openAssetKey(ASSET, sealed)).toBe(ASSET_KEY);
  });

  it('round trips an OAuth token through its stored string form', () => {
    const stored = cipher.sealOAuthToken(OAUTH, OAUTH_TOKEN);
    expect(stored.startsWith('studio-secret:test-1:')).toBe(true);
    expect(cipher.openOAuthToken(OAUTH, stored)).toBe(OAUTH_TOKEN);
  });

  it('writes nothing recognisable into the stored bytes', () => {
    // The dump-and-search test (#1900's first acceptance criterion) searches
    // for these encodings across every table; asserting them here is what
    // makes that test about the write paths rather than about the cipher.
    const sealed = cipher.sealWebhookSecret(WEBHOOK, WEBHOOK_SECRET);
    const stored = cipher.sealOAuthToken(OAUTH, OAUTH_TOKEN);
    for (const encoding of ['utf8', 'base64', 'base64url', 'hex'] as const) {
      expect(sealed.ciphertext.toString(encoding)).not.toContain(
        encoding === 'utf8'
          ? WEBHOOK_SECRET
          : Buffer.from(WEBHOOK_SECRET).toString(encoding),
      );
    }
    expect(stored).not.toContain(OAUTH_TOKEN);
    expect(stored).not.toContain(
      Buffer.from(OAUTH_TOKEN).toString('base64url'),
    );
  });

  it('never produces the same bytes twice for the same value', () => {
    const once = cipher.sealWebhookSecret(WEBHOOK, WEBHOOK_SECRET);
    const twice = cipher.sealWebhookSecret(WEBHOOK, WEBHOOK_SECRET);
    expect(once.ciphertext.equals(twice.ciphertext)).toBe(false);
  });

  it('is an AES-256-GCM envelope of version, nonce, ciphertext and tag', async () => {
    // Read back with WebCrypto rather than with the module that wrote it, so
    // the layout, the 12-byte nonce, the 16-byte tag and the AAD are pinned
    // by something that shares no code with the writer.
    const keyring = testKeyring();
    const sealed = createSecretsCipher(keyring).sealWebhookSecret(
      WEBHOOK,
      WEBHOOK_SECRET,
    );
    expect(sealed.ciphertext[0]).toBe(1);

    const material = keyring.subkey('secrets', sealed.keyId).export();
    const key = await webcrypto.subtle.importKey(
      'raw',
      new Uint8Array(material),
      'AES-GCM',
      false,
      ['decrypt'],
    );
    const opened = await webcrypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(sealed.ciphertext.subarray(1, 13)),
        additionalData: new Uint8Array(
          Buffer.from(
            JSON.stringify(['webhook', WEBHOOK.teamId, WEBHOOK.subscriptionId]),
          ),
        ),
        tagLength: 128,
      },
      key,
      new Uint8Array(sealed.ciphertext.subarray(13)),
    );
    expect(Buffer.from(opened).toString('utf8')).toBe(WEBHOOK_SECRET);
  });
});

describe('the row a ciphertext belongs to', () => {
  const cipher = testCipher();

  const moved: [axis: string, identity: WebhookSecretIdentity][] = [
    ['another team', { ...WEBHOOK, teamId: 'team-two' }],
    [
      'another subscription',
      { ...WEBHOOK, subscriptionId: '11111111-2222-4333-8444-555555555555' },
    ],
  ];

  it.each(moved)('refuses a webhook secret read as %s', (_axis, identity) => {
    const sealed = cipher.sealWebhookSecret(WEBHOOK, WEBHOOK_SECRET);
    expect(() => cipher.openWebhookSecret(identity, sealed)).toThrow(
      SecretUnreadableError,
    );
  });

  const movedAssets: [axis: string, identity: AssetKeyIdentity][] = [
    ['another team', { ...ASSET, teamId: 'team-two' }],
    [
      'another protocol',
      { ...ASSET, protocolId: '99999999-8888-4777-8666-555555555555' },
    ],
    ['another asset', { ...ASSET, assetId: 'other-token' }],
  ];

  it.each(movedAssets)('refuses an asset key read as %s', (_axis, identity) => {
    const sealed = cipher.sealAssetKey(ASSET, ASSET_KEY);
    expect(() => cipher.openAssetKey(identity, sealed)).toThrow(
      SecretUnreadableError,
    );
  });

  const movedTokens: [axis: string, identity: OAuthTokenIdentity][] = [
    ['another provider', { ...OAUTH, providerId: 'microsoft' }],
    ['another account', { ...OAUTH, accountId: '000000000000000000000' }],
    // The column is in the identity precisely so this fails: without it an
    // access token could be moved into its own row's refresh-token column.
    ['another column of the same row', { ...OAUTH, column: 'refreshToken' }],
  ];

  it.each(movedTokens)('refuses a token read as %s', (_axis, identity) => {
    const stored = cipher.sealOAuthToken(OAUTH, OAUTH_TOKEN);
    expect(() => cipher.openOAuthToken(identity, stored)).toThrow(
      SecretUnreadableError,
    );
  });

  it('keeps identifiers that could spell each other apart', () => {
    // JSON framing rather than joining on a delimiter: these two rows would
    // share an authenticated tuple under any `a:b` join, and a ciphertext
    // could be moved between them undetected.
    const sealed = cipher.sealWebhookSecret(
      { teamId: 'a', subscriptionId: 'b,c' },
      WEBHOOK_SECRET,
    );
    expect(() =>
      cipher.openWebhookSecret({ teamId: 'a,b', subscriptionId: 'c' }, sealed),
    ).toThrow(SecretUnreadableError);
  });

  it('reads a uuid back whichever case the caller spells it in', () => {
    // Postgres returns a uuid lower-cased and an API caller may send it
    // upper-cased; the same row must open either way.
    const sealed = cipher.sealWebhookSecret(
      { ...WEBHOOK, subscriptionId: WEBHOOK.subscriptionId.toUpperCase() },
      WEBHOOK_SECRET,
    );
    expect(cipher.openWebhookSecret(WEBHOOK, sealed)).toBe(WEBHOOK_SECRET);
  });

  it('leaves the case of an identifier that is not a uuid alone', () => {
    // Team ids are text, and `Team-One` is a different team from `team-one`.
    const sealed = cipher.sealWebhookSecret(WEBHOOK, WEBHOOK_SECRET);
    expect(() =>
      cipher.openWebhookSecret({ ...WEBHOOK, teamId: 'Team-One' }, sealed),
    ).toThrow(SecretUnreadableError);
  });

  it('refuses to seal against an incomplete identity', () => {
    // An empty part would let two different rows share an AAD, which is the
    // one thing binding the identity exists to prevent.
    expect(() =>
      cipher.sealWebhookSecret({ ...WEBHOOK, teamId: '' }, WEBHOOK_SECRET),
    ).toThrow(/incomplete row identity/);
  });
});

describe('a stored value that is not what was written', () => {
  const cipher = testCipher();

  function tamper(at: number): SealedSecret {
    const sealed = cipher.sealWebhookSecret(WEBHOOK, WEBHOOK_SECRET);
    const ciphertext = Buffer.from(sealed.ciphertext);
    const byte = ciphertext[at];
    // An index past the end would leave the value untouched, and every
    // assertion below would then be about an envelope nobody tampered with.
    if (byte === undefined) throw new Error(`no byte at ${at} to flip`);
    ciphertext[at] = byte ^ 0x01;
    return { ...sealed, ciphertext };
  }

  it('refuses a flipped bit in the nonce', () => {
    expect(() => cipher.openWebhookSecret(WEBHOOK, tamper(1))).toThrow(
      SecretUnreadableError,
    );
  });

  it('refuses a flipped bit in the body', () => {
    expect(() => cipher.openWebhookSecret(WEBHOOK, tamper(20))).toThrow(
      SecretUnreadableError,
    );
  });

  it('refuses a flipped bit in the tag', () => {
    const sealed = cipher.sealWebhookSecret(WEBHOOK, WEBHOOK_SECRET);
    expect(() =>
      cipher.openWebhookSecret(WEBHOOK, tamper(sealed.ciphertext.length - 1)),
    ).toThrow(SecretUnreadableError);
  });

  it('refuses an envelope version this build does not know', () => {
    // The version byte is what lets a later layout be introduced safely: a
    // value that starts with anything else is refused, never guessed at.
    const sealed = cipher.sealWebhookSecret(WEBHOOK, WEBHOOK_SECRET);
    const ciphertext = Buffer.from(sealed.ciphertext);
    ciphertext[0] = 2;
    expect(() =>
      cipher.openWebhookSecret(WEBHOOK, { ...sealed, ciphertext }),
    ).toThrow(/version 2 is not one this build can read/);
  });

  it.each([0, 1, 13, 28])('refuses a %i-byte value', (length) => {
    expect(() =>
      cipher.openWebhookSecret(WEBHOOK, {
        keyId: 'test-1',
        ciphertext: Buffer.alloc(length, 1),
      }),
    ).toThrow(/too short to be an envelope/);
  });

  it('refuses a truncated envelope of a plausible length', () => {
    const sealed = cipher.sealWebhookSecret(WEBHOOK, WEBHOOK_SECRET);
    expect(() =>
      cipher.openWebhookSecret(WEBHOOK, {
        ...sealed,
        ciphertext: sealed.ciphertext.subarray(0, -1),
      }),
    ).toThrow(SecretUnreadableError);
  });
});

describe('which key opens a value', () => {
  it('refuses a key id that is not the one it was sealed under', () => {
    const cipher = testCipher();
    const sealed = cipher.sealWebhookSecret(WEBHOOK, WEBHOOK_SECRET);
    expect(() =>
      cipher.openWebhookSecret(WEBHOOK, { ...sealed, keyId: 'test-2' }),
    ).toThrow(SecretUnreadableError);
  });

  it('refuses a key id the keyring cannot produce, naming it', () => {
    const cipher = testCipher();
    const sealed = cipher.sealWebhookSecret(WEBHOOK, WEBHOOK_SECRET);
    expect(() =>
      cipher.openWebhookSecret(WEBHOOK, { ...sealed, keyId: 'gone' }),
    ).toThrow(/cannot produce key id "gone"/);
  });

  it('still opens a value after a new key is put in front of it', () => {
    // Rotation is a deploy of a longer keyring followed by a command. Between
    // the two, every value in the database is under the older key.
    const sealed = testCipher(testKeyring(['test-1'])).sealWebhookSecret(
      WEBHOOK,
      WEBHOOK_SECRET,
    );
    const rotated = testCipher(testKeyring(['test-2', 'test-1']));
    expect(rotated.openWebhookSecret(WEBHOOK, sealed)).toBe(WEBHOOK_SECRET);
  });

  it('fails closed once the old key is taken out, naming what it needs', () => {
    const sealed = testCipher(testKeyring(['test-1'])).sealWebhookSecret(
      WEBHOOK,
      WEBHOOK_SECRET,
    );
    const shortened = testCipher(testKeyring(['test-2']));
    expect(() => shortened.openWebhookSecret(WEBHOOK, sealed)).toThrow(
      /cannot produce key id "test-1"/,
    );
  });
});

describe('re-sealing for rotation', () => {
  const rotated = testCipher(testKeyring(['test-2', 'test-1']));
  const underOld = testCipher(testKeyring(['test-1']));

  it('hands back the same value when it is already current', () => {
    // Rotation is a full table scan; a row already under the current key must
    // cost nothing and, above all, must not be rewritten with a new nonce for
    // no reason.
    const sealed = rotated.sealWebhookSecret(WEBHOOK, WEBHOOK_SECRET);
    expect(rotated.resealWebhookSecret(WEBHOOK, sealed)).toBe(sealed);

    const stored = rotated.sealOAuthToken(OAUTH, OAUTH_TOKEN);
    expect(rotated.resealOAuthToken(OAUTH, stored)).toBe(stored);

    const key = rotated.sealAssetKey(ASSET, ASSET_KEY);
    expect(rotated.resealAssetKey(ASSET, key)).toBe(key);
  });

  it('moves a webhook secret to the current key, unchanged in plaintext', () => {
    const sealed = underOld.sealWebhookSecret(WEBHOOK, WEBHOOK_SECRET);
    const resealed = rotated.resealWebhookSecret(WEBHOOK, sealed);
    expect(resealed.keyId).toBe('test-2');
    expect(resealed.ciphertext.equals(sealed.ciphertext)).toBe(false);
    expect(rotated.openWebhookSecret(WEBHOOK, resealed)).toBe(WEBHOOK_SECRET);
  });

  it('moves an asset key to the current key', () => {
    const sealed = underOld.sealAssetKey(ASSET, ASSET_KEY);
    const resealed = rotated.resealAssetKey(ASSET, sealed);
    expect(resealed.keyId).toBe('test-2');
    expect(rotated.openAssetKey(ASSET, resealed)).toBe(ASSET_KEY);
  });

  it('moves an OAuth token to the current key', () => {
    const stored = underOld.sealOAuthToken(OAUTH, OAUTH_TOKEN);
    const resealed = rotated.resealOAuthToken(OAUTH, stored);
    expect(parseOAuthTokenKeyId(resealed)).toBe('test-2');
    expect(rotated.openOAuthToken(OAUTH, resealed)).toBe(OAUTH_TOKEN);
  });

  it('refuses to re-seal a token that was never sealed', () => {
    // Rotation must not be the thing that quietly encrypts a plaintext token
    // someone wrote around the adapter: that row needs a person to look at it.
    expect(() => rotated.resealOAuthToken(OAUTH, OAUTH_TOKEN)).toThrow(
      SecretUnreadableError,
    );
  });
});

describe('the stored OAuth token form', () => {
  const cipher = testCipher();

  it('refuses a plaintext token rather than returning it', () => {
    expect(() => cipher.openOAuthToken(OAUTH, OAUTH_TOKEN)).toThrow(
      /not a sealed secret/,
    );
  });

  it.each([
    ['nothing at all', ''],
    ['the prefix alone', 'studio-secret:'],
    ['a prefix with no key id', 'studio-secret::abcd'],
    ['a key id with no value', 'studio-secret:test-1'],
    ['a key id that is not one a keyring could hold', 'studio-secret:a:b:c'],
  ])('refuses %s', (_name, stored) => {
    expect(() => cipher.openOAuthToken(OAUTH, stored)).toThrow(
      SecretUnreadableError,
    );
  });

  it('refuses a body that is not canonically encoded', () => {
    // Node's decoder ignores what it cannot read, so `…=` and `…` would
    // otherwise decrypt to the same thing and two stored strings would be one
    // value.
    const stored = cipher.sealOAuthToken(OAUTH, OAUTH_TOKEN);
    expect(() => cipher.openOAuthToken(OAUTH, `${stored}=`)).toThrow(
      /not canonically encoded/,
    );
  });

  it('reads its key id the way the rotation SQL does', () => {
    // `split_part(col, ':', 2)` is what the boot check and the rotation query
    // use; the two must agree for every id a keyring can hold.
    const stored = cipher.sealOAuthToken(OAUTH, OAUTH_TOKEN);
    expect(parseOAuthTokenKeyId(stored)).toBe(stored.split(':')[1]);
    expect(parseOAuthTokenKeyId(stored)).toBe('test-1');
  });

  it.each([
    OAUTH_TOKEN,
    '',
    'studio-secret:',
    'studio-secret::x',
    'studio-secret:has a space:x',
    'studio-secret:-leading-dash:x',
  ])('reads no key id out of %j', (stored) => {
    expect(parseOAuthTokenKeyId(stored)).toBeUndefined();
  });

  it('stops at the first separator, exactly as split_part does', () => {
    // A stored value with further colons in its body is still read as the
    // same key id by both, and then refused by the canonical-encoding check
    // rather than opened.
    expect(parseOAuthTokenKeyId('studio-secret:test-1:a:b')).toBe('test-1');
    expect(() =>
      cipher.openOAuthToken(OAUTH, 'studio-secret:test-1:a:b'),
    ).toThrow(SecretUnreadableError);
  });
});

describe('what a failure says', () => {
  const cipher = testCipher();

  it('names neither the value nor the key when a read fails', () => {
    const sealed = cipher.sealWebhookSecret(WEBHOOK, WEBHOOK_SECRET);
    const material = testKeyring().subkey('secrets', 'test-1').export();
    const cases = [
      () => cipher.openWebhookSecret({ ...WEBHOOK, teamId: 'other' }, sealed),
      () => cipher.openWebhookSecret(WEBHOOK, { ...sealed, keyId: 'gone' }),
      () => cipher.openOAuthToken(OAUTH, cipher.sealOAuthToken(OAUTH, 'x')),
      () => cipher.openOAuthToken(OAUTH, OAUTH_TOKEN),
    ];
    for (const act of cases) {
      const error = thrown(act);
      if (!error) continue;
      expectNoLeak(error, WEBHOOK_SECRET, OAUTH_TOKEN);
      expect(inspect(error)).not.toContain(
        sealed.ciphertext.toString('base64'),
      );
      expect(inspect(error)).not.toContain(
        Buffer.from(material).toString('base64'),
      );
    }
  });
});

describe('the nonce generator', () => {
  it('takes twelve bytes from the injected source', () => {
    // The seed is the only caller that injects one, so its synthetic data is
    // reproducible; everything else takes the CSPRNG.
    const random = vi.fn((bytes: number) => Buffer.alloc(bytes, 7));
    const cipher = createSecretsCipher(testKeyring(), { random });
    const once = cipher.sealWebhookSecret(WEBHOOK, WEBHOOK_SECRET);
    const twice = cipher.sealWebhookSecret(WEBHOOK, WEBHOOK_SECRET);
    expect(random).toHaveBeenCalledWith(12);
    expect(once.ciphertext.equals(twice.ciphertext)).toBe(true);
    expect(cipher.openWebhookSecret(WEBHOOK, once)).toBe(WEBHOOK_SECRET);
  });

  it('refuses a generator that returns the wrong number of bytes', () => {
    // GCM accepts other nonce lengths, so a short one would weaken every
    // value it sealed without ever failing.
    const cipher = createSecretsCipher(testKeyring(), {
      random: () => randomBytes(8),
    });
    expect(() => cipher.sealWebhookSecret(WEBHOOK, WEBHOOK_SECRET)).toThrow(
      /must be 12 bytes/,
    );
  });
});

describe('the shared test keyring', () => {
  it('is not the development keyring, and names its own keys', () => {
    // Suites share it so a value one seals another can open; it must not be
    // the committed development one, or a test could pass by reading
    // `.env.development` instead of what it was given.
    expect(testKeyring().ids()).toEqual(['test-1', 'test-2']);
    expect(testKeyringEntry('test-1')).not.toContain('studio-dev');
    expect(testKeyring(['test-2', 'test-1']).currentId).toBe('test-2');
  });
});
