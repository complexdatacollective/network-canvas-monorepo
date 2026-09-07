import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  IMAGE_REPOSITORIES,
  sha256,
} from '../apps/studio/deployment/installer/release.mjs';
import { command } from '../apps/studio/deployment/installer/verify.mjs';
import { prepareStudioImages } from './studio-image-preparation.mjs';

const cwd = new URL('..', import.meta.url).pathname;
const source = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd,
  encoding: 'utf8',
}).trim();

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'studio-image-preparation-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = join(directory, 'commands.jsonl');
  const tool = join(directory, 'tool');
  writeFileSync(
    tool,
    '#!/usr/bin/env node\n' +
      "const fs = require('node:fs');\n" +
      'const args = process.argv.slice(2);\n' +
      "fs.appendFileSync('" + log + "', JSON.stringify(args) + '\\n');\n" +
      "if (args[0] === 'digest') process.stdout.write('sha256:' + 'a'.repeat(64) + '\\n');\n" +
      "if (args.includes('--output')) {\n" +
      '  const image = args[0];\n' +
      "  process.stdout.write(JSON.stringify({bomFormat:'CycloneDX',specVersion:'1.6',metadata:{component:{type:'container','bom-ref':image,hashes:[{alg:'SHA-256',content:image.split('@sha256:')[1]}]}}}));\n" +
      '}\n',
  );
  chmodSync(tool, 0o755);
  const candidate = {
    commit: source,
    cwd,
    read: (path) => readFileSync(join(cwd, path), 'utf8'),
  };
  const gate = {
    eligibility: {
      status: 'ready',
      source,
      components: {
        studio: { source: sha256('studio') },
        registry: { source: sha256('registry') },
      },
    },
  };
  return {
    candidate,
    directory,
    gate,
    log,
    tool,
    acquire: async ({ name, reference }) => ({
      reference,
      configurations: {
        'linux/amd64': 'sha256:' + sha256(name + 'amd64'),
        'linux/arm64': 'sha256:' + sha256(name + 'arm64'),
      },
    }),
    run: (executable, args, options) => {
      if (executable === 'git' && args[0] === 'rev-parse') return source;
      if (executable === 'git' && args[0] === 'status') return '';
      return command(executable, args, options);
    },
  };
}

test('builds/copies immutable six-image inputs, then acquires digest evidence and CycloneDX bytes', async (t) => {
  const f = fixture(t);
  const result = await prepareStudioImages(
    { candidate: f.candidate, gate: f.gate },
    {
      docker: f.tool,
      crane: f.tool,
      syft: f.tool,
      acquire: f.acquire,
      run: f.run,
      timeoutMs: 2_000,
    },
  );
  assert.deepEqual(result.reused, []);
  assert.deepEqual(Object.keys(result.images).toSorted(), Object.keys(IMAGE_REPOSITORIES).toSorted());
  assert.equal(result.sboms.size, 6);
  const commands = readFileSync(f.log, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(commands.filter((args) => args[0] === 'buildx').length, 3);
  assert.equal(commands.filter((args) => args[0] === 'copy').length, 3);
  for (const args of commands.filter((args) => args[0] === 'buildx'))
    assert.ok(args.includes('linux/amd64,linux/arm64') && args.includes('--push'));
  assert.ok(commands.some((args) => args[0] === 'copy' && /postgres:18\.6-alpine@sha256:/.test(args[1])));
  assert.equal(commands.filter((args) => args[0] === 'digest').length, 6);
  assert.equal(commands.filter((args) => args.includes('--output')).length, 6);
});

test('refuses a candidate that differs from the checked-out reviewed source before invoking image tools', async (t) => {
  const f = fixture(t);
  await assert.rejects(
    () =>
      prepareStudioImages(
        { candidate: { ...f.candidate, commit: '0'.repeat(40) }, gate: f.gate },
        { docker: f.tool, crane: f.tool, syft: f.tool, acquire: f.acquire },
      ),
    /admitted source/,
  );
  assert.throws(() => readFileSync(f.log));
});

test('bounds a stalled local build command with a fixed error', async (t) => {
  const f = fixture(t);
  const stalled = join(f.directory, 'stalled');
  writeFileSync(stalled, '#!/usr/bin/env node\nsetInterval(() => {}, 1000);\n');
  chmodSync(stalled, 0o755);
  await assert.rejects(
    () =>
      prepareStudioImages(
        { candidate: f.candidate, gate: f.gate },
        {
          docker: stalled,
          crane: f.tool,
          syft: f.tool,
          acquire: f.acquire,
          run: f.run,
          timeoutMs: 100,
        },
      ),
    /preparation command failed/,
  );
});

test('redacts a nonzero local image command failure', async (t) => {
  const f = fixture(t);
  const failed = join(f.directory, 'failed');
  writeFileSync(
    failed,
    '#!/usr/bin/env node\nprocess.stderr.write("registry credential"); process.exit(2);\n',
  );
  chmodSync(failed, 0o755);
  await assert.rejects(
    () =>
      prepareStudioImages(
        { candidate: f.candidate, gate: f.gate },
        {
          docker: failed,
          crane: f.tool,
          syft: f.tool,
          acquire: f.acquire,
          run: f.run,
        },
      ),
    (error) =>
      error.message === 'Studio image preparation command failed.' &&
      !error.message.includes('credential'),
  );
});
