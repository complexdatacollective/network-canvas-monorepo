import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
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
import { buildMultiPlatformCycloneDx } from './studio-image-evidence.mjs';
import {
  prepareStudioImages,
  publishStudioImageTags,
} from './studio-image-preparation.mjs';
import { releasedDistribution } from './test-support/studio-release.mjs';

const workspace = new URL('..', import.meta.url).pathname;

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'studio-image-preparation-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = join(directory, 'commands.jsonl');
  const tool = join(directory, 'tool');
  const tags = join(directory, 'tags.json');
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
      `const tagsFile = ${JSON.stringify(tags)};\n` +
      'const tags = fs.existsSync(tagsFile) ? JSON.parse(fs.readFileSync(tagsFile)) : {};\n' +
      "if (args[0] === 'digest') { if (!tags[args[1]]) process.exit(1); process.stdout.write(tags[args[1]] + '\\n'); }\n" +
      "if (args[0] === 'buildx' || (args[0] === 'index' && args[1] === 'filter')) { const tag = args[args.indexOf('--tag') + 1]; tags[tag] = 'sha256:' + 'a'.repeat(64); fs.writeFileSync(tagsFile, JSON.stringify(tags)); }\n" +
      "if (args[0] === 'copy') { const source = args[1]; tags[args[2]] = source.slice(source.lastIndexOf('@') + 1); fs.writeFileSync(tagsFile, JSON.stringify(tags)); }\n" +
      "if (args.includes('--output')) {\n" +
      "  const name = args[args.indexOf('--source-name') + 1];\n" +
      "  const version = args[args.indexOf('--source-version') + 1];\n" +
      "  process.stdout.write(JSON.stringify({bomFormat:'CycloneDX',specVersion:'1.6',metadata:{component:{type:'container','bom-ref':'opaque-syft-id',name,version}},components:[{type:'library',name:args[args.indexOf('--platform') + 1]}]}));\n" +
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
    probe: async ({ reference }) => {
      if (!existsSync(tags)) return null;
      return JSON.parse(readFileSync(tags, 'utf8'))[reference] ?? null;
    },
    run: command,
  };
}

function sbom(image) {
  const reports = new Map(
    Object.entries(image.configurations).map(([platform, configuration]) => [
      platform,
      Buffer.from(
        JSON.stringify({
          bomFormat: 'CycloneDX',
          specVersion: '1.6',
          metadata: {
            component: {
              'type': 'container',
              'bom-ref': 'opaque-syft-id',
              'name': `${image.reference}#${platform}`,
              'version': configuration,
            },
          },
        }),
      ),
    ]),
  );
  return buildMultiPlatformCycloneDx({
    image: image.reference,
    configurations: image.configurations,
    reports,
  });
}

