import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { qualificationDockerArguments } from './studio-local-docker-wrapper.mjs';

test('appends qualification overlay after explicit Compose files', () => {
  assert.deepEqual(
    qualificationDockerArguments(
      ['compose', '--env-file', '/private/env', '-f', '/base.yml', 'config'],
      { composeFile: '/ignored.yml', overlay: '/qualification.yml' },
    ),
    [
      'compose',
      '--env-file',
      '/private/env',
      '-f',
      '/base.yml',
      '-f',
      '/qualification.yml',
      'config',
    ],
  );
});

test('materializes COMPOSE_FILE before overlay so no base service disappears', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'studio-compose-wrapper-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const base = join(root, 'base.yml');
  const registry = join(root, 'registry.yml');
  const overlay = join(root, 'qualification.yml');
  writeFileSync(
    base,
    'services:\n  studio:\n    image: example.invalid/studio\n',
  );
  writeFileSync(
    registry,
    'services:\n  registry:\n    image: example.invalid/registry\n',
  );
  writeFileSync(
    overlay,
    'services:\n  studio:\n    environment:\n      QUALIFICATION: "true"\n',
  );
  const composeFile = [base, registry].join(':');
  const rewritten = qualificationDockerArguments(['compose', 'config'], {
    composeFile,
    overlay,
  });
  assert.deepEqual(rewritten, [
    'compose',
    '-f',
    base,
    '-f',
    registry,
    '-f',
    overlay,
    'config',
  ]);
  const rendered = execFileSync('docker', rewritten, {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, COMPOSE_FILE: '' },
    timeout: 30_000,
  });
  assert.match(rendered, /studio:/);
  assert.match(rendered, /registry:/);
  assert.match(rendered, /QUALIFICATION: "true"/);
});

test('refuses an implicit default file because adding an overlay would hide it', () => {
  assert.throws(
    () =>
      qualificationDockerArguments(['compose', 'config'], {
        composeFile: '',
        overlay: '/qualification.yml',
      }),
    /explicit files or COMPOSE_FILE/,
  );
});
