import { Readable } from 'node:stream';

import { DefaultAzureCredential } from '@azure/identity';
import {
  BlobServiceClient,
  type ContainerClient,
  RestError,
  type StoragePipelineOptions,
} from '@azure/storage-blob';

import type { AzureBlobEnv } from '../../env/resolve.ts';
import {
  type BackendOptions,
  fromBackend,
  type ObjectStore,
} from '../object-store.ts';

// The Azure Blob Storage implementation of the object-store port (#2077), for
// institutions whose cloud is Azure, which has no S3 API. The only module that
// imports the Azure SDKs.
//
// On Azure it authenticates as the host's managed identity through
// `DefaultAzureCredential`, which needs the Storage Blob Data Contributor role
// on the container and no account key. A connection string is the fallback
// for development (Azurite) and for hosts outside Azure.
//
// It has no `copy`. A server-side copy authenticates its source separately
// from the request, and the SDK documents only Shared Key (a connection
// string) for a source in the same account, not a managed identity's token,
// so promotion reads the staged blob and writes the asset instead.

const PIPELINE: StoragePipelineOptions = {
  // The S3 client's default attempt count, so neither provider holds a
  // request open for longer than the other before reporting it failed.
  retryOptions: { maxTries: 3 },
};

/**
 * A missing blob, and not a missing container: a `get` from a container that
 * is not there is a misconfiguration to report, as S3's `NoSuchBucket` is,
 * rather than an asset that was never uploaded. The service's code is read
 * from `details.errorCode` (the `x-ms-error-code` header) because a HEAD
 * response has no body, so `RestError.code` is unset for every `stat`.
 */
export function isNotFound(error: unknown): boolean {
  if (!(error instanceof RestError)) return false;
  const details = error.details;
  return (
    typeof details === 'object' &&
    details !== null &&
    'errorCode' in details &&
    details.errorCode === 'BlobNotFound'
  );
}

function containerClient(env: AzureBlobEnv): ContainerClient {
  const service =
    env.auth.kind === 'connection-string'
      ? BlobServiceClient.fromConnectionString(
          env.auth.connectionString,
          PIPELINE,
        )
      : new BlobServiceClient(
          env.auth.accountUrl,
          new DefaultAzureCredential(
            env.auth.clientId === undefined
              ? {}
              : { managedIdentityClientId: env.auth.clientId },
          ),
          PIPELINE,
        );
  return service.getContainerClient(env.container);
}

function make(
  env: AzureBlobEnv,
  options: BackendOptions = {},
): ObjectStore['Service'] {
  const container = containerClient(env);

  return fromBackend({
    stat: (key, abortSignal) =>
      container
        .getBlockBlobClient(key)
        .getProperties({ abortSignal })
        .then((found) => ({
          size: found.contentLength,
          mediaType: found.contentType,
        })),
    write: (key, bytes, mediaType, abortSignal) =>
      container.getBlockBlobClient(key).uploadData(bytes, {
        blobHTTPHeaders: { blobContentType: mediaType },
        abortSignal,
      }),
    read: (key, abortSignal) =>
      container
        .getBlockBlobClient(key)
        .download(0, undefined, { abortSignal })
        .then((found) => {
          const body = found.readableStreamBody;
          return {
            body:
              body === undefined
                ? undefined
                : Readable.toWeb(
                    body instanceof Readable ? body : Readable.from(body),
                  ),
            size: found.contentLength,
            mediaType: found.contentType,
          };
        }),
    remove: (key, abortSignal) =>
      container.getBlockBlobClient(key).deleteIfExists({ abortSignal }),
    list: async (prefix, abortSignal) => {
      const listed: { key: string; lastModified: Date | undefined }[] = [];
      const pages = container
        .listBlobsFlat({ prefix, abortSignal })
        .byPage({ maxPageSize: options.listPageSize });
      for await (const page of pages) {
        for (const blob of page.segment.blobItems) {
          listed.push({
            key: blob.name,
            lastModified: blob.properties.lastModified,
          });
        }
      }
      return listed;
    },
    probe: (abortSignal) => container.getProperties({ abortSignal }),
    isNotFound,
  });
}

export const ObjectStoreAzureBlob = { make };
