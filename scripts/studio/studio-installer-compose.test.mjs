import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { test } from 'vitest';
import { parse } from 'yaml';

function postgresSettings(path, service) {
  const compose = parse(readFileSync(path, 'utf8'));
  const command = compose.services[service].command;
  assert.ok(Array.isArray(command));
  return new Map(
    command.flatMap((value, index) =>
      value === '-c' && typeof command[index + 1] === 'string'
        ? [command[index + 1].split('=', 2)]
        : [],
    ),
  );
}

test('enables enough prepared transactions for Studio migration coordination', () => {
  assert.equal(
    postgresSettings('apps/studio/docker-compose.yml', 'postgres').get(
      'max_prepared_transactions',
    ),
    '16',
  );
});

test('enables enough prepared transactions for Registry migration coordination', () => {
  assert.equal(
    postgresSettings(
      'apps/template-registry/deployment/compose.yml',
      'registry-postgres',
    ).get('max_prepared_transactions'),
    '16',
  );
});

test('renders the offline Registry recovery entrypoint with explicit private database transport', () => {
  const base = parse(
    readFileSync('apps/template-registry/deployment/compose.yml', 'utf8'),
  );
  const recovery = parse(
    readFileSync('apps/template-registry/deployment/recovery.yml', 'utf8'),
  );
  const service = base.services['registry-recover-verify'];
  const environment = {
    ...service.environment,
    ...recovery.services['registry-recover-verify'].environment,
  };

  assert.deepEqual(service.entrypoint, ['node', 'dist/recover.js']);
  assert.equal(environment.REGISTRY_DATABASE_INSECURE_PRIVATE_NETWORK, 'true');
  for (const name of [
    'REGISTRY_RECOVERY_DATABASE_URL',
    'REGISTRY_BACKUP_DATABASE_URL',
  ])
    assert.match(environment[name], /@registry-postgres:5432\/registry$/);
});
