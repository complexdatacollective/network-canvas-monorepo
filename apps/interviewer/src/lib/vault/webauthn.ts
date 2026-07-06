import { fromBase64, toBase64 } from './crypto';

export type BiometricEnrollment = {
  credentialId: string; // base64url
  prfSaltB64: string;
};

const RP_NAME = 'Network Canvas Interviewer';
const PRF_SALT_BYTES = 32;

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(b64url: string): Uint8Array<ArrayBuffer> {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad =
    padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return fromBase64(padded + pad);
}

// Structural guard for the subset of PublicKeyCredential this module reads.
// Avoids `as PublicKeyCredential`: jsdom has no PublicKeyCredential global
// (so `instanceof` would throw), and test fixtures only implement this shape.
type CredentialWithExtensions = {
  rawId: ArrayBuffer;
  getClientExtensionResults: () => AuthenticationExtensionsClientOutputs;
};

function hasClientExtensions(
  credential: Credential,
): credential is Credential & CredentialWithExtensions {
  return (
    'rawId' in credential &&
    credential.rawId instanceof ArrayBuffer &&
    'getClientExtensionResults' in credential &&
    typeof credential.getClientExtensionResults === 'function'
  );
}

function bufferSourceToArrayBuffer(source: BufferSource): ArrayBuffer {
  if (source instanceof ArrayBuffer) return source;
  return source.buffer.slice(
    source.byteOffset,
    source.byteOffset + source.byteLength,
  );
}

function readPrfFirst(credential: Credential): ArrayBuffer | null {
  if (!hasClientExtensions(credential)) return null;
  const results = credential.getClientExtensionResults();
  const first = results.prf?.results?.first;
  if (first == null) return null;
  return bufferSourceToArrayBuffer(first);
}

// Structural guard for the optional, newer signalUnknownCredential static.
// jsdom (and older browsers) have no PublicKeyCredential global at all, so
// `typeof PublicKeyCredential === 'undefined'` must be checked first.
type PublicKeyCredentialWithSignal = {
  signalUnknownCredential: (options: {
    rpId: string;
    credentialId: string;
  }) => Promise<void>;
};

function supportsSignalUnknownCredential(
  value: object,
): value is PublicKeyCredentialWithSignal {
  return (
    'signalUnknownCredential' in value &&
    typeof value.signalUnknownCredential === 'function'
  );
}

// Best-effort "this credential is no longer usable" hint so the authenticator
// or password manager can drop the passkey. Not universally available, and
// failures are swallowed — callers treat their own vault record as the
// authoritative revocation.
export async function signalCredentialUnknown(
  credentialId: string,
): Promise<void> {
  if (typeof PublicKeyCredential === 'undefined') return;
  if (!supportsSignalUnknownCredential(PublicKeyCredential)) return;
  try {
    await PublicKeyCredential.signalUnknownCredential({
      rpId: window.location.hostname,
      credentialId,
    });
  } catch {
    // Passkey deletion is best-effort; ignore failures.
  }
}

export async function isPrfSupported(): Promise<boolean> {
  if (typeof PublicKeyCredential === 'undefined') return false;
  if (
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !==
    'function'
  ) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function enrollBiometric(
  userHandle: Uint8Array<ArrayBuffer>,
): Promise<{ enrollment: BiometricEnrollment; prfOutput: ArrayBuffer }> {
  const prfSalt = crypto.getRandomValues(new Uint8Array(PRF_SALT_BYTES));
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const created = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: RP_NAME },
      user: {
        id: userHandle,
        name: 'interviewer',
        displayName: 'Network Canvas Interviewer',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required',
      },
      extensions: { prf: {} },
    },
  });
  if (created == null) {
    throw new Error('Biometric enrolment was cancelled');
  }
  if (!hasClientExtensions(created)) {
    throw new Error('This device did not return a usable credential');
  }
  const rawId = new Uint8Array(created.rawId);
  const credentialId = toBase64Url(rawId);

  // `prf.enabled` at creation is the authoritative capability signal: PRF-
  // capable authenticators (iCloud Keychain, Google Password Manager, Android)
  // report `enabled: true` here, while one that omits it (e.g. Chrome's macOS
  // profile authenticator — the installed-PWA fallback, crbug.com/364926914)
  // will never return a PRF secret. Fail before prompting a second time, and
  // drop the passkey this ceremony just orphaned.
  if (created.getClientExtensionResults().prf?.enabled !== true) {
    await signalCredentialUnknown(credentialId);
    throw new Error(
      "This device's authenticator can't create the biometric secret (PRF) needed to encrypt your data. Choose a PIN or passphrase instead.",
    );
  }

  const prfSaltB64 = toBase64(prfSalt);

  // A follow-up get() reads the PRF output; some platforms do not return it
  // at create() time.
  const prfOutput = await readPrf(credentialId, prfSaltB64);

  return {
    enrollment: { credentialId, prfSaltB64 },
    prfOutput,
  };
}

export async function readPrf(
  credentialId: string,
  prfSaltB64: string,
): Promise<ArrayBuffer> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [
        { type: 'public-key', id: fromBase64Url(credentialId) },
      ],
      userVerification: 'required',
      extensions: { prf: { eval: { first: fromBase64(prfSaltB64) } } },
    },
  });
  if (assertion == null) {
    throw new Error('Biometric verification was cancelled');
  }
  const first = readPrfFirst(assertion);
  if (first == null) {
    throw new Error('This device did not return a biometric secret (PRF)');
  }
  return first;
}