function authenticatedPriorRelease(gate) {
  const prior = releasedDistribution().value;
  prior.components.studio = gate.eligibility.components.studio.source;
  prior.components.registry = gate.eligibility.components.registry.source;
  const sboms = new Map();
  for (const name of Object.keys(IMAGE_REPOSITORIES)) {
    const bytes = sbom(prior.images[name]);
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
      probe: f.probe,
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
  for (const bytes of result.sboms.values()) {
    const aggregate = JSON.parse(bytes);
    assert.deepEqual(
      new Set(
        aggregate.components.map((component) => {
          const encoded = component.properties.find((property) =>
            property.name.endsWith('syft-report-base64'),
          ).value;
          return JSON.parse(Buffer.from(encoded, 'base64')).components[0].name;
        }),
      ),
      new Set(['linux/amd64', 'linux/arm64']),
    );
  }
  const commands = readFileSync(f.log, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.equal(commands.filter((record) => record[0] === 'buildx').length, 3);
  assert.equal(
    commands.filter((record) => record[0] === 'index' && record[1] === 'filter')
      .length,
    3,
  );
  for (const record of commands.filter(
    (candidate) => candidate[0] === 'buildx',
  ))
    assert.ok(
      record.includes('linux/amd64,linux/arm64') &&
        record.includes('--provenance=false') &&
        record.includes('--push'),
    );
  assert.ok(
    commands.some(
      (record) =>
        record[0] === 'index' &&
        record[1] === 'filter' &&
        /postgres:18\.6-alpine@sha256:/.test(record[2]),
    ),
  );
  assert.equal(commands.filter((record) => record[0] === 'digest').length, 6);
  assert.equal(
    commands.filter((record) => record.includes('--output')).length,
    12,
  );
  assert.deepEqual(
    new Set(
      commands
        .filter((record) => record.includes('--output'))
        .map((record) => record[record.indexOf('--platform') + 1]),
    ),
    new Set(['linux/amd64', 'linux/arm64']),
  );
  assert.ok(
    commands
      .filter((record) => record.includes('--tag'))
      .every((record) =>
        new RegExp(`:preparation-${f.candidate.commit}-[a-f0-9]{32}$`).test(
          record[record.indexOf('--tag') + 1],
        ),
      ),
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
      probe: f.probe,
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
    8,
  );
});

test('publishes canonical tags only from authenticated image evidence and resumes exact matches', async (t) => {
  const f = fixture(t);
  const evidence = await prepareStudioImages(
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
  const options = {
    docker: f.tool,
    crane: f.tool,
    probe: f.probe,
    run: f.run,
    timeoutMs: 2_000,
  };
  const firstCommands = readFileSync(f.log, 'utf8').trim().split('\n').length;
  await publishStudioImageTags({ candidate: f.candidate, evidence }, options);
  const publishedCommands = readFileSync(f.log, 'utf8')
    .trim()
    .split('\n')
    .slice(firstCommands)
    .map(JSON.parse);
  assert.equal(
    publishedCommands.filter(([action]) => action === 'copy').length,
    6,
  );
  const beforeResume = readFileSync(f.log, 'utf8').trim().split('\n').length;
  await publishStudioImageTags({ candidate: f.candidate, evidence }, options);
  const resumed = readFileSync(f.log, 'utf8')
    .trim()
    .split('\n')
    .slice(beforeResume)
    .map(JSON.parse);
  assert.equal(resumed.filter(([action]) => action === 'copy').length, 0);
});

for (const { label, failure, pattern } of [
  {
    label: 'forbidden registry response',
    failure: new Error('registry status 403'),
    pattern: /403/,
  },
  {
    label: 'registry timeout',
    failure: new Error('registry timeout'),
    pattern: /timeout/,
  },
  {
    label: 'malformed retained digest',
    failure: 'not-a-digest',
    pattern: /authenticated evidence/,
  },
])
  test(`${label} cannot authorize a canonical image write after earlier conclusive probes`, async (t) => {
    const f = fixture(t);
    const evidence = await prepareStudioImages(
      { candidate: f.candidate, gate: f.gate },
      {
        docker: f.tool,
        crane: f.tool,
        syft: f.tool,
        acquire: f.acquire,
        run: f.run,
      },
    );
    const before = readFileSync(f.log, 'utf8').trim().split('\n').length;
    let probes = 0;
    const probe = async () => {
      probes += 1;
      if (probes === 1) return 'sha256:' + 'a'.repeat(64);
      if (probes === 2) return null;
      if (failure instanceof Error) throw failure;
      return failure;
    };
    await assert.rejects(
      () =>
        publishStudioImageTags(
          { candidate: f.candidate, evidence },
          {
            crane: f.tool,
            probe,
            run: f.run,
          },
        ),
      pattern,
    );
    assert.equal(probes, 3);
    const commands = readFileSync(f.log, 'utf8')
      .trim()
      .split('\n')
      .slice(before)
      .map(JSON.parse);
    assert.equal(commands.filter(([action]) => action === 'copy').length, 0);
  });

test('refuses a substituted preexisting canonical tag before any canonical write', async (t) => {
  const f = fixture(t);
  const evidence = await prepareStudioImages(
    { candidate: f.candidate, gate: f.gate },
    {
      docker: f.tool,
      crane: f.tool,
      syft: f.tool,
      acquire: f.acquire,
      run: f.run,
    },
  );
  const tags = JSON.parse(readFileSync(join(f.directory, 'tags.json'), 'utf8'));
  tags[`${IMAGE_REPOSITORIES.studio}:sha-${f.candidate.commit}`] =
    `sha256:${'9'.repeat(64)}`;
  writeFileSync(join(f.directory, 'tags.json'), JSON.stringify(tags));
  const firstCommands = readFileSync(f.log, 'utf8').trim().split('\n').length;
  await assert.rejects(
    () =>
      publishStudioImageTags(
        { candidate: f.candidate, evidence },
        {
          crane: f.tool,
          probe: f.probe,
          run: f.run,
        },
      ),
    /different authenticated evidence/,
  );
  const retryCommands = readFileSync(f.log, 'utf8')
    .trim()
    .split('\n')
    .slice(firstCommands)
    .map(JSON.parse);
  assert.equal(
    retryCommands.filter((record) => record[0] === 'copy').length,
    0,
  );
});

test('refuses a canonical tag that appears after preflight without overwriting it', async (t) => {
  const f = fixture(t);
  const evidence = await prepareStudioImages(
    { candidate: f.candidate, gate: f.gate },
    {
      docker: f.tool,
      crane: f.tool,
      syft: f.tool,
      acquire: f.acquire,
      run: f.run,
    },
  );
  const before = readFileSync(f.log, 'utf8').trim().split('\n').length;
  let probes = 0;
  await assert.rejects(
    () =>
      publishStudioImageTags(
        { candidate: f.candidate, evidence },
        {
          crane: f.tool,
          run: f.run,
          probe: async () => {
            probes += 1;
            return probes === Object.keys(IMAGE_REPOSITORIES).length + 1
              ? `sha256:${'9'.repeat(64)}`
              : null;
          },
        },
      ),
    /changed before publication/,
  );
  const commands = readFileSync(f.log, 'utf8')
    .trim()
    .split('\n')
    .slice(before)
    .map(JSON.parse);
  assert.equal(commands.filter(([action]) => action === 'copy').length, 0);
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
      probe: f.probe,
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
          probe: f.probe,
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
          probe: f.probe,
          run: f.run,
        },
      ),
    (error) =>
      error.message === 'Studio image preparation command failed.' &&
      !error.message.includes('credential'),
  );
});
