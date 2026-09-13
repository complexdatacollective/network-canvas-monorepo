import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { test } from 'vitest';
import { parse } from 'yaml';

const deployment = new URL(
  '../../apps/template-registry/deployment/',
  import.meta.url,
);

test('Registry Compose overlay parses with unique mapping keys', () => {
  const compose = parse(
    readFileSync(new URL('compose.yml', deployment), 'utf8'),
  );
  assert.ok(compose.services['registry-backup-verify']);
  assert.ok(compose.services.registry);
});

test('Registry object policy permits version cleanup only within the artifact store', () => {
  const policy = JSON.parse(
    readFileSync(new URL('minio-policy.json', deployment), 'utf8'),
  );
  for (const [action, resource] of [
    ['s3:ListBucketVersions', 'arn:aws:s3:::registry'],
    ['s3:DeleteObjectVersion', 'arn:aws:s3:::registry/template-artifacts/*'],
  ]) {
    assert.ok(
      policy.Statement.some(
        (statement) =>
          statement.Effect === 'Allow' &&
          statement.Action.includes(action) &&
          statement.Resource.includes(resource),
      ),
      `${action} must be granted to the cleanup worker`,
    );
  }
  for (const statement of policy.Statement) {
    assert.ok(!statement.Action.includes('s3:*'));
    assert.ok(
      statement.Resource.every(
        (resource) =>
          resource === 'arn:aws:s3:::registry' ||
          resource === 'arn:aws:s3:::registry/template-artifacts/*',
      ),
    );
  }
});
