import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';

import { managedAnchorDynamoClientConfiguration } from './observability-anchor-dynamodb-client.mjs';

const OVERRIDE_ENVIRONMENT_KEYS = [
  'AWS_CONFIG_FILE',
  'AWS_ENDPOINT_URL',
  'AWS_ENDPOINT_URL_DYNAMODB',
  'AWS_PROFILE',
];

function restoreEnvironment(previous) {
  for (const key of OVERRIDE_ENVIRONMENT_KEYS) {
    const value = previous.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test('the pinned SDK ignores service, global, and shared-profile endpoint overrides', async (t) => {
  const previous = new Map(
    OVERRIDE_ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
  );
  const directory = await mkdtemp(join(tmpdir(), 'anchor-aws-config-'));
  const configFile = join(directory, 'config');
  await writeFile(
    configFile,
    `[profile anchor-endpoint-test]
region = us-west-2
services = poisoned-services

[services poisoned-services]
dynamodb =
  endpoint_url = http://profile-override.invalid:8123
`,
    { mode: 0o600 },
  );
  const cases = [
    {
      name: 'service environment',
      environment: {
        AWS_ENDPOINT_URL_DYNAMODB: 'http://service-override.invalid:8123',
      },
    },
    {
      name: 'global environment',
      environment: { AWS_ENDPOINT_URL: 'http://global-override.invalid:8123' },
    },
    {
      name: 'shared profile',
      environment: {
        AWS_CONFIG_FILE: configFile,
        AWS_PROFILE: 'anchor-endpoint-test',
      },
    },
  ];
  assert.equal(cases.length, 3);
  try {
    for (const { name, environment } of cases) {
      await t.test(name, async () => {
        for (const key of OVERRIDE_ENVIRONMENT_KEYS) delete process.env[key];
        Object.assign(process.env, environment);
        let hostname;
        const requestHandler = {
          handle: async (request) => {
            hostname = request.hostname;
            return {
              response: {
                statusCode: 200,
                headers: {},
                body: Buffer.from('{"TableNames":[]}'),
              },
            };
          },
          destroy() {},
        };
        const client = new DynamoDBClient({
          ...managedAnchorDynamoClientConfiguration('us-east-1'),
          credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
          requestHandler,
        });
        try {
          await client.send(new ListTablesCommand({ Limit: 1 }));
        } finally {
          client.destroy();
        }
        assert.equal(
          hostname,
          'dynamodb.us-east-1.amazonaws.com',
          `${name} override must be ignored`,
        );
      });
    }
  } finally {
    restoreEnvironment(previous);
  }
});
