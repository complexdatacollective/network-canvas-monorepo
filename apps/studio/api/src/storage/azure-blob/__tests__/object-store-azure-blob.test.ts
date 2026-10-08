import { randomBytes } from 'node:crypto';

import { BlobServiceClient } from '@azure/storage-blob';
import { afterAll, describe, expect, it } from 'vitest';

import {
  DEV,
  DEV_AZURITE_CONNECTION_STRING,
} from '../../../env/development.ts';
import {
  type ContractSubject,
  objectStoreContract,
  reachable,
  unavailable,
} from '../../__tests__/contract.ts';
import {
  isNotFound,
  ObjectStoreAzureBlob,
} from '../object-store-azure-blob.ts';

// Azurite from the dev stack (`pnpm dev:object-stores` starts it). Each run
// creates its own container and removes it afterwards, since Azurite keeps
// nothing between restarts and Studio itself never creates one.

const service = BlobServiceClient.fromConnectionString(
  DEV_AZURITE_CONNECTION_STRING,
);
const suffix = randomBytes(4).toString('hex');
const container = service.getContainerClient(`studio-contract-${suffix}`);

const storeFor = (name: string, listPageSize?: number) =>
  ObjectStoreAzureBlob.make(
    {
      container: name,
      auth: {
        kind: 'connection-string',
        connectionString: DEV_AZURITE_CONNECTION_STRING,
      },
    },
    listPageSize === undefined ? {} : { listPageSize },
  );

async function subject(): Promise<ContractSubject | undefined> {
  // Aborted at the deadline, so an Azurite that accepts and never answers
  // leaves no request holding the run open.
  const created = await container
    .createIfNotExists({ abortSignal: AbortSignal.timeout(3000) })
    .then(
      () => true,
      () => false,
    );
  const store = storeFor(container.containerName);
  if (!created || !(await reachable(store))) {
    return unavailable(`no Azurite answers on port ${DEV.azuritePort}`);
  }
  afterAll(async () => {
    await container.deleteIfExists();
  });
  return {
    store,
    missing: storeFor(`studio-missing-${suffix}`),
    paged: storeFor(container.containerName, 1),
  };
}

const available = await subject();

objectStoreContract('Azure Blob', {
  subject: available,
  storeAt: (origin) =>
    ObjectStoreAzureBlob.make({
      container: 'studio-test',
      auth: {
        kind: 'connection-string',
        connectionString: `DefaultEndpointsProtocol=http;AccountName=${DEV.azuriteAccount};AccountKey=${DEV.azuriteAccountKey};BlobEndpoint=${origin}/${DEV.azuriteAccount};`,
      },
    }),
});

// The contract cannot see this: a `put` whose `stat` mistakes a missing
// container for a missing blob still fails, at the write that follows. So the
// predicate is held to the errors Azurite actually returns, HEAD and GET alike.
describe.skipIf(available === undefined)('isNotFound', () => {
  const rejection = (request: Promise<unknown>) =>
    request.then(
      () => expect.fail('the request succeeded'),
      (error: unknown) => error,
    );
  const absentBlob = container.getBlobClient('assets/absent');
  const inMissingContainer = service
    .getContainerClient(`studio-missing-${suffix}`)
    .getBlobClient('assets/absent');

  it('is a missing blob, from a HEAD or a GET', async () => {
    expect(isNotFound(await rejection(absentBlob.getProperties()))).toBe(true);
    expect(isNotFound(await rejection(absentBlob.download()))).toBe(true);
  });

  it('is not a missing container, from a HEAD or a GET', async () => {
    expect(
      isNotFound(await rejection(inMissingContainer.getProperties())),
    ).toBe(false);
    expect(isNotFound(await rejection(inMissingContainer.download()))).toBe(
      false,
    );
  });
});
