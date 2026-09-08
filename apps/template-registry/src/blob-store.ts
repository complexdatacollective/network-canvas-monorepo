import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import {
  TEMPLATE_ARTIFACT_LIMITS,
  templateBytesHash,
} from '@codaco/studio-sync/template-exchange';

import { readBytesCapped } from './body.ts';
import { RegistryError } from './problems.ts';

export type RegistryBlobStore = {
  put(rawHash: string, bytes: Uint8Array): Promise<void>;
  get(rawHash: string): Promise<Uint8Array | null>;
  delete(rawHash: string): Promise<void>;
  scan(cursor?: string): Promise<{
    objects: { rawHash: string; modifiedAt: Date }[];
    nextCursor?: string;
  }>;
  ready(): Promise<void>;
  close(): void;
};

export type RegistryStorageConfiguration = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};
const objectKey = (hash: string) => {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new RegistryError('ARTIFACT_INVALID');
  return `template-artifacts/${hash}`;
};
const isAbsent = (error: unknown) =>
  error instanceof Error &&
  (error.name === 'NoSuchKey' || error.name === 'NotFound');

/** The bucket remains private; every download passes the live moderation gate. */
export function createRegistryBlobStore(
  configuration: RegistryStorageConfiguration,
): RegistryBlobStore {
  const client = new S3Client({
    endpoint: configuration.endpoint,
    region: configuration.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
    },
    maxAttempts: 2,
  });
  const get = async (rawHash: string): Promise<Uint8Array | null> => {
    try {
      const signal = AbortSignal.timeout(10_000);
      const result = await client.send(
        new GetObjectCommand({
          Bucket: configuration.bucket,
          Key: objectKey(rawHash),
        }),
        { abortSignal: signal },
      );
      if (!result.Body) throw new RegistryError('SERVICE_UNAVAILABLE');
      const bytes = await readBytesCapped(
        result.Body.transformToWebStream(),
        TEMPLATE_ARTIFACT_LIMITS.archiveBytes,
        signal,
      );
      if (templateBytesHash(bytes) !== rawHash)
        throw new RegistryError('SERVICE_UNAVAILABLE');
      return bytes;
    } catch (error) {
      if (isAbsent(error)) return null;
      throw new RegistryError('SERVICE_UNAVAILABLE');
    }
  };
  return {
    get,
    async put(rawHash, bytes) {
      if (
        bytes.byteLength > TEMPLATE_ARTIFACT_LIMITS.archiveBytes ||
        templateBytesHash(bytes) !== rawHash
      )
        throw new RegistryError('ARTIFACT_INVALID');
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: configuration.bucket,
            Key: objectKey(rawHash),
            Body: bytes,
            ContentLength: bytes.byteLength,
            ContentType: 'application/octet-stream',
            IfNoneMatch: '*',
          }),
          { abortSignal: AbortSignal.timeout(10_000) },
        );
      } catch (error) {
        if (!(error instanceof Error && error.name === 'PreconditionFailed'))
          throw new RegistryError('SERVICE_UNAVAILABLE');
        const existing = await get(rawHash);
        if (!existing || existing.byteLength !== bytes.byteLength)
          throw new RegistryError('SERVICE_UNAVAILABLE');
      }
    },
    async delete(rawHash) {
      try {
        await client.send(
          new DeleteObjectCommand({
            Bucket: configuration.bucket,
            Key: objectKey(rawHash),
          }),
          { abortSignal: AbortSignal.timeout(10_000) },
        );
      } catch {
        throw new RegistryError('SERVICE_UNAVAILABLE');
      }
    },
    async scan(cursor) {
      try {
        const result = await client.send(
          new ListObjectsV2Command({
            Bucket: configuration.bucket,
            Prefix: 'template-artifacts/',
            MaxKeys: 25,
            ContinuationToken: cursor,
          }),
          { abortSignal: AbortSignal.timeout(10_000) },
        );
        if (result.IsTruncated && !result.NextContinuationToken)
          throw new RegistryError('SERVICE_UNAVAILABLE');
        const objects: { rawHash: string; modifiedAt: Date }[] = [];
        for (const item of result.Contents ?? []) {
          const match = /^template-artifacts\/([0-9a-f]{64})$/.exec(
            item.Key ?? '',
          );
          if (
            match?.[1] &&
            item.LastModified &&
            Number.isFinite(item.LastModified.getTime())
          )
            objects.push({ rawHash: match[1], modifiedAt: item.LastModified });
        }
        return {
          objects,
          ...(result.IsTruncated
            ? { nextCursor: result.NextContinuationToken }
            : {}),
        };
      } catch {
        throw new RegistryError('SERVICE_UNAVAILABLE');
      }
    },
    async ready() {
      try {
        await client.send(
          new HeadBucketCommand({ Bucket: configuration.bucket }),
          { abortSignal: AbortSignal.timeout(3_000) },
        );
      } catch {
        throw new RegistryError('SERVICE_UNAVAILABLE');
      }
    },
    close() {
      client.destroy();
    },
  };
}
