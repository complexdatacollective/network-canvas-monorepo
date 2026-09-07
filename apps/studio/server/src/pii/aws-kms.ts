import { DecryptCommand, KMSClient } from '@aws-sdk/client-kms';
import { z } from 'zod';

import { KeyConfigurationError, type RootKeyLoader } from './keys.ts';

const DEADLINE_MS = 5_000;
const referenceName = /^STUDIO_ENCRYPTION_ROOT_[A-Z0-9_]{1,100}$/;
const keyArn =
  /^arn:aws:kms:([a-z]{2}(?:-[a-z]+)+-\d):\d{12}:key\/(?:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}|mrk-[a-f0-9]{32})$/;
const settingsSchema = z.strictObject({
  keyArn: z.string().regex(keyArn),
  deployment: z.string().regex(/^[a-z][a-z0-9-]{0,62}$/),
  credentials: z.strictObject({
    accessKeyId: z.string().regex(/^[A-Z0-9]{16,128}$/),
    secretAccessKey: z.string().min(1).max(256).regex(/^\S+$/),
    sessionToken: z.string().min(1).max(16_384).regex(/^\S+$/).optional(),
  }),
  encryptedRoots: z
    .record(z.string().regex(referenceName), z.string().min(4).max(8192))
    .refine(
      (roots) =>
        Object.keys(roots).length > 0 && Object.keys(roots).length <= 32,
    ),
});

/** KMS context is authenticated, public metadata: never put participant data here. */
export function kmsRootEncryptionContext(
  deployment: string,
  reference: string,
) {
  if (
    !/^[a-z][a-z0-9-]{0,62}$/.test(deployment) ||
    !referenceName.test(reference)
  )
    throw new KeyConfigurationError();
  return {
    'studio-deployment': deployment,
    'studio-root-reference': reference,
    'studio-purpose': 'root-key.v1',
  };
}

/**
 * Loads wrapped 32-byte roots through the existing encryption boundary. The
 * fixed AWS endpoint and explicit credentials never use ambient profiles,
 * metadata services, S3 credentials, or endpoint environment overrides. Works
 * in either deployment mode; only the operator's configuration selects it.
 */
export function createAwsKmsRootKeyLoader(input: unknown): RootKeyLoader {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) throw new KeyConfigurationError();
  const settings = parsed.data;
  const region = keyArn.exec(settings.keyArn)?.[1];
  if (!region) throw new KeyConfigurationError();
  const ciphertexts = new Map<string, Buffer>();
  for (const [reference, encoded] of Object.entries(settings.encryptedRoots)) {
    const ciphertext = Buffer.from(encoded, 'base64');
    if (
      ciphertext.length < 1 ||
      ciphertext.length > 6144 ||
      ciphertext.toString('base64') !== encoded
    )
      throw new KeyConfigurationError();
    ciphertexts.set(reference, ciphertext);
  }
  return async (reference) => {
    const ciphertext = ciphertexts.get(reference);
    if (!ciphertext) throw new KeyConfigurationError();
    let client: KMSClient | undefined;
    let timer: NodeJS.Timeout | undefined;
    const abort = new AbortController();
    try {
      client = new KMSClient({
        region,
        endpoint: `https://kms.${region}.amazonaws.com`,
        ignoreConfiguredEndpointUrls: true,
        useFipsEndpoint: false,
        useDualstackEndpoint: false,
        credentials: settings.credentials,
        // SDK "auto" defaults discover instance metadata even with explicit
        // credentials. The custody client also carries no ambient app/trace
        // context from another AWS service sharing this process.
        defaultsMode: 'standard',
        retryMode: 'standard',
        defaultUserAgentProvider: async () => [['studio-kms', '1']],
        userAgentAppId: 'studio-kms',
        maxAttempts: 1,
        requestHandler: {
          connectionTimeout: 2_000,
          requestTimeout: DEADLINE_MS,
          throwOnRequestTimeout: true,
        },
      });
      client.middlewareStack.remove('recursionDetectionMiddleware');
      const response = client
        .send(
          new DecryptCommand({
            KeyId: settings.keyArn,
            CiphertextBlob: ciphertext,
            EncryptionAlgorithm: 'SYMMETRIC_DEFAULT',
            EncryptionContext: kmsRootEncryptionContext(
              settings.deployment,
              reference,
            ),
          }),
          { abortSignal: abort.signal },
        )
        .then((result) => {
          try {
            if (
              abort.signal.aborted ||
              result.KeyId !== settings.keyArn ||
              result.EncryptionAlgorithm !== 'SYMMETRIC_DEFAULT' ||
              !(result.Plaintext instanceof Uint8Array) ||
              result.Plaintext.byteLength !== 32 ||
              result.CiphertextForRecipient !== undefined
            )
              throw new KeyConfigurationError();
            return Buffer.from(result.Plaintext);
          } finally {
            // Also clear late responses after the absolute deadline has won.
            result.Plaintext?.fill(0);
          }
        });
      return await Promise.race([
        response,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            abort.abort();
            reject(new KeyConfigurationError());
          }, DEADLINE_MS);
        }),
      ]);
    } catch {
      throw new KeyConfigurationError();
    } finally {
      clearTimeout(timer);
      client?.destroy();
    }
  };
}
