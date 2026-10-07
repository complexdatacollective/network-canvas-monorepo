import { createHash } from 'node:crypto';

import {
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Context, Effect, Layer, Option, Schema } from 'effect';

import { Environment, type S3Env } from '../env.ts';

const KEY_PREFIX = 'assets/';

export type StoredAsset = {
  hash: string;
  size: number;
  mediaType: string;
};

export type StoredObject = {
  readonly body: ReadableStream<Uint8Array>;
  readonly mediaType: string;
  readonly size: number | undefined;
};

export class ObjectStoreError extends Schema.TaggedError<ObjectStoreError>()(
  'ObjectStoreError',
  {
    operation: Schema.Literals(['put', 'get', 'head']),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return this.cause instanceof Error
      ? this.cause.message
      : String(this.cause);
  }
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'NoSuchKey' || error.name === 'NotFound')
  );
}

export class ObjectStore extends Context.Service<
  ObjectStore,
  {
    readonly configured: boolean;
    readonly put: (
      bytes: Uint8Array,
      mediaType: string,
    ) => Effect.Effect<StoredAsset, ObjectStoreError>;
    readonly get: (
      hash: string,
    ) => Effect.Effect<Option.Option<StoredObject>, ObjectStoreError>;
    readonly head: Effect.Effect<void, ObjectStoreError>;
  }
>()('@studio/ObjectStore') {
  static readonly make = (env: S3Env): ObjectStore['Service'] => {
    const client = new S3Client({
      endpoint: env.endpoint,
      region: env.region,
      credentials: {
        accessKeyId: env.accessKeyId,
        secretAccessKey: env.secretAccessKey,
      },
      forcePathStyle: true,
    });

    const request = <A>(
      operation: ObjectStoreError['operation'],
      send: (abortSignal: AbortSignal) => Promise<A>,
    ): Effect.Effect<A, ObjectStoreError> =>
      Effect.tryPromise({
        try: send,
        catch: (cause) => new ObjectStoreError({ operation, cause }),
      });

    return ObjectStore.of({
      configured: true,
      put: Effect.fnUntraced(function* (bytes: Uint8Array, mediaType: string) {
        const hash = createHash('sha256').update(bytes).digest('hex');
        const key = `${KEY_PREFIX}${hash}`;
        // Re-uploading identical bytes with a different media type must not
        // rewrite the object's metadata: cached copies live for a year.
        const existing = yield* request('put', (abortSignal) =>
          client
            .send(new HeadObjectCommand({ Bucket: env.bucket, Key: key }), {
              abortSignal,
            })
            .then(
              (found) => found,
              (error: unknown) =>
                isNotFound(error) ? undefined : Promise.reject(error),
            ),
        );
        if (existing !== undefined) {
          return {
            hash,
            size: existing.ContentLength ?? bytes.byteLength,
            mediaType: existing.ContentType ?? mediaType,
          };
        }
        yield* request('put', (abortSignal) =>
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
        );
        return { hash, size: bytes.byteLength, mediaType };
      }),
      get: (hash) =>
        Effect.map(
          request('get', (abortSignal) =>
            client
              .send(
                new GetObjectCommand({
                  Bucket: env.bucket,
                  Key: `${KEY_PREFIX}${hash}`,
                }),
                { abortSignal },
              )
              .then(
                (found) => found,
                (error: unknown) =>
                  isNotFound(error) ? undefined : Promise.reject(error),
              ),
          ),
          (response) =>
            response?.Body === undefined
              ? Option.none()
              : Option.some({
                  body: response.Body.transformToWebStream(),
                  mediaType: response.ContentType ?? 'application/octet-stream',
                  size: response.ContentLength,
                }),
        ),
      head: Effect.asVoid(
        request('head', (abortSignal) =>
          client.send(new HeadBucketCommand({ Bucket: env.bucket }), {
            abortSignal,
          }),
        ),
      ),
    });
  };

  static readonly absent: ObjectStore['Service'] = ObjectStore.of({
    configured: false,
    put: () => Effect.die(new Error('no object store is configured')),
    get: () => Effect.die(new Error('no object store is configured')),
    head: Effect.die(new Error('no object store is configured')),
  });

  static readonly layer: Layer.Layer<ObjectStore, never, Environment> =
    Layer.effect(ObjectStore)(
      Effect.map(Environment, (env) =>
        env.s3 === undefined ? ObjectStore.absent : ObjectStore.make(env.s3),
      ),
    );
}
