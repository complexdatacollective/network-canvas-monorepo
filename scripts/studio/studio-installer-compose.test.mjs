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
