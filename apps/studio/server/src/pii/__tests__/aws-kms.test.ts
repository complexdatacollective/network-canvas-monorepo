import { inspect } from 'node:util';

import type * as AwsKms from '@aws-sdk/client-kms';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveEncryptionEnv } from '../../env/encryption.ts';
import {
  createAwsKmsRootKeyLoader,
  kmsRootEncryptionContext,
} from '../aws-kms.ts';
import { KeyConfigurationError, loadEncryptionKeys } from '../keys.ts';
import { configuration } from './fixtures.ts';

// Exercise the real AWS serializer, credential signing, endpoint resolution,
// response parser and retry middleware. Only its HTTP transport is replaced;
// this is deterministic SDK qualification, not a live AWS/account verdict.
const fixture = vi.hoisted(() => ({
  configurations: [] as unknown[],
  requests: [] as {
    hostname: string;
    protocol: string;
    headers: Record<string, string>;
    body: unknown;
  }[],
  payload: {} as Record<string, unknown>,
  statusCode: 200,
  stalled: false,
  destroyed: vi.fn(),
}));

vi.mock('@aws-sdk/client-kms', async (importOriginal) => {
  const original = await importOriginal<typeof AwsKms>();
  const { Readable } = await import('node:stream');
  return {
    ...original,
    KMSClient: class extends original.KMSClient {
      constructor(
        options: ConstructorParameters<typeof original.KMSClient>[0],
      ) {
        fixture.configurations.push(options);
        super({
          ...options,
          requestHandler: {
            handle: async (
              request: Parameters<
                AwsKms.KMSClient['config']['requestHandler']['handle']
              >[0],
            ) => {
              fixture.requests.push({
                hostname: request.hostname,
                protocol: request.protocol,
                headers: request.headers,
                body:
                  typeof request.body === 'string' ||
                  request.body instanceof Uint8Array
                    ? (JSON.parse(
                        typeof request.body === 'string'
                          ? request.body
                          : Buffer.from(request.body).toString('utf8'),
                      ) as unknown)
                    : request.body,
              });
              // Deliberately ignore abort to prove the outer absolute deadline.
              if (fixture.stalled) return new Promise<never>(() => undefined);
              return {
                response: {
                  statusCode: fixture.statusCode,
                  headers: { 'content-type': 'application/x-amz-json-1.1' },
                  body: Readable.from([JSON.stringify(fixture.payload)]),
                },
              };
            },
            destroy: fixture.destroyed,
          },
        });
      }
    },
  };
});

const arn =
  'arn:aws:kms:us-east-1:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab';
const reference = 'STUDIO_ENCRYPTION_ROOT_CURRENT';
const root = Buffer.alloc(32, 19);
const wrapped = Buffer.alloc(192, 37).toString('base64');
const settings = () => ({
  keyArn: arn,
  deployment: 'studio-staging',
  credentials: {
    accessKeyId: 'AKIA0000000000000000',
    secretAccessKey: 'kms-fixture-secret-only',
  },
  encryptedRoots: { [reference]: wrapped },
});

