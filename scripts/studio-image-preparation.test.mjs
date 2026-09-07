import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  IMAGE_REPOSITORIES,
  sha256,
} from '../apps/studio/deployment/installer/release.mjs';
import { command } from '../apps/studio/deployment/installer/verify.mjs';
import { prepareStudioImages } from './studio-image-preparation.mjs';
import { releasedDistribution } from './test-support/studio-release.mjs';

const workspace = new URL('..', import.meta.url).pathname;

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'studio-image-preparation-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = join(directory, 'commands.jsonl');
  const tool = join(directory, 'tool');
  const repository = join(directory, 'repository');
  mkdirSync(join(repository, 'apps/studio'), { recursive: true });
  writeFileSync(
    join(repository, 'apps/studio/docker-compose.yml'),
    readFileSync(join(workspace, 'apps/studio/docker-compose.yml')),
  );
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repository });
  execFileSync('git', ['config', 'user.name', 'Joshua Melville'], {
    cwd: repository,
  });
  execFileSync('git', ['config', 'user.email', 'joshua@northwestern.edu'], {
    cwd: repository,
  });
  execFileSync('git', ['add', '.'], { cwd: repository });
  execFileSync('git', ['commit', '-qm', 'Image preparation fixture'], {
    cwd: repository,
  });
  const source = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
  }).trim();
  writeFileSync(
    tool,
    '#!/usr/bin/env node\n' +
      "const fs = require('node:fs');\n" +
      'const args = process.argv.slice(2);\n' +
      "fs.appendFileSync('" +
      log +
      "', JSON.stringify(args) + '\\n');\n" +
      "if (args[0] === 'digest') process.stdout.write('sha256:' + 'a'.repeat(64) + '\\n');\n" +
      "if (args.includes('--output')) {\n" +
      '  const image = args[0];\n' +
      "  process.stdout.write(JSON.stringify({bomFormat:'CycloneDX',specVersion:'1.6',metadata:{component:{type:'container','bom-ref':image,hashes:[{alg:'SHA-256',content:image.split('@sha256:')[1]}]}}}));\n" +
      '}\n',
  );
  chmodSync(tool, 0o755);
  const candidate = {
    commit: source,
    cwd: repository,
    read: (path) => readFileSync(join(repository, path), 'utf8'),
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
    run: command,
  };
}

function authenticatedPriorRelease(gate) {
  const prior = releasedDistribution().value;
  prior.components.studio = gate.eligibility.components.studio.source;
  prior.components.registry = gate.eligibility.components.registry.source;
  const sboms = new Map();
  for (const name of Object.keys(IMAGE_REPOSITORIES)) {
    const image = prior.images[name].reference;
    const bytes = Buffer.from(
      JSON.stringify({
        bomFormat: 'CycloneDX',
        specVersion: '1.6',
        metadata: {
          component: {
            'type': 'container',
            'bom-ref': image,
            'hashes': [
              {
                alg: 'SHA-256',
                content: image.split('@sha256:')[1],
              },
            ],
          },
        },
      }),
    );
    prior.evidence.sboms[name].sha256 = sha256(bytes);
    sboms.set(name, bytes);
  }
  return { releaseBytes: Buffer.from(JSON.stringify(prior)), sboms, prior };
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
  assert.deepEqual(
    Object.keys(result.images).toSorted(),
    Object.keys(IMAGE_REPOSITORIES).toSorted(),
  );
  assert.equal(result.sboms.size, 6);
  const commands = readFileSync(f.log, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.equal(commands.filter((record) => record[0] === 'buildx').length, 3);
  assert.equal(commands.filter((record) => record[0] === 'copy').length, 3);
  for (const record of commands.filter(
    (candidate) => candidate[0] === 'buildx',
  ))
    assert.ok(
      record.includes('linux/amd64,linux/arm64') && record.includes('--push'),
    );
  assert.ok(
    commands.some(
      (record) =>
        record[0] === 'copy' && /postgres:18\.6-alpine@sha256:/.test(record[1]),
    ),
  );
  assert.equal(commands.filter((record) => record[0] === 'digest').length, 6);
  assert.equal(
    commands.filter((record) => record.includes('--output')).length,
    6,
  );
});

test('reuses authenticated component images and their bound SBOMs while preparing every other image', async (t) => {
  const f = fixture(t);
  const authenticated = authenticatedPriorRelease(f.gate);
  const result = await prepareStudioImages(
    {
      candidate: f.candidate,
      gate: f.gate,
      authenticatedPriorRelease: authenticated,
    },
    {
      docker: f.tool,
      crane: f.tool,
      syft: f.tool,
      acquire: f.acquire,
      run: f.run,
      timeoutMs: 2_000,
    },
  );
  assert.deepEqual(result.reused, ['registry', 'studio']);
  for (const name of result.reused) {
    assert.deepEqual(result.images[name], authenticated.prior.images[name]);
    assert.deepEqual(result.sboms.get(name), authenticated.sboms.get(name));
  }
  const commands = readFileSync(f.log, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.deepEqual(
    commands
      .filter((record) => record[0] === 'buildx')
      .map((record) => record[record.indexOf('--file') + 1]),
    ['apps/studio/deployment/minio.Dockerfile'],
  );
  assert.equal(commands.filter((record) => record[0] === 'digest').length, 4);
  assert.equal(
    commands.filter((record) => record.includes('--output')).length,
    4,
  );
});

test('build context contains only committed candidate bytes, excluding ignored and later working-tree changes', async (t) => {
  const f = fixture(t);
  const repository = join(f.directory, 'mutated-repository');
  const deployment = join(repository, 'apps/studio/deployment');
  mkdirSync(deployment, { recursive: true });
  writeFileSync(join(repository, '.gitignore'), '*.pem\n');
  writeFileSync(join(deployment, 'marker.txt'), 'committed\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repository });
  execFileSync('git', ['config', 'user.name', 'Joshua Melville'], {
    cwd: repository,
  });
  execFileSync('git', ['config', 'user.email', 'joshua@northwestern.edu'], {
    cwd: repository,
  });
  execFileSync('git', ['add', '.'], { cwd: repository });
  execFileSync('git', ['commit', '-qm', 'Committed image source'], {
    cwd: repository,
  });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
  }).trim();
  writeFileSync(join(deployment, 'marker.txt'), 'working tree mutation\n');
  writeFileSync(join(deployment, 'private.pem'), 'ignored private bytes\n');
  const candidate = { ...f.candidate, cwd: repository, commit };
  const gate = {
    ...f.gate,
    eligibility: { ...f.gate.eligibility, source: commit },
  };
  let builds = 0;
  const run = (executable, args, options) => {
    if (executable === f.tool && args[0] === 'buildx') {
      builds += 1;
      assert.notEqual(options.cwd, repository);
      assert.equal(
        readFileSync(
          join(options.cwd, 'apps/studio/deployment/marker.txt'),
          'utf8',
        ),
        'committed\n',
      );
      assert.throws(() =>
        readFileSync(join(options.cwd, 'apps/studio/deployment/private.pem')),
      );
    }
    return command(executable, args, options);
  };
  await prepareStudioImages(
    { candidate, gate },
    {
      docker: f.tool,
      crane: f.tool,
      syft: f.tool,
      acquire: f.acquire,
      run,
      timeoutMs: 2_000,
    },
  );
  assert.equal(builds, 3);
});

test('refuses a candidate that differs from its admitted gate before invoking image tools', async (t) => {
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
