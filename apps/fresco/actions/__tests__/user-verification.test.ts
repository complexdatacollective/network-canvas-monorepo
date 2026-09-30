import {
  createHash,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';

import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  generateSignupRegistrationOptions,
  signupWithPasskey,
  switchToPasskeyMode,
  verifyAuthentication,
  verifyPasskeyReauth,
  verifyRegistration,
} from '~/actions/webauthn';

import { formatActionError } from './formatActionError';

// These flows run against the real @simplewebauthn/server and the real Fresco
// WebAuthn configuration; only Next.js request plumbing, the database, and
// side effects are mocked. Every response below carries a genuine P-256
// signature over the data it claims, so the only difference between an
// accepted and a rejected response is the authenticator-data flag byte.

vi.mock('server-only', () => ({}));

const {
  cookieJar,
  createSessionCookie,
  recordLoginAttempt,
  createCredential,
  createUser,
  findCredential,
  updateCredential,
  transaction,
} = vi.hoisted(() => ({
  cookieJar: new Map<string, string>(),
  createSessionCookie: vi.fn(),
  recordLoginAttempt: vi.fn(),
  createCredential: vi.fn(),
  createUser: vi.fn(),
  findCredential: vi.fn(),
  updateCredential: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('next/headers', () => ({
  // A working cookie jar so the challenge an options call sets is the
  // challenge the matching verify call reads back.
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { value };
    },
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
  headers: async () => new Map([['origin', 'https://example.test']]),
}));
vi.mock('~/env', () => ({ env: { NODE_ENV: 'test' } }));
vi.mock('~/lib/auth/guards', () => ({
  requireApiAuth: async () => ({
    user: { userId: 'user-1', username: 'Researcher' },
  }),
}));
vi.mock('~/lib/auth/session', () => ({ createSessionCookie }));
vi.mock('~/lib/db', () => ({
  prisma: {
    webAuthnCredential: {
      findMany: async () => [],
      findUnique: findCredential,
      create: createCredential,
      update: updateCredential,
    },
    user: { create: createUser },
    key: {
      findFirst: async () => ({ id: 'key-1', hashed_password: 'hash' }),
      update: vi.fn(),
    },
    totpCredential: { deleteMany: vi.fn() },
    recoveryCode: { deleteMany: vi.fn() },
    $transaction: transaction,
  },
}));
vi.mock('~/lib/activityFeed', () => ({ addEvent: vi.fn() }));
vi.mock('~/lib/cache', () => ({ safeUpdateTag: vi.fn() }));
vi.mock('~/lib/rateLimit', () => ({
  checkRateLimit: async () => ({ allowed: true }),
  recordLoginAttempt,
}));
vi.mock('~/queries/appSettings', () => ({
  getInstallationId: async () => 'installation-1',
  isAppConfigured: async () => false,
}));
vi.mock('~/utils/getClientIp', () => ({
  getClientIp: async () => '203.0.113.7',
}));
vi.mock('~/utils/password', () => ({
  hashPassword: vi.fn(),
  verifyPassword: async () => true,
}));

const RP_ID = 'example.test';
const ORIGIN = 'https://example.test';
const CREDENTIAL_ID = Buffer.from('fresco-test-credential');

// Authenticator-data flag bits (WebAuthn §6.1).
const USER_PRESENT = 0x01;
const USER_VERIFIED = 0x04;
const ATTESTED_CREDENTIAL_DATA = 0x40;

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function coordinate(value: string | undefined): Buffer {
  if (!value) throw new Error('Expected a P-256 public key coordinate');
  return Buffer.from(value, 'base64url');
}

// The COSE_Key for the ES256 public key, hand-encoded as CBOR so the fixture
// does not depend on how any encoder lays a map out:
// {1: 2 (kty EC2), 3: -7 (alg ES256), -1: 1 (crv P-256), -2: x, -3: y}
function cosePublicKey(key: KeyObject): Buffer {
  const jwk = key.export({ format: 'jwk' });
  return Buffer.concat([
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
    coordinate(jwk.x),
    Buffer.from([0x22, 0x58, 0x20]),
    coordinate(jwk.y),
  ]);
}

// rpIdHash (32) | flags (1) | signature counter (4) | attested credential data
function authenticatorData(flags: number, attested?: Buffer): Buffer {
  const header = Buffer.alloc(37);
  createHash('sha256').update(RP_ID).digest().copy(header, 0);
  header[32] = flags;
  header.writeUInt32BE(0, 33);
  return attested ? Buffer.concat([header, attested]) : header;
}

function clientData(
  type: 'webauthn.get' | 'webauthn.create',
  challenge: string,
): Buffer {
  return Buffer.from(JSON.stringify({ type, challenge, origin: ORIGIN }));
}

function assertion(
  challenge: string,
  flags: number,
): AuthenticationResponseJSON {
  const authData = authenticatorData(flags);
  const client = clientData('webauthn.get', challenge);
  const signature = sign(
    'sha256',
    Buffer.concat([authData, createHash('sha256').update(client).digest()]),
    privateKey,
  );
  const id = base64url(CREDENTIAL_ID);
  return {
    id,
    rawId: id,
    type: 'public-key',
    response: {
      clientDataJSON: base64url(client),
      authenticatorData: base64url(authData),
      signature: base64url(signature),
    },
    clientExtensionResults: {},
  };
}

function attestation(
  challenge: string,
  flags: number,
): RegistrationResponseJSON {
  const attested = Buffer.concat([
    Buffer.alloc(16), // AAGUID
    Buffer.from([CREDENTIAL_ID.length >> 8, CREDENTIAL_ID.length & 0xff]),
    CREDENTIAL_ID,
    cosePublicKey(publicKey),
  ]);
  const authData = authenticatorData(
    flags | ATTESTED_CREDENTIAL_DATA,
    attested,
  );
  if (authData.length > 0xff) {
    throw new Error('Fixture outgrew the one-byte CBOR length encoded below');
  }
  // {"fmt": "none", "attStmt": {}, "authData": <bytes>}
  const attestationObject = Buffer.concat([
    Buffer.from([0xa3]),
    Buffer.from([0x63]),
    Buffer.from('fmt'),
    Buffer.from([0x64]),
    Buffer.from('none'),
    Buffer.from([0x67]),
    Buffer.from('attStmt'),
    Buffer.from([0xa0]),
    Buffer.from([0x68]),
    Buffer.from('authData'),
    Buffer.from([0x58, authData.length]),
    authData,
  ]);
  const id = base64url(CREDENTIAL_ID);
  return {
    id,
    rawId: id,
    type: 'public-key',
    response: {
      clientDataJSON: base64url(clientData('webauthn.create', challenge)),
      attestationObject: base64url(attestationObject),
    },
    clientExtensionResults: {},
  };
}

type OptionsResult = Promise<{
  data: { options: { challenge: string } } | null;
}>;

async function challengeFrom(start: () => OptionsResult): Promise<string> {
  const { data } = await start();
  if (!data) throw new Error('Expected WebAuthn options');
  return data.options.challenge;
}

const storedCredential = {
  id: 'credential-row-1',
  credentialId: base64url(CREDENTIAL_ID),
  publicKey: base64url(cosePublicKey(publicKey)),
  counter: BigInt(0),
  transports: null,
  user_id: 'user-1',
  user: { id: 'user-1', username: 'Researcher' },
};

beforeEach(() => {
  vi.clearAllMocks();
  cookieJar.clear();
  findCredential.mockResolvedValue(storedCredential);
  createCredential.mockResolvedValue({
    id: 'credential-row-1',
    friendlyName: null,
    deviceType: 'singleDevice',
    createdAt: new Date(),
  });
  createUser.mockResolvedValue({ id: 'user-1' });
  transaction.mockImplementation((writes: Promise<unknown>[]) =>
    Promise.all(writes),
  );
});

describe('passkey sign-in', () => {
  it('asks the authenticator to verify the user', async () => {
    const { data } = await generateAuthenticationOptions();
    expect(data.options.userVerification).toBe('required');
  });

  it('rejects an assertion whose authenticator skipped user verification', async () => {
    const challenge = await challengeFrom(generateAuthenticationOptions);
    const result = await verifyAuthentication({
      credential: assertion(challenge, USER_PRESENT),
    });
    expect(formatActionError(result.error)).toBe(
      'This passkey did not verify your identity. Fresco requires a passkey that confirms who you are with a PIN, fingerprint, or face. Try another passkey, or ask another administrator to reset your authentication.',
    );
    expect(createSessionCookie).not.toHaveBeenCalled();
    expect(updateCredential).not.toHaveBeenCalled();
    expect(recordLoginAttempt).toHaveBeenCalledWith(
      'Researcher',
      '203.0.113.7',
      false,
    );
  });

  it('accepts the same assertion once the authenticator verified the user', async () => {
    const challenge = await challengeFrom(generateAuthenticationOptions);
    const result = await verifyAuthentication({
      credential: assertion(challenge, USER_PRESENT | USER_VERIFIED),
    });
    expect(formatActionError(result.error)).toBeNull();
    expect(createSessionCookie).toHaveBeenCalledWith('user-1');
    expect(recordLoginAttempt).toHaveBeenCalledWith(
      'Researcher',
      '203.0.113.7',
      true,
    );
  });
});

describe('passkey re-authentication', () => {
  it('rejects an assertion whose authenticator skipped user verification', async () => {
    const challenge = await challengeFrom(generateAuthenticationOptions);
    const result = await verifyPasskeyReauth({
      credential: assertion(challenge, USER_PRESENT),
    });
    expect(formatActionError(result.error)).toBe(
      'This passkey did not verify your identity. Add a passkey that confirms who you are with a PIN, fingerprint, or face, then try again.',
    );
    expect(result.data).toBeNull();
    expect(updateCredential).not.toHaveBeenCalled();
  });

  it('accepts the same assertion once the authenticator verified the user', async () => {
    const challenge = await challengeFrom(generateAuthenticationOptions);
    const result = await verifyPasskeyReauth({
      credential: assertion(challenge, USER_PRESENT | USER_VERIFIED),
    });
    expect(formatActionError(result.error)).toBeNull();
    expect(result.data).toEqual({ verified: true });
  });
});

describe('passkey registration', () => {
  it('asks for an authenticator that verifies the user', async () => {
    const { data } = await generateRegistrationOptions();
    expect(data.options.authenticatorSelection?.userVerification).toBe(
      'required',
    );
  });

  const paths = [
    {
      name: 'an additional passkey',
      start: generateRegistrationOptions,
      register: (credential: RegistrationResponseJSON) =>
        verifyRegistration({ credential }),
    },
    {
      name: 'a passkey-only account',
      start: () => generateSignupRegistrationOptions('Researcher'),
      register: (credential: RegistrationResponseJSON) =>
        signupWithPasskey({ username: 'Researcher', credential }),
    },
    {
      name: 'a switch to passkey mode',
      start: generateRegistrationOptions,
      register: (credential: RegistrationResponseJSON) =>
        switchToPasskeyMode({ currentPassword: 'fixture', credential }),
    },
  ];

  it.each(paths)(
    'refuses $name on an authenticator that skipped user verification',
    async ({ start, register }) => {
      const challenge = await challengeFrom(start);
      const result = await register(attestation(challenge, USER_PRESENT));
      expect(formatActionError(result.error)).toBe(
        'This passkey cannot verify your identity. Choose a passkey that confirms who you are with a PIN, fingerprint, or face.',
      );
      expect(createCredential).not.toHaveBeenCalled();
      expect(createUser).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it.each(paths)(
    'registers $name once the authenticator verified the user',
    async ({ start, register }) => {
      const challenge = await challengeFrom(start);
      const result = await register(
        attestation(challenge, USER_PRESENT | USER_VERIFIED),
      );
      expect(formatActionError(result.error)).toBeNull();
    },
  );
});
