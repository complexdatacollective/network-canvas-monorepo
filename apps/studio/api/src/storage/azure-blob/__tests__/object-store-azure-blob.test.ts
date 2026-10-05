import { randomBytes } from 'node:crypto';

import { BlobServiceClient } from '@azure/storage-blob';
import { afterAll } from 'vitest';

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
import { ObjectStoreAzureBlob } from '../object-store-azure-blob.ts';

// Azurite from the dev stack (`pnpm dev:object-stores` starts it). Each run
// creates its own container and removes it afterwards, since Azurite keeps
// nothing between restarts and Studio itself never creates one.

const service = BlobServiceClient.fromConnectionString(
  DEV_AZURITE_CONNECTION_STRING,
);
const suffix = randomBytes(4).toString('hex');
const container = service.getContainerClient(`studio-contract-${suffix}`);

const storeFor = (name: string) =>
  ObjectStoreAzureBlob.make({
    container: name,
    auth: {
      kind: 'connection-string',
      connectionString: DEV_AZURITE_CONNECTION_STRING,
    },
  });

async function subject(): Promise<ContractSubject | undefined> {
  const created = await Promise.race([
    container.createIfNotExists().then(
      () => true,
      () => false,
    ),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), 3000)),
  ]);
  const store = storeFor(container.containerName);
  if (!created || !(await reachable(store))) {
    return unavailable(`no Azurite answers on port ${DEV.azuritePort}`);
  }
  afterAll(async () => {
    await container.deleteIfExists();
  });
  return { store, missing: storeFor(`studio-missing-${suffix}`) };
}

objectStoreContract('Azure Blob', {
  subject: await subject(),
  storeAt: (origin) =>
    ObjectStoreAzureBlob.make({
      container: 'studio-test',
      auth: {
        kind: 'connection-string',
        connectionString: `DefaultEndpointsProtocol=http;AccountName=${DEV.azuriteAccount};AccountKey=${DEV.azuriteAccountKey};BlobEndpoint=${origin}/${DEV.azuriteAccount};`,
      },
    }),
});