beforeEach(() => {
  fixture.configurations.length = 0;
  fixture.requests.length = 0;
  fixture.statusCode = 200;
  fixture.stalled = false;
  fixture.destroyed.mockClear();
  fixture.payload = {
    KeyId: arn,
    EncryptionAlgorithm: 'SYMMETRIC_DEFAULT',
    Plaintext: root.toString('base64'),
  };
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('AWS KMS wrapped root loader', () => {
  it.each(['self-hosted', 'managed'])(
    'loads the same adapter through the %s startup and offline environment boundary',
    async (deploymentMode) => {
      const config = configuration();
      config.roots = config.roots.map((item) => ({
        ...item,
        reference: `STUDIO_ENCRYPTION_ROOT_${item.reference}`,
      }));
      const source = {
        STUDIO_DEPLOYMENT_MODE: deploymentMode,
        STUDIO_ENCRYPTION_KEY_PROVIDER: 'aws-kms',
        STUDIO_ENCRYPTION_KEYSET: JSON.stringify(config),
        STUDIO_ENCRYPTION_KMS_KEY_ARN: arn,
        STUDIO_ENCRYPTION_KMS_DEPLOYMENT: 'studio-staging',
        STUDIO_ENCRYPTION_KMS_ACCESS_KEY_ID: settings().credentials.accessKeyId,
        STUDIO_ENCRYPTION_KMS_SECRET_ACCESS_KEY:
          settings().credentials.secretAccessKey,
        STUDIO_ENCRYPTION_ROOT_TEST_ROOT_ONE: wrapped,
        STUDIO_ENCRYPTION_ROOT_TEST_ROOT_TWO: wrapped,
      };
      const resolved = resolveEncryptionEnv(source);
      source.STUDIO_ENCRYPTION_ROOT_TEST_ROOT_ONE = 'changed';
      const keys = await loadEncryptionKeys(
        resolved.configuration,
        resolved.loadRootKey,
      );
      expect(keys.currentId('pii-enc')).toBe(config.pii.current);
      expect(
        keys.derive('pii-enc', config.pii.current, ['team', 'fixture'])
          .symmetricKeySize,
      ).toBe(32);
      expect(fixture.requests).toHaveLength(2);
      expect(fixture.requests.map(({ body }) => body)).toEqual(
        config.roots.map(({ reference: name }) =>
          expect.objectContaining({
            EncryptionContext: kmsRootEncryptionContext('studio-staging', name),
          }),
        ),
      );
    },
  );

  it('never falls back to public development roots or ambient AWS credentials for an explicit KMS selection', () => {
    const development = {
      devDefaults: true,
      db: { url: 'postgres://localhost/studio' },
    };
    for (const provider of ['aws-kms', 'unknown']) {
      expect(() =>
        resolveEncryptionEnv(
          { STUDIO_ENCRYPTION_KEY_PROVIDER: provider },
          development,
        ),
      ).toThrow(KeyConfigurationError);
    }
    const config = configuration();
    config.roots = config.roots.map((item) => ({
      ...item,
      reference: `STUDIO_ENCRYPTION_ROOT_${item.reference}`,
    }));
    expect(() =>
      resolveEncryptionEnv(
        {
          STUDIO_ENCRYPTION_KEY_PROVIDER: 'aws-kms',
          STUDIO_ENCRYPTION_KEYSET: JSON.stringify(config),
          STUDIO_ENCRYPTION_KMS_KEY_ARN: arn,
          STUDIO_ENCRYPTION_KMS_DEPLOYMENT: 'studio-staging',
          AWS_ACCESS_KEY_ID: settings().credentials.accessKeyId,
          AWS_SECRET_ACCESS_KEY: settings().credentials.secretAccessKey,
          STUDIO_ENCRYPTION_ROOT_TEST_ROOT_ONE: wrapped,
          STUDIO_ENCRYPTION_ROOT_TEST_ROOT_TWO: wrapped,
        },
        development,
      ),
    ).toThrow(KeyConfigurationError);
    expect(fixture.requests).toHaveLength(0);
    expect(fixture.configurations).toHaveLength(0);
  });

  it('signs an exact-key/context decrypt for the fixed endpoint with explicit credentials and releases its transport', async () => {
    vi.stubEnv('AWS_ENDPOINT_URL_KMS', 'http://untrusted.example.test');
    vi.stubEnv('AWS_ENDPOINT_URL', 'http://untrusted.example.test');
    vi.stubEnv('AWS_PROFILE', 'must-not-be-loaded');
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'UNRELATED_S3_IDENTITY');
    const load = createAwsKmsRootKeyLoader(settings());
    expect(await load(reference)).toEqual(root);
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0]).toMatchObject({
      hostname: 'kms.us-east-1.amazonaws.com',
      protocol: 'https:',
      body: {
        KeyId: arn,
        CiphertextBlob: wrapped,
        EncryptionAlgorithm: 'SYMMETRIC_DEFAULT',
        EncryptionContext: {
          'studio-deployment': 'studio-staging',
          'studio-root-reference': reference,
          'studio-purpose': 'root-key.v1',
        },
      },
    });
    expect(fixture.requests[0]?.headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIA0000000000000000\/\d{8}\/us-east-1\/kms\/aws4_request/,
    );
    expect(fixture.configurations).toEqual([
      expect.objectContaining({
        defaultsMode: 'standard',
        retryMode: 'standard',
        userAgentAppId: 'studio-kms',
        maxAttempts: 1,
        requestHandler: {
          connectionTimeout: 2000,
          requestTimeout: 5000,
          throwOnRequestTimeout: true,
        },
      }),
    ]);
    expect(fixture.requests[0]?.headers['user-agent']).toMatch(
      /^studio-kms\/1 m\/[A-Za-z0-9,]+ app\/studio-kms$/,
    );
    expect(fixture.destroyed).toHaveBeenCalledExactlyOnceWith();
    expect(JSON.stringify(fixture.requests)).not.toContain(
      root.toString('base64'),
    );
  });

  it('snapshots operator settings, supports temporary credentials and keeps root-reference contexts distinct', async () => {
    const second = 'STUDIO_ENCRYPTION_ROOT_HISTORICAL';
    const input = {
      ...settings(),
      credentials: {
        ...settings().credentials,
        sessionToken: 'temporary-token-fixture',
      },
      encryptedRoots: { [reference]: wrapped, [second]: wrapped },
    };
    const load = createAwsKmsRootKeyLoader(input);
    input.deployment = 'mutated';
    input.credentials.secretAccessKey = 'mutated';
    input.encryptedRoots[reference] = 'bad';
    expect(await load(reference)).toEqual(root);
    expect(await load(second)).toEqual(root);
    expect(fixture.requests).toHaveLength(2);
    expect(fixture.requests.map(({ body }) => body)).toEqual(
      [reference, second].map((name) =>
        expect.objectContaining({
          EncryptionContext: kmsRootEncryptionContext('studio-staging', name),
        }),
      ),
    );
    expect(fixture.requests[1]?.headers['x-amz-security-token']).toBe(
      'temporary-token-fixture',
    );
    expect(fixture.destroyed).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['empty key', { keyArn: '' }],
    [
      'mutable alias',
      {
        keyArn: arn.replace(
          'key/1234abcd-12ab-34cd-56ef-1234567890ab',
          'alias/studio',
        ),
      },
    ],
    [
      'endpoint-shaped ARN',
      { keyArn: arn.replace('us-east-1', 'us-east-1.example.test') },
    ],
    ['missing explicit credentials', { credentials: undefined }],
    ['empty root inventory', { encryptedRoots: {} }],
    [
      'unknown reference shape',
      { encryptedRoots: { UNRELATED_SECRET: wrapped } },
    ],
    [
      'one malformed root among valid roots',
      {
        encryptedRoots: {
          [reference]: wrapped,
          STUDIO_ENCRYPTION_ROOT_BAD: 'broken',
        },
      },
    ],
    [
      'oversized ciphertext',
      {
        encryptedRoots: { [reference]: Buffer.alloc(6145).toString('base64') },
      },
    ],
    [
      'noncanonical ciphertext',
      { encryptedRoots: { [reference]: `${wrapped}\n` } },
    ],
    ['secret-bearing context', { deployment: 'participant@example.test' }],
  ])('rejects %s before creating an SDK client', (_name, patch) => {
    expect(() =>
      createAwsKmsRootKeyLoader({ ...settings(), ...patch }),
    ).toThrow(KeyConfigurationError);
    expect(fixture.configurations).toHaveLength(0);
    expect(fixture.requests).toHaveLength(0);
  });

  it('refuses an unconfigured reference without contacting the provider', async () => {
    await expect(
      createAwsKmsRootKeyLoader(settings())('STUDIO_ENCRYPTION_ROOT_ABSENT'),
    ).rejects.toThrow(KeyConfigurationError);
    expect(fixture.requests).toHaveLength(0);
    expect(fixture.configurations).toHaveLength(0);
  });

  it.each([
    ['wrong key', { KeyId: arn.replace('111122223333', '444455556666') }],
    ['missing key', { KeyId: undefined }],
    ['wrong algorithm', { EncryptionAlgorithm: 'RSAES_OAEP_SHA_256' }],
    ['missing algorithm', { EncryptionAlgorithm: undefined }],
    ['short root', { Plaintext: Buffer.alloc(31).toString('base64') }],
    ['long root', { Plaintext: Buffer.alloc(33).toString('base64') }],
    ['absent root', { Plaintext: undefined }],
    ['unexpected recipient ciphertext', { CiphertextForRecipient: 'AAAA' }],
  ])(
    'rejects a provider response with %s and closes the client',
    async (_name, patch) => {
      fixture.payload = { ...fixture.payload, ...patch };
      await expect(
        createAwsKmsRootKeyLoader(settings())(reference),
      ).rejects.toThrow(KeyConfigurationError);
      expect(fixture.requests).toHaveLength(1);
      expect(fixture.destroyed).toHaveBeenCalledExactlyOnceWith();
    },
  );

  it.each([403, 429, 500, 503])(
    'contains HTTP %i provider errors and never retries a startup load',
    async (statusCode) => {
      fixture.statusCode = statusCode;
      const canary = 'synthetic-provider-secret-canary';
      fixture.payload = { __type: 'AccessDeniedException', message: canary };
      const error: unknown = await createAwsKmsRootKeyLoader(settings())(
        reference,
      ).catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(KeyConfigurationError);
      expect(error).not.toHaveProperty('cause');
      expect(inspect(error)).not.toContain(canary);
      expect(fixture.requests).toHaveLength(1);
      expect(fixture.destroyed).toHaveBeenCalledExactlyOnceWith();
    },
  );

  it('bounds even a transport which ignores abort by the absolute deadline', async () => {
    vi.useFakeTimers();
    fixture.stalled = true;
    let observed: unknown;
    void createAwsKmsRootKeyLoader(settings())(reference).then(
      (value) => {
        observed = value;
        return value;
      },
      (error: unknown) => {
        observed = error;
        return error;
      },
    );
    await vi.waitFor(() => expect(fixture.requests).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(5000);
    expect(observed).toBeInstanceOf(KeyConfigurationError);
    expect(fixture.destroyed).toHaveBeenCalledExactlyOnceWith();
  });
});
