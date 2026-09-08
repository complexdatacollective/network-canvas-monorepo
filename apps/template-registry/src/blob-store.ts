import {
  DeleteObjectsCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectVersionsCommand,
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
  provider?: 's3' | 'r2';
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};
const r2Endpoint =
  /^https:\/\/[a-f0-9]{32}(?:\.(?:eu|us|fedramp))?\.r2\.cloudflarestorage\.com\/$/;
const objectKey = (hash: string) => {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new RegistryError('ARTIFACT_INVALID');
  return `template-artifacts/${hash}`;
};
const isAbsent = (error: unknown) =>
  error instanceof Error &&
  (error.name === 'NoSuchKey' || error.name === 'NotFound');
const versionPageSize = 1_000;

type ObjectVersion = { Key?: string; VersionId?: string };

async function deleteObjectVersions(
  client: S3Client,
  bucket: string,
  key: string,
  signal: AbortSignal,
): Promise<void> {
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  let foundVersion = false;
  let truncated = true;
  while (truncated) {
    const page = await client.send(
      new ListObjectVersionsCommand({
        Bucket: bucket,
        Prefix: key,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
        MaxKeys: versionPageSize,
      }),
      { abortSignal: signal },
    );
    const versions: ObjectVersion[] = [
      ...(page.Versions ?? []),
      ...(page.DeleteMarkers ?? []),
    ].filter((version) => version.Key === key);
    if (versions.length > 0) foundVersion = true;
    if (versions.some((version) => typeof version.VersionId !== 'string'))
      throw new Error('REGISTRY_STORAGE_VERSION_ID_MISSING');
    if (versions.length > 0) {
      const deleted = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: versions.map((version) => ({
              Key: key,
              VersionId: version.VersionId,
            })),
            Quiet: true,
          },
        }),
        { abortSignal: signal },
      );
      if ((deleted.Errors?.length ?? 0) > 0)
        throw new Error('REGISTRY_STORAGE_VERSION_DELETE_FAILED');
    }
    truncated = page.IsTruncated === true;
    if (!truncated) continue;
    if (!page.NextKeyMarker && !page.NextVersionIdMarker)
      throw new Error('REGISTRY_STORAGE_VERSION_PAGINATION_INVALID');
    keyMarker = page.NextKeyMarker;
    versionIdMarker = page.NextVersionIdMarker;
  }

  // An unversioned bucket has no version records. Only in that case is the
  // ordinary delete safe; on a versioned or suspended bucket every byte and
  // delete marker was removed by DeleteObjects above.
  if (!foundVersion)
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
      abortSignal: signal,
    });
}

/** The bucket remains private; every download passes the live moderation gate. */
export function createRegistryBlobStore(
  configuration: RegistryStorageConfiguration,
): RegistryBlobStore {
  const provider = configuration.provider ?? 's3';
  const endpoint = new URL(configuration.endpoint);
  if (
    provider === 'r2' &&
    (endpoint.protocol !== 'https:' ||
      endpoint.port !== '' ||
      !r2Endpoint.test(endpoint.toString()) ||
      configuration.region !== 'auto')
  )
    throw new Error('REGISTRY_R2_ENDPOINT_INVALID');
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
        const signal = AbortSignal.timeout(10_000);
        const key = objectKey(rawHash);
        if (provider === 'r2')
          await client.send(
            new DeleteObjectCommand({ Bucket: configuration.bucket, Key: key }),
            { abortSignal: signal },
          );
        else
          await deleteObjectVersions(client, configuration.bucket, key, signal);
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
