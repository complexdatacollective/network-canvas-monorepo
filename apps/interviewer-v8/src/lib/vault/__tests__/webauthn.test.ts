import { afterEach, describe, expect, it, vi } from 'vitest';

import { enrollBiometric, isPrfSupported, readPrf } from '../webauthn';

type CreateFn = (
  options: CredentialCreationOptions,
) => Promise<Credential | null>;
type GetFn = (options: CredentialRequestOptions) => Promise<Credential | null>;

function installNavigator(create: CreateFn, get: GetFn): void {
  vi.stubGlobal('navigator', {
    ...navigator,
    credentials: { create, get },
  });
}

// A fake PublicKeyCredential carrying a raw id and PRF extension outputs:
// `enabled` mirrors what an authenticator reports at create() time, `first`
// what a get() assertion evaluates.
function fakeCredential(
  rawId: ArrayBuffer,
  prf?: { enabled?: boolean; first?: ArrayBuffer },
): Credential {
  const results =
    prf == null
      ? {}
      : {
          prf: {
            ...(prf.enabled == null ? {} : { enabled: prf.enabled }),
            ...(prf.first == null ? {} : { results: { first: prf.first } }),
          },
        };
  return {
    type: 'public-key',
    id: 'ignored',
    rawId,
    getClientExtensionResults: () => results,
  } as unknown as Credential;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isPrfSupported', () => {
  it('is false when PublicKeyCredential is absent', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined);
    expect(await isPrfSupported()).toBe(false);
  });

  it('is true when a platform authenticator is available', async () => {
    vi.stubGlobal('PublicKeyCredential', {
      isUserVerifyingPlatformAuthenticatorAvailable: () =>
        Promise.resolve(true),
    });
    expect(await isPrfSupported()).toBe(true);
  });

  it('is false when no platform authenticator is available', async () => {
    vi.stubGlobal('PublicKeyCredential', {
      isUserVerifyingPlatformAuthenticatorAvailable: () =>
        Promise.resolve(false),
    });
    expect(await isPrfSupported()).toBe(false);
  });
});

describe('enrollBiometric', () => {
  it('creates a platform passkey then reads PRF via a follow-up get()', async () => {
    const rawId = new Uint8Array([9, 8, 7, 6]).buffer;
    const prf = new Uint8Array(32).fill(7).buffer;

    let createOpts: CredentialCreationOptions | undefined;
    let getOpts: CredentialRequestOptions | undefined;

    const create: CreateFn = (opts) => {
      createOpts = opts;
      return Promise.resolve(fakeCredential(rawId, { enabled: true }));
    };
    const get: GetFn = (opts) => {
      getOpts = opts;
      return Promise.resolve(fakeCredential(rawId, { first: prf }));
    };
    installNavigator(create, get);

    const { enrollment, prfOutput } = await enrollBiometric(
      new Uint8Array([1, 2, 3]),
    );

    // create() option shape
    const pub = createOpts?.publicKey;
    expect(pub?.authenticatorSelection?.authenticatorAttachment).toBe(
      'platform',
    );
    expect(pub?.authenticatorSelection?.residentKey).toBe('preferred');
    expect(pub?.authenticatorSelection?.userVerification).toBe('required');
    expect(
      (pub?.extensions as { prf?: unknown } | undefined)?.prf,
    ).toBeDefined();
    expect(Array.from(new Uint8Array(pub?.user.id as ArrayBuffer))).toEqual([
      1, 2, 3,
    ]);

    // get() option shape — PRF eval.first must be the prf salt
    const req = getOpts?.publicKey;
    expect(req?.userVerification).toBe('required');
    const prfExt = (
      req?.extensions as { prf?: { eval?: { first?: BufferSource } } }
    )?.prf;
    expect(prfExt?.eval?.first).toBeDefined();
    expect(req?.allowCredentials?.[0]?.id).toBeDefined();

    // returned PRF output + enrollment
    expect(Array.from(new Uint8Array(prfOutput))).toEqual(
      Array.from(new Uint8Array(prf)),
    );
    expect(typeof enrollment.credentialId).toBe('string');
    expect(typeof enrollment.prfSaltB64).toBe('string');
  });

  it('fails fast when create() does not report prf.enabled, dropping the orphan passkey without a second prompt', async () => {
    const rawId = new Uint8Array([1]).buffer;
    const get = vi.fn<GetFn>();
    const signalUnknownCredential = vi.fn(() => Promise.resolve());
    // e.g. Chrome's macOS profile authenticator — the installed-PWA fallback
    // (crbug.com/364926914) — which has no PRF support at all.
    installNavigator(() => Promise.resolve(fakeCredential(rawId)), get);
    vi.stubGlobal('PublicKeyCredential', { signalUnknownCredential });

    await expect(enrollBiometric(new Uint8Array([1]))).rejects.toThrow(
      /PIN or passphrase/,
    );
    expect(get).not.toHaveBeenCalled();
    expect(signalUnknownCredential).toHaveBeenCalledWith({
      rpId: window.location.hostname,
      credentialId: 'AQ',
    });
  });

  it('throws when the follow-up get() returns no PRF result', async () => {
    const rawId = new Uint8Array([1]).buffer;
    installNavigator(
      () => Promise.resolve(fakeCredential(rawId, { enabled: true })),
      () => Promise.resolve(fakeCredential(rawId)), // no prf output
    );
    await expect(enrollBiometric(new Uint8Array([1]))).rejects.toThrow();
  });
});

describe('readPrf', () => {
  it('returns the PRF secret for an existing credential', async () => {
    const rawId = new Uint8Array([4, 5, 6]).buffer;
    const prf = new Uint8Array(32).fill(3).buffer;
    let getOpts: CredentialRequestOptions | undefined;
    installNavigator(
      () => Promise.resolve(null),
      (opts) => {
        getOpts = opts;
        return Promise.resolve(fakeCredential(rawId, { first: prf }));
      },
    );

    // credentialId base64url of [4,5,6] = "BAUG"
    const out = await readPrf('BAUG', btoa('salt-bytes-here!'));
    expect(Array.from(new Uint8Array(out))).toEqual(
      Array.from(new Uint8Array(prf)),
    );
    const req = getOpts?.publicKey;
    expect(req?.userVerification).toBe('required');
    expect(
      (req?.extensions as { prf?: { eval?: { first?: BufferSource } } })?.prf
        ?.eval?.first,
    ).toBeDefined();
  });

  it('throws when PRF is missing on the assertion', async () => {
    const rawId = new Uint8Array([1]).buffer;
    installNavigator(
      () => Promise.resolve(null),
      () => Promise.resolve(fakeCredential(rawId)),
    );
    await expect(readPrf('AQ', btoa('salt'))).rejects.toThrow();
  });
});
