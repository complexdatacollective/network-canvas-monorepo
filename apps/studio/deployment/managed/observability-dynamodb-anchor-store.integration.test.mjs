import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import {
  CreateTableCommand,
  DeleteItemCommand,
  DeleteTableCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';

import { createDynamoAnchorStore } from './observability-dynamodb-anchor-store.mjs';

const endpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;
const local = endpoint
  ? (() => {
      const url = new URL(endpoint);
      return (
        url.protocol === 'http:' &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      );
    })()
  : false;

test(
  'DynamoDB Local preserves the account lineage under races and record loss',
  { skip: !endpoint },
  async (t) => {
    assert.equal(local, true, 'DYNAMODB_LOCAL_ENDPOINT must be loopback HTTP');
    const client = new DynamoDBClient({
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
      endpoint,
      region: 'local',
    });
    t.after(() => client.destroy());
    const tableName = `studio-anchor-${randomUUID()}`;
    await client.send(
      new CreateTableCommand({
        AttributeDefinitions: [
          { AttributeName: 'account', AttributeType: 'S' },
          { AttributeName: 'record', AttributeType: 'S' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [
          { AttributeName: 'account', KeyType: 'HASH' },
          { AttributeName: 'record', KeyType: 'RANGE' },
        ],
        TableName: tableName,
      }),
    );
    t.after(() =>
      client.send(new DeleteTableCommand({ TableName: tableName })),
    );
    const accountA = 'a'.repeat(64);
    const accountB = 'b'.repeat(64);
    const a = createDynamoAnchorStore({
      accountIdentitySha256: accountA,
      client,
      tableName,
    });
    const b = createDynamoAnchorStore({
      accountIdentitySha256: accountB,
      client,
      tableName,
    });
    const initial = { checkpoint: 0 };
    assert.equal(await a.enroll(), true);
    assert.equal(await a.enroll(), false);
    assert.equal(await a.read(), null);
    assert.equal(await a.initialize(initial), true);
    assert.equal(await a.initialize(initial), false);

    const results = await Promise.all([
      a.compareAndSet(initial, { checkpoint: 1 }),
      a.compareAndSet(initial, { checkpoint: 2 }),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(results.filter((result) => !result).length, 1);
    const winner = await a.read();
    assert.ok([1, 2].includes(winner.checkpoint));
    assert.equal(await a.compareAndSet(initial, { checkpoint: 3 }), false);

    assert.equal(await b.enroll(), true);
    assert.equal(await b.initialize({ checkpoint: 'isolated' }), true);
    assert.deepEqual(await b.read(), { checkpoint: 'isolated' });

    await client.send(
      new DeleteItemCommand({
        Key: {
          account: { S: `ACCOUNT#${accountA}` },
          record: { S: 'STATE' },
        },
        TableName: tableName,
      }),
    );
    await assert.rejects(() => a.read(), /DYNAMO_ANCHOR_STATE_MISSING/);
    assert.equal(await a.initialize(initial), false);
    assert.deepEqual(await b.read(), { checkpoint: 'isolated' });
  },
);
