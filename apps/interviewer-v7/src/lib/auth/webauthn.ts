const RP_NAME = 'Network Canvas Interviewer';

export type Bytes = Uint8Array<ArrayBuffer>;

export function toBase64(bytes: BufferSource): string {
  const view =
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes instanceof ArrayBuffer ? bytes : bytes.buffer);
  let bin = '';
  for (let i = 0; i < view.length; i += 1)
    bin += String.fromCharCode(view[i] ?? 0);
  return btoa(bin);
}

export function fromBase64(b64: string): Bytes {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

type PrfFirstResults = { first?: ArrayBuffer; second?: ArrayBuffer };
type PrfExtensionResult = { results?: PrfFirstResults; enabled?: boolean };
type ExtensionResultsWithPrf = AuthenticationExtensionsClientOutputs & {
  prf?: PrfExtensionResult;
};

export type PasskeyEnrolment = {
  credentialId: Bytes;
  prfOutput: Bytes;
};

export type PasskeyResult =
  | { ok: true; enrolment: PasskeyEnrolment }
  | { ok: false; error: string };

function getRpId(): string {
  const host = window.location?.hostname;
  if (host && host !== '') return host;
  return 'localhost';
}

export function isWebAuthnAvailable(): boolean {
  if (typeof PublicKeyCredential === 'undefined') return false;
  if (
    typeof navigator === 'undefined' ||
    !navigator.credentials?.create ||
    !navigator.credentials?.get
  )
    return false;
  return true;
}

function readPrfOutput(credential: PublicKeyCredential): Bytes | null {
  const extensions =
    credential.getClientExtensionResults() as ExtensionResultsWithPrf;
  const buffer = extensions.prf?.results?.first;
  if (!buffer) return null;
  return new Uint8Array(buffer);
}

function describeError(cause: unknown): string {
  if (cause instanceof Error) {
    const name = cause.name ? `${cause.name}: ` : '';
    return `${name}${cause.message}`;
  }
  return String(cause);
}

export async function createPasskey(args: {
  userId: BufferSource;
  userName: string;
  salt: BufferSource;
  signal?: AbortSignal;
}): Promise<PasskeyResult> {
  if (typeof navigator === 'undefined' || !navigator.credentials?.create) {
    return { ok: false, error: 'WebAuthn API not available in this context' };
  }
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { id: getRpId(), name: RP_NAME },
        user: {
          id: args.userId,
          name: args.userName,
          displayName: args.userName,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          userVerification: 'preferred',
          residentKey: 'preferred',
        },
        extensions: {
          prf: { eval: { first: args.salt } },
        } as AuthenticationExtensionsClientInputs,
        timeout: 60_000,
      },
      signal: args.signal,
    })) as PublicKeyCredential | null;
  } catch (cause) {
    return { ok: false, error: describeError(cause) };
  }
  if (!credential) {
    return { ok: false, error: 'Browser returned no credential' };
  }

  const credentialId = new Uint8Array(credential.rawId);
  const prfOnCreate = readPrfOutput(credential);
  if (prfOnCreate) {
    return { ok: true, enrolment: { credentialId, prfOutput: prfOnCreate } };
  }
  const result = await authenticatePasskey({
    credentialId,
    salt: args.salt,
    signal: args.signal,
  });
  if (result.ok) return result;
  return {
    ok: false,
    error: `Created passkey but could not derive an encryption key from it (PRF extension unsupported). ${result.error}`,
  };
}

export async function authenticatePasskey(args: {
  credentialId: BufferSource;
  salt: BufferSource;
  signal?: AbortSignal;
}): Promise<PasskeyResult> {
  if (typeof navigator === 'undefined' || !navigator.credentials?.get) {
    return { ok: false, error: 'WebAuthn API not available in this context' };
  }
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  let assertion: PublicKeyCredential | null;
  try {
    assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: getRpId(),
        allowCredentials: [{ id: args.credentialId, type: 'public-key' }],
        userVerification: 'preferred',
        extensions: {
          prf: { eval: { first: args.salt } },
        } as AuthenticationExtensionsClientInputs,
        timeout: 60_000,
      },
      signal: args.signal,
    })) as PublicKeyCredential | null;
  } catch (cause) {
    return { ok: false, error: describeError(cause) };
  }
  if (!assertion) {
    return { ok: false, error: 'Browser returned no assertion' };
  }
  const prfOutput = readPrfOutput(assertion);
  if (!prfOutput) {
    return {
      ok: false,
      error:
        'Authenticator did not return a PRF output (extension unsupported)',
    };
  }
  return {
    ok: true,
    enrolment: {
      credentialId: new Uint8Array(assertion.rawId),
      prfOutput,
    },
  };
}
