import {
  PutItemCommand,
  TransactGetItemsCommand,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';

const SHA256 = /^[a-f0-9]{64}$/;
const TABLE = /^[A-Za-z0-9_.-]{3,255}$/;

class DynamoAnchorStoreError extends Error {
  constructor(code = 'DYNAMO_ANCHOR_STORE_FAILED') {
    super(code);
    this.name = 'DynamoAnchorStoreError';
    this.code = code;
  }
}

const fail = (code) => {
  throw new DynamoAnchorStoreError(code);
};
const conditional = (error) =>
  error?.name === 'ConditionalCheckFailedException' ||
  (error?.name === 'TransactionCanceledException' &&
    error.CancellationReasons?.some(
      (reason) => reason?.Code === 'ConditionalCheckFailed',
    ));

/**
 * One fixed account partition. `enroll` is an operator provisioning action,
 * deliberately absent from the HTTP anchor service.
 */
export function createDynamoAnchorStore({
  accountIdentitySha256,
  client,
  tableName,
}) {
  if (
    !SHA256.test(accountIdentitySha256) ||
    !TABLE.test(tableName) ||
    !client ||
    typeof client.send !== 'function'
  )
    fail('DYNAMO_ANCHOR_INPUT_INVALID');
  const partition = { S: `ACCOUNT#${accountIdentitySha256}` };
  const key = (sort) => ({ account: partition, record: { S: sort } });
  const markerKey = key('ENROLLMENT');
  const stateKey = key('STATE');

  return Object.freeze({
    async enroll() {
      try {
        await client.send(
          new PutItemCommand({
            ConditionExpression: 'attribute_not_exists(account)',
            Item: {
              ...markerKey,
              initialized: { BOOL: false },
              lineageFormat: { N: '1' },
            },
            TableName: tableName,
          }),
        );
        return true;
      } catch (error) {
        if (conditional(error)) return false;
        return fail();
      }
    },

    async read() {
      try {
        const response = await client.send(
          new TransactGetItemsCommand({
            TransactItems: [markerKey, stateKey].map((Key) => ({
              Get: { Key, TableName: tableName },
            })),
          }),
        );
        const marker = response.Responses?.[0]?.Item;
        const state = response.Responses?.[1]?.Item;
        if (!marker) return fail('DYNAMO_ANCHOR_ENROLLMENT_MISSING');
        if (marker.initialized?.BOOL !== true) {
          if (state) return fail('DYNAMO_ANCHOR_STORE_FAILED');
          return null;
        }
        if (!state?.checkpoint?.S) return fail('DYNAMO_ANCHOR_STATE_MISSING');
        return JSON.parse(state.checkpoint.S);
      } catch (error) {
        if (error instanceof DynamoAnchorStoreError) throw error;
        return fail();
      }
    },

    async initialize(next) {
      try {
        await client.send(
          new TransactWriteItemsCommand({
            TransactItems: [
              {
                ConditionCheck: {
                  ConditionExpression:
                    'attribute_exists(account) AND initialized = :false',
                  ExpressionAttributeValues: { ':false': { BOOL: false } },
                  Key: markerKey,
                  TableName: tableName,
                },
              },
              {
                Put: {
                  ConditionExpression: 'attribute_not_exists(account)',
                  Item: {
                    ...stateKey,
                    checkpoint: { S: JSON.stringify(next) },
                  },
                  TableName: tableName,
                },
              },
              {
                Update: {
                  ConditionExpression: 'initialized = :false',
                  ExpressionAttributeValues: {
                    ':false': { BOOL: false },
                    ':true': { BOOL: true },
                  },
                  Key: markerKey,
                  TableName: tableName,
                  UpdateExpression: 'SET initialized = :true',
                },
              },
            ],
          }),
        );
        return true;
      } catch (error) {
        if (conditional(error)) return false;
        return fail();
      }
    },

    async compareAndSet(previous, next) {
      try {
        await client.send(
          new TransactWriteItemsCommand({
            TransactItems: [
              {
                ConditionCheck: {
                  ConditionExpression: 'initialized = :true',
                  ExpressionAttributeValues: { ':true': { BOOL: true } },
                  Key: markerKey,
                  TableName: tableName,
                },
              },
              {
                Update: {
                  ConditionExpression: 'checkpoint = :previous',
                  ExpressionAttributeValues: {
                    ':next': { S: JSON.stringify(next) },
                    ':previous': { S: JSON.stringify(previous) },
                  },
                  Key: stateKey,
                  TableName: tableName,
                  UpdateExpression: 'SET checkpoint = :next',
                },
              },
            ],
          }),
        );
        return true;
      } catch (error) {
        if (conditional(error)) return false;
        return fail();
      }
    },
  });
}
