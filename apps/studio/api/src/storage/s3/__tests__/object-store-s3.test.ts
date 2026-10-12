import { randomBytes } from 'node:crypto';

import { readEnv } from '../../../env.ts';
import type { S3Env } from '../../../env/resolve.ts';
import {
  type ContractSubject,
  objectStoreContract,
  reachable,
  unavailable,
} from '../../__tests__/contract.ts';
import { ObjectStoreS3 } from '../object-store-s3.ts';

// Garage from the dev stack, through the S3 values `.env.development` carries
// (`pnpm dev:object-stores` starts it and creates the bucket).

async function subject(): Promise<ContractSubject | undefined> {
  const objectStore = readEnv().objectStore;
  if (objectStore?.provider !== 's3') {
    return unavailable('.env.development configures no S3 object store');
  }
  const store = ObjectStoreS3.make(objectStore.s3);
  if (!(await reachable(store))) {
    return unavailable(`no S3 store answers at ${objectStore.s3.endpoint}`);
  }
  return {
    store,
    missing: ObjectStoreS3.make({
      ...objectStore.s3,
      bucket: `studio-missing-${randomBytes(4).toString('hex')}`,
    }),
    paged: ObjectStoreS3.make(objectStore.s3, { listPageSize: 1 }),
  };
}

const unreachable: S3Env = {
  endpoint: 'http://127.0.0.1:1',
  region: 'us-east-1',
  bucket: 'studio-test',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
};

objectStoreContract('S3', {
  subject: await subject(),
  storeAt: (origin) => ObjectStoreS3.make({ ...unreachable, endpoint: origin }),
});
