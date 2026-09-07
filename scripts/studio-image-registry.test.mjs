import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
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
import { acquireImageEvidence } from './studio-image-registry.mjs';

const OCI_INDEX = 'application/vnd.oci.image.index.v1+json';
const OCI_MANIFEST = 'application/vnd.oci.image.manifest.v1+json';
const OCI_CONFIG = 'application/vnd.oci.image.config.v1+json';
const repository = IMAGE_REPOSITORIES.studio;
const digest = (bytes) => `sha256:${sha256(bytes)}`;

function descriptor(mediaType, bytes, platform) {
  return {
    mediaType,
    digest: digest(bytes),
    size: bytes.length,
    ...(platform ? { platform } : {}),
  };
}

function writeCrane(crane, log, replies) {
  writeFileSync(
    crane,
    String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const replies = JSON.parse(Buffer.from('${Buffer.from(JSON.stringify(replies)).toString('base64')}', 'base64'));
const key = process.argv.slice(2).join(' ');
fs.appendFileSync('${log}', JSON.stringify(process.argv.slice(2)) + '\n');
if (replies[key]) { process.stdout.write(Buffer.from(replies[key], 'base64')); } else { process.exit(2); }
`,
  );
  chmodSync(crane, 0o755);
}

function fixture(t, { extraPlatform = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'studio-registry-fixture-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const replies = {};
  const configurations = {};
  const manifests = ['amd64', 'arm64', ...(extraPlatform ? ['s390x'] : [])].map(
    (architecture) => {
      const config = Buffer.from(JSON.stringify({ architecture, os: 'linux' }));
      const configDescriptor = descriptor(OCI_CONFIG, config);
      replies[`blob ${repository}@${configDescriptor.digest}`] =
        config.toString('base64');
      const child = Buffer.from(
        JSON.stringify({
          mediaType: OCI_MANIFEST,
          schemaVersion: 2,
          config: configDescriptor,
        }),
      );
      const childDescriptor = descriptor(OCI_MANIFEST, child, {
        architecture,
        os: 'linux',
      });
      replies[`manifest ${repository}@${childDescriptor.digest}`] =
        child.toString('base64');
      configurations[`linux/${architecture}`] = configDescriptor.digest;
      return childDescriptor;
    },
  );
  const index = Buffer.from(
    JSON.stringify({ mediaType: OCI_INDEX, schemaVersion: 2, manifests }),
  );
  const reference = `${repository}@${digest(index)}`;
  replies[`manifest ${reference}`] = index.toString('base64');
  const log = join(directory, 'argv.log');
  const crane = join(directory, 'crane');
  writeCrane(crane, log, replies);
  return { configurations, crane, index, log, reference, replies, directory };
}

test('reads exact immutable crane bytes and derives the existing evidence contract', async (t) => {
  const f = fixture(t);
  const result = await acquireImageEvidence({
    name: 'studio',
    reference: f.reference,
    crane: f.crane,
    timeoutMs: 2_000,
  });
  assert.deepEqual(result, {
    reference: f.reference,
    configurations: f.configurations,
  });
  assert.deepEqual(
    readFileSync(f.log, 'utf8').trim().split('\n').map(JSON.parse),
    [
      ['manifest', f.reference],
      [
        'manifest',
        `${repository}@${f.index.length ? JSON.parse(f.index).manifests[0].digest : ''}`,
      ],
      ['blob', `${repository}@${f.configurations['linux/amd64']}`],
      ['manifest', `${repository}@${JSON.parse(f.index).manifests[1].digest}`],
      ['blob', `${repository}@${f.configurations['linux/arm64']}`],
    ],
  );
});

test('refuses a same-length mutated top-level manifest before child reads', async (t) => {
  const f = fixture(t);
  const key = `manifest ${f.reference}`;
  const changed = Buffer.from(f.replies[key], 'base64');
  changed[changed.length - 1] ^= 1;
  f.replies[key] = changed.toString('base64');
  writeCrane(f.crane, f.log, f.replies);
  await assert.rejects(
    () =>
      acquireImageEvidence({
        name: 'studio',
        reference: f.reference,
        crane: f.crane,
      }),
    /index bytes do not match/,
  );
  assert.deepEqual(
    readFileSync(f.log, 'utf8').trim().split('\n').map(JSON.parse),
    [['manifest', f.reference]],
  );
});

test('refuses child and configuration bytes whose exact digest differs', async (t) => {
  const child = fixture(t);
  const childDescriptor = JSON.parse(child.index).manifests[0];
  const childKey = `manifest ${repository}@${childDescriptor.digest}`;
  const changedChild = Buffer.from(
    Buffer.from(child.replies[childKey], 'base64')
      .toString('utf8')
      .replace('"schemaVersion":2', '"schemaVersion":3'),
  );
  child.replies[childKey] = changedChild.toString('base64');
  writeCrane(child.crane, child.log, child.replies);
  await assert.rejects(
    () =>
      acquireImageEvidence({
        name: 'studio',
        reference: child.reference,
        crane: child.crane,
      }),
    /child manifest digest mismatch/,
  );

  const config = fixture(t);
  const configKey = `blob ${repository}@${config.configurations['linux/amd64']}`;
  const changedConfig = Buffer.from(
    Buffer.from(config.replies[configKey], 'base64')
      .toString('utf8')
      .replace('"amd64"', '"arm64"'),
  );
  config.replies[configKey] = changedConfig.toString('base64');
  writeCrane(config.crane, config.log, config.replies);
  await assert.rejects(
    () =>
      acquireImageEvidence({
        name: 'studio',
        reference: config.reference,
        crane: config.crane,
      }),
    /config digest mismatch/,
  );
});

test('refuses an index with an extra platform before it can become evidence', async (t) => {
  const f = fixture(t, { extraPlatform: true });
  await assert.rejects(
    () =>
      acquireImageEvidence({
        name: 'studio',
        reference: f.reference,
        crane: f.crane,
      }),
    /Invalid OCI platform descriptor/,
  );
});

test('rejects near-miss and uncontrolled repositories before invoking crane', async (t) => {
  const f = fixture(t);
  await assert.rejects(
    () =>
      acquireImageEvidence({
        name: 'studio',
        reference: 'ghcr.io/example/studio@sha256:' + 'a'.repeat(64),
        crane: f.crane,
      }),
    /controlled repositories/,
  );
  await assert.rejects(
    () =>
      acquireImageEvidence({
        name: 'studio',
        reference: f.reference.replace('ghcr.io', 'ghcrXio'),
        crane: f.crane,
      }),
    /controlled repositories/,
  );
  assert.equal(existsSync(f.log), false);
});

test('redacts nonzero client diagnostics and bounds stdout', async (t) => {
  const f = fixture(t);
  const nonzero = join(f.directory, 'nonzero');
  writeFileSync(
    nonzero,
    '#!/usr/bin/env node\nprocess.stderr.write("registry-secret"); process.exit(1);\n',
  );
  chmodSync(nonzero, 0o755);
  await assert.rejects(
    () =>
      acquireImageEvidence({
        name: 'studio',
        reference: f.reference,
        crane: nonzero,
      }),
    (error) =>
      error.message === 'Registry evidence command failed.' &&
      !error.message.includes('registry-secret'),
  );
  const oversized = join(f.directory, 'oversized');
  writeFileSync(
    oversized,
    `#!/usr/bin/env node\nprocess.stdout.write(Buffer.alloc(${1024 * 1024 + 1}));\n`,
  );
  chmodSync(oversized, 0o755);
  await assert.rejects(
    () =>
      acquireImageEvidence({
        name: 'studio',
        reference: f.reference,
        crane: oversized,
        timeoutMs: 2_000,
      }),
    /exceeded its output bound/,
  );
});

test('kills the owned process group after fixture readiness and does not retain its descendant', async (t) => {
  const f = fixture(t);
  const stalled = join(f.directory, 'stalled');
  const ready = join(f.directory, 'ready');
  const descendant = join(f.directory, 'descendant');
  writeFileSync(
    stalled,
    String.raw`#!/usr/bin/env node
const { spawn } = require('node:child_process');
const fs = require('node:fs');
setTimeout(() => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' });
  fs.writeFileSync('${ready}', 'ready');
  fs.writeFileSync('${descendant}', String(child.pid));
  setInterval(() => {}, 1000);
}, 50);
`,
  );
  chmodSync(stalled, 0o755);
  const began = Date.now();
  await assert.rejects(
    () =>
      acquireImageEvidence({
        name: 'studio',
        reference: f.reference,
        crane: stalled,
        timeoutMs: 2_000,
      }),
    /timed out/,
  );
  const elapsed = Date.now() - began;
  assert.equal(readFileSync(ready, 'utf8'), 'ready');
  assert.ok(elapsed >= 200 && elapsed < 3_000, `settled in ${elapsed}ms`);
  const pid = Number(readFileSync(descendant, 'utf8'));
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
