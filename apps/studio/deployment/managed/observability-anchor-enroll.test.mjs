import assert from 'node:assert/strict';
import test from 'node:test';

import { enrollManagedAnchor } from './observability-anchor-enroll.mjs';

function environment() {
  return {
    AWS_REGION: 'us-east-1',
    STUDIO_ANCHOR_ACCOUNT_IDENTITY_SHA256: 'a'.repeat(64),
    STUDIO_ANCHOR_TABLE_NAME: 'studio-anchor-test',
  };
}

test('operator enrollment uses only the fixed region, account partition, and table', async () => {
  let configuration;
  let command;
  assert.equal(
    await enrollManagedAnchor(environment(), (value) => {
      configuration = value;
      return { send: async (item) => void (command = item) };
    }),
    'ANCHOR_ENROLLED',
  );
  assert.deepEqual(configuration, {
    region: 'us-east-1',
    ignoreConfiguredEndpointUrls: true,
  });
  assert.equal(command.constructor.name, 'PutItemCommand');
  assert.equal(command.input.TableName, 'studio-anchor-test');
  assert.equal(command.input.Item.account.S, `ACCOUNT#${'a'.repeat(64)}`);
});

test('repeated enrollment fails with one fixed error', async () => {
  await assert.rejects(
    () =>
      enrollManagedAnchor(environment(), () => ({
        send: async () => {
          throw Object.assign(new Error('private provider detail'), {
            name: 'ConditionalCheckFailedException',
          });
        },
      })),
    { message: 'ANCHOR_ENROLLMENT_FAILED' },
  );
});
