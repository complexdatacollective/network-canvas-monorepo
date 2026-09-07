import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import configurationFiles from '../apps/studio/deployment/installer/configuration-files.json' with { type: 'json' };
import {
  buildInstallerArchive,
  readInstallerArchive,
} from './studio-installer-archive.mjs';
import { releasedDistribution } from './test-support/studio-release.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'studio-installer-archive-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const release = releasedDistribution();
  for (const name of [
    'install.mjs',
    'operation.mjs',
    'files.mjs',
    'release.mjs',
    'verify.mjs',
    'smoke.mjs',
    'configuration-files.json',
    'release.sigstore.json',
  ])
    writeFileSync(join(directory, name), name);
  writeFileSync(join(directory, 'release.json'), JSON.stringify(release.value));
  for (const name of configurationFiles) {
    const target = join(directory, `templates/${name}`);
    const config = join(directory, `configuration/${name}`);
    mkdirSync(join(target, '..'), { recursive: true });
    mkdirSync(join(config, '..'), { recursive: true });
    writeFileSync(target, name);
    writeFileSync(config, name);
  }
  return { directory, release };
}
test('round-trips exact deterministic inventory across mtimes', (t) => {
  const f = fixture(t);
  const a = buildInstallerArchive({
    directory: f.directory,
    source: f.release.current.source,
  });
  utimesSync(join(f.directory, 'install.mjs'), new Date(1), new Date(2));
  const b = buildInstallerArchive({
    directory: f.directory,
    source: f.release.current.source,
  });
  assert.deepEqual(a.bytes, b.bytes);
  assert.equal(
    readInstallerArchive(a.bytes, f.release.current.digest).entries.size,
    9 + configurationFiles.length * 2,
  );
});
test('refuses missing, linked, tampered, duplicate and truncated installer bytes', (t) => {
  const f = fixture(t);
  rmSync(join(f.directory, 'smoke.mjs'));
  assert.throws(
    () =>
      buildInstallerArchive({
        directory: f.directory,
        source: f.release.current.source,
      }),
    /incomplete/,
  );
  writeFileSync(join(f.directory, 'smoke.mjs'), 'smoke');
  symlinkSync('smoke.mjs', join(f.directory, 'linked'));
  assert.throws(
    () =>
      buildInstallerArchive({
        directory: f.directory,
        source: f.release.current.source,
      }),
    /Invalid installer path/,
  );
  rmSync(join(f.directory, 'linked'));
  const bytes = buildInstallerArchive({
    directory: f.directory,
    source: f.release.current.source,
  }).bytes;
  const altered = Buffer.from(bytes);
  altered[512] ^= 1;
  assert.throws(
    () => readInstallerArchive(altered, f.release.current.digest),
    /content differs|manifest binding/,
  );
  assert.throws(
    () =>
      readInstallerArchive(bytes.subarray(0, 700), f.release.current.digest),
    /Truncated|incomplete|terminator/,
  );
  assert.throws(
    () =>
      readInstallerArchive(
        bytes.subarray(0, bytes.length - 1024),
        f.release.current.digest,
      ),
    /terminator/,
  );
  assert.throws(() => readInstallerArchive(bytes, 'f'.repeat(64)), /binding/);
});
test('refuses source mismatch and CLI failure leaves no output', (t) => {
  const f = fixture(t);
  assert.throws(
    () =>
      buildInstallerArchive({ directory: f.directory, source: 'f'.repeat(40) }),
    /source differs/,
  );
  const output = join(f.directory, 'out.tar');
  assert.throws(() =>
    execFileSync(
      process.execPath,
      [
        'scripts/studio-installer-archive.mjs',
        f.directory,
        'f'.repeat(40),
        output,
      ],
      { cwd: process.cwd() },
    ),
  );
  assert.equal(existsSync(output), false);
});
