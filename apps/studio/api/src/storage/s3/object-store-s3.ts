import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import type { S3Env } from '../../env/resolve.ts';
import {
  type BackendOptions,
  fromBackend,
  type ObjectStore,
} from '../object-store.ts';

// The S3 implementation of the object-store port (#2077), for every store
// that speaks the S3 API: Garage, R2, MinIO and AWS S3. The only module that
// imports the S3 SDK.

function isNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'NoSuchKey' || error.name === 'NotFound')
  );
}

function make(
  env: S3Env,
  options: BackendOptions = {},
): ObjectStore['Service'] {
  const client = new S3Client({
    endpoint: env.endpoint,
    region: env.region,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
    forcePathStyle: true,
  });

  return fromBackend({
    stat: (key, abortSignal) =>
      client
        .send(new HeadObjectCommand({ Bucket: env.bucket, Key: key }), {
          abortSignal,
        })
        .then((found) => ({
          size: found.ContentLength,
          mediaType: found.ContentType,
        })),
    write: (key, bytes, mediaType, abortSignal) =>
      client.send(
        new PutObjectCommand({
          Bucket: env.bucket,
          Key: key,
          Body: bytes,
          ContentType: mediaType,
          ContentLength: bytes.byteLength,
        }),
        { abortSignal },
      ),
    read: (key, abortSignal, range) =>
      client
        .send(
          new GetObjectCommand({
            Bucket: env.bucket,
            Key: key,
            ...(range === undefined
              ? {}
              : { Range: `bytes=${String(range.start)}-${String(range.end)}` }),
          }),
          { abortSignal },
        )
        .then((found) => ({
          body: found.Body?.transformToWebStream(),
          size: found.ContentLength,
          mediaType: found.ContentType,
        })),
    remove: (key, abortSignal) =>
      client.send(new DeleteObjectCommand({ Bucket: env.bucket, Key: key }), {
        abortSignal,
      }),
    list: async (prefix, cursor, abortSignal) => {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: env.bucket,
          Prefix: prefix,
          ContinuationToken: cursor,
          MaxKeys: options.listPageSize,
        }),
        { abortSignal },
      );
      return {
        objects: (page.Contents ?? []).flatMap((object) =>
          object.Key === undefined
            ? []
            : [{ key: object.Key, lastModified: object.LastModified }],
        ),
        next:
          page.IsTruncated === true ? page.NextContinuationToken : undefined,
      };
    },
    // `CopySource` is a URL path, so each segment of the key is encoded; the
    // keys Studio copies are hex and a UUID, which encoding leaves as they are.
    copy: (from, to, abortSignal) =>
      client.send(
        new CopyObjectCommand({
          Bucket: env.bucket,
          Key: to,
          CopySource: `${env.bucket}/${from.split('/').map(encodeURIComponent).join('/')}`,
        }),
        { abortSignal },
      ),
    probe: (abortSignal) =>
      client.send(new HeadBucketCommand({ Bucket: env.bucket }), {
        abortSignal,
      }),
    isNotFound,
  });
}

export const ObjectStoreS3 = { make };
