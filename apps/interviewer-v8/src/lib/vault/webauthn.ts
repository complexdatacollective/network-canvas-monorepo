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
        name: 'interviewer-v8',
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
