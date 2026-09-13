import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

import { readManagedAnchorStoreEnvironment } from './observability-anchor-runtime-config.mjs';
import { createDynamoAnchorStore } from './observability-dynamodb-anchor-store.mjs';

export async function enrollManagedAnchor(
  env = process.env,
  clientFactory = (region) => new DynamoDBClient({ region }),
) {
  try {
    const configuration = readManagedAnchorStoreEnvironment(env);
    const enrolled = await createDynamoAnchorStore({
      accountIdentitySha256: configuration.accountIdentitySha256,
      client: clientFactory(configuration.region),
      tableName: configuration.tableName,
    }).enroll();
    if (!enrolled) throw new Error();
    return 'ANCHOR_ENROLLED';
  } catch {
    throw new Error('ANCHOR_ENROLLMENT_FAILED');
  }
}

if (import.meta.main) {
  try {
    process.stdout.write(`${await enrollManagedAnchor()}\n`);
  } catch {
    process.stderr.write('ANCHOR_ENROLLMENT_FAILED\n');
    process.exitCode = 1;
  }
}
