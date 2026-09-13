import assert from 'node:assert/strict';
import test from 'node:test';

import { createDynamoAnchorStore } from './observability-dynamodb-anchor-store.mjs';

const account = 'a'.repeat(64);

test('Dynamo enrollment is create-once and initialization is one transaction', async () => {
  const commands = [];
  const store = createDynamoAnchorStore({
    accountIdentitySha256: account,
    client: { send: async (command) => void commands.push(command) },
    tableName: 'studio-anchor-test',
  });
  assert.equal(await store.enroll(), true);
  assert.equal(await store.initialize({ format: 2 }), true);
  assert.equal(commands[0].constructor.name, 'PutItemCommand');
  assert.equal(commands[1].constructor.name, 'TransactWriteItemsCommand');
  assert.equal(commands[1].input.TransactItems.length, 2);
  assert.equal(
    commands[1].input.TransactItems[0].Put.ConditionExpression,
    'attribute_not_exists(account)',
  );
  assert.match(
    commands[1].input.TransactItems[1].Update.ConditionExpression,
    /attribute_exists\(account\)/,
  );
  assert.match(
    commands[1].input.TransactItems[1].Update.ConditionExpression,
    /initialized = :false/,
  );
  assert.match(
    commands[1].input.TransactItems[1].Update.ConditionExpression,
    /lineageFormat = :format/,
  );
  assert.deepEqual(
    commands[1].input.TransactItems[1].Update.ExpressionAttributeValues[
      ':format'
    ],
    { N: '1' },
  );
});

test('Dynamo CAS compares exact previous checkpoint with an enrolled marker', async () => {
  let command;
  const store = createDynamoAnchorStore({
    accountIdentitySha256: account,
    client: { send: async (value) => void (command = value) },
    tableName: 'studio-anchor-test',
  });
  assert.equal(
    await store.compareAndSet({ sequence: 1 }, { sequence: 2 }),
    true,
  );
  assert.equal(command.constructor.name, 'TransactWriteItemsCommand');
  assert.equal(
    command.input.TransactItems[0].ConditionCheck.ConditionExpression,
    'lineageFormat = :format AND initialized = :true',
  );
  assert.equal(
    command.input.TransactItems[1].Update.ExpressionAttributeValues[':previous']
      .S,
    '{"sequence":1}',
  );
});

test('missing enrollment and initialized-state loss fail closed', async () => {
  for (const Responses of [
    [{}, {}],
    [{ Item: { initialized: { BOOL: true } } }, {}],
    [
      {
        Item: {
          initialized: { BOOL: false },
          lineageFormat: { N: '2' },
        },
      },
      {},
    ],
  ]) {
    const store = createDynamoAnchorStore({
      accountIdentitySha256: account,
      client: { send: async () => ({ Responses }) },
      tableName: 'studio-anchor-test',
    });
    await assert.rejects(() => store.read(), /DYNAMO_ANCHOR_/);
  }
});

test('conditional transaction races return conflict without exposing provider detail', async () => {
  const store = createDynamoAnchorStore({
    accountIdentitySha256: account,
    client: {
      send: async () => {
        throw Object.assign(new Error('private provider canary'), {
          CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
          name: 'TransactionCanceledException',
        });
      },
    },
    tableName: 'studio-anchor-test',
  });
  assert.equal(await store.initialize({}), false);
  assert.equal(await store.compareAndSet({}, {}), false);
});
