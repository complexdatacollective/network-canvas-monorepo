import { Effect, Layer } from 'effect';

import { Environment } from '../env.ts';
import type { ObjectStoreEnv } from '../env/resolve.ts';
import { ObjectStoreAzureBlob } from './azure-blob/object-store-azure-blob.ts';
import { ObjectStore } from './object-store.ts';
import { ObjectStoreS3 } from './s3/object-store-s3.ts';

/**
 * The configured provider's implementation, chosen once from the resolved
 * environment (#2077) — never per request.
 */
export function objectStoreFor(
  env: ObjectStoreEnv | undefined,
): ObjectStore['Service'] {
  switch (env?.provider) {
    case 's3':
      return ObjectStoreS3.make(env.s3);
    case 'azure-blob':
      return ObjectStoreAzureBlob.make(env.azureBlob);
    default:
      return ObjectStore.absent;
  }
}

export const ObjectStoreLive: Layer.Layer<ObjectStore, never, Environment> =
  Layer.effect(ObjectStore)(
    Effect.map(Environment, (env) => objectStoreFor(env.objectStore)),
  );
