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

const listAll = async (
  client: S3Client,
  bucket: string,
  prefix: string,
  pageSize: number | undefined,
  abortSignal: AbortSignal,
) => {
  const listed: { key: string; lastModified: Date | undefined }[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: pageSize,
      }),
      { abortSignal },
    );
    for (const object of page.Contents ?? []) {
      if (object.Key !== undefined) {
        listed.push({ key: object.Key, lastModified: object.LastModified });
      }
    }
    token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
  } while (token !== undefined);
  return listed;
};

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
    read: (key, abortSignal) =>
      client
        .send(new GetObjectCommand({ Bucket: env.bucket, Key: key }), {
          abortSignal,
        })
        .then((found) => ({
          body: found.Body?.transformToWebStream(),
          size: found.ContentLength,
          mediaType: found.ContentType,
        })),
    remove: (key, abortSignal) =>
      client.send(new DeleteObjectCommand({ Bucket: env.bucket, Key: key }), {
        abortSignal,
      }),
    list: (prefix, abortSignal) =>
      listAll(client, env.bucket, prefix, options.listPageSize, abortSignal),
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
