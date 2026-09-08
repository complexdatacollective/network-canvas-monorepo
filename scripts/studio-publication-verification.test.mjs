import assert from 'node:assert/strict';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  sha256,
  signatureArguments,
} from '../apps/studio/deployment/installer/release.mjs';
import { command } from '../apps/studio/deployment/installer/verify.mjs';
import { verifyStudioPublication } from './studio-publication-verification.mjs';
import { installerFixture } from './test-support/studio-installer.mjs';

function fixture(t, failure = '') {
  const installer = installerFixture(t);
  const artifacts = new Map([
    ['release.json', installer.contents.get('release.json')],
    ['release.sigstore.json', installer.contents.get('release.sigstore.json')],
    ['installer.tar', installer.build().bytes],
    ['installer.sigstore.json', Buffer.from('{"bundle":"fixture"}')],
  ]);
  const log = join(installer.root, 'cosign.log');
  const cosign = join(installer.root, 'cosign');
  writeFileSync(
    cosign,
    String.raw`#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const paths = args.filter((value) => value.startsWith('/')).map((value) => ({
  name: path.basename(value),
  mode: fs.statSync(value).mode & 0o777,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(value)).digest('hex'),
}));
const staged = args.find((value) => value.startsWith('/'));
const directoryMode = staged ? fs.statSync(path.dirname(staged)).mode & 0o777 : null;
fs.appendFileSync('${log}', JSON.stringify({ args, directoryMode, paths }) + '\n');
if (${JSON.stringify(failure)} && args.some((value) => value.includes(${JSON.stringify(failure)}))) process.exit(1);
`,
  );
  chmodSync(cosign, 0o755);
  return { artifacts, cosign, installer, log };
}

function calls(log) {
  return readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
}

function assertCleaned(recorded) {
  for (const call of recorded)
    for (const path of call.args.filter((value) => value.startsWith('/')))
      assert.equal(existsSync(path), false, `${path} was removed`);
}

// These spawned fixtures only record the command boundary. They do not perform
// cryptographic Cosign qualification, which remains the installed CLI's job.
test('stages exact retained blobs privately and invokes the fixed installer trust policy', (t) => {
  const f = fixture(t);
  const before = new Map(
    [...f.artifacts].map(([name, bytes]) => [name, Buffer.from(bytes)]),
  );
  verifyStudioPublication(f.artifacts, { cosign: f.cosign });
  const seen = calls(f.log);
  const images = Object.values(f.installer.release.value.images);
  assert.equal(seen.length, 2 + images.length);
  assert.deepEqual(
    seen[0].args,
    signatureArguments('blob', seen[0].args[1], seen[0].args[3]),
  );
  assert.deepEqual(
    seen[1].args,
    signatureArguments('blob', seen[1].args[1], seen[1].args[3]),
  );
  assert.deepEqual(
    seen.slice(2).map(({ args }) => args),
    images.map(({ reference }) => signatureArguments('image', reference)),
  );
  for (const { paths } of seen.slice(0, 2))
    for (const path of paths) assert.equal(path.mode, 0o600);
  for (const { args, directoryMode } of seen.slice(0, 2)) {
    assert.equal(directoryMode, 0o700);
    assert.equal(args[1].startsWith(process.cwd()), false);
  }
  assert.deepEqual(
    seen[0].paths.map(({ name, sha256: digest }) => [name, digest]),
    [
      ['release.json', f.installer.release.current.digest],
      [
        'release.sigstore.json',
        sha256(f.artifacts.get('release.sigstore.json')),
      ],
    ],
  );
  assertCleaned(seen);
  for (const [name, bytes] of before)
    assert.deepEqual(f.artifacts.get(name), bytes, `${name} was not mutated`);
});

test('refuses an archive whose retained release evidence differs before Cosign runs', (t) => {
  const f = fixture(t);
  f.artifacts.set('release.sigstore.json', Buffer.from('{"different":true}'));
  assert.throws(
    () => verifyStudioPublication(f.artifacts, { cosign: f.cosign }),
    /Publication artifacts are invalid/,
  );
  assert.equal(existsSync(f.log), false);
});

test('a blob verification failure cleans staging and prevents image verification', (t) => {
  const f = fixture(t, 'installer.tar');
  assert.throws(
    () => verifyStudioPublication(f.artifacts, { cosign: f.cosign }),
    /Publication signature verification failed/,
  );
  const seen = calls(f.log);
  assert.equal(seen.length, 2);
  assertCleaned(seen);
});

test('an image verification failure cleans staging and prevents later image verification', (t) => {
  const f = fixture(t);
  const first = Object.values(f.installer.release.value.images)[0].reference;
  writeFileSync(
    f.cosign,
    readFileSync(f.cosign, 'utf8').replaceAll('""', JSON.stringify(first)),
  );
  assert.throws(
    () => verifyStudioPublication(f.artifacts, { cosign: f.cosign }),
    /Publication signature verification failed/,
  );
  const seen = calls(f.log);
  assert.equal(seen.length, 3);
  assertCleaned(seen);
});

test('the verification deadline stops a CLI that ignores SIGTERM and removes staging', (t) => {
  const f = fixture(t);
  const ready = join(f.installer.root, 'ready');
  writeFileSync(
    f.cosign,
    readFileSync(f.cosign, 'utf8') +
      `
process.on('SIGTERM', () => {});
fs.writeFileSync(${JSON.stringify(ready)}, 'ready');
setInterval(() => {}, 1000);
`,
  );
  const started = Date.now();
  assert.throws(
    () =>
      verifyStudioPublication(f.artifacts, {
        cosign: f.cosign,
        run: (program, args, options) =>
          command(program, args, { ...options, timeout: 1000 }),
      }),
    /Publication signature verification failed/,
  );
  assert.equal(readFileSync(ready, 'utf8'), 'ready');
  assert.ok(Date.now() - started < 2500);
  const seen = calls(f.log);
  assert.equal(seen.length, 1);
  assertCleaned(seen);
});
