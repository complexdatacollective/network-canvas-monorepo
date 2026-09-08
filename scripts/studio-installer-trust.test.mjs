import assert from 'node:assert/strict';
import {
  chmodSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  loadState,
  privateDirectory,
  privateFile,
  readInstallerBundle,
  saveState,
} from '../apps/studio/deployment/installer/files.mjs';
import {
  acceptRelease,
  activateRelease,
  RELEASE_IDENTITY,
  RELEASE_ISSUER,
  sha256,
} from '../apps/studio/deployment/installer/release.mjs';
import {
  command,
  pullVerifiedImages,
  verifyOperation,
} from '../apps/studio/deployment/installer/verify.mjs';
import { installerFixture } from './test-support/studio-installer.mjs';
import { releasedDistribution } from './test-support/studio-release.mjs';

function fixture(t, release = releasedDistribution()) {
  const installer = installerFixture(t, false, release);
  const { root, directory: bundleDirectory, contents: files } = installer;
  const controlDirectory = privateDirectory(join(root, 'control'));
  // These byte fixtures are never executed. The fake verifier below qualifies
  // the command/effect boundary; the release workflow must separately exercise
  // real Cosign signatures, wrong identities and tampering before publication.
  const metadata = {
    format: 1,
    source: release.current.source,
    manifestSha256: release.current.digest,
    files: Object.fromEntries(
      [...files].map(([name, bytes]) => [name, sha256(bytes)]),
    ),
  };
  writeFileSync(
    join(bundleDirectory, 'installer.json'),
    JSON.stringify(metadata),
  );
  const calls = [];
  const run = (program, args) => {
    calls.push([program, args]);
    if (program === 'cosign') {
      assert.ok(args.includes(RELEASE_IDENTITY));
      assert.ok(args.includes(RELEASE_ISSUER));
      return 'verified fixture';
    }
    if (program === 'docker' && args[0] === 'pull') return 'pulled fixture';
    if (program === 'docker' && args[0] === 'image' && args[1] === 'inspect') {
      const image = Object.values(release.release.images).find(
        ({ reference }) => reference === args.at(-1),
      );
      assert.ok(image);
      return JSON.stringify({
        Os: 'linux',
        Architecture: 'amd64',
        Id: image.configurations['linux/amd64'],
      });
    }
    throw new Error('Unexpected command in trust verification');
  };
  return {
    root,
    bundleDirectory,
    controlDirectory,
    expectedDigest: release.current.digest,
    release,
    calls,
    run,
  };
}

test('a missing required Registry operator member refuses before verification', (t) => {
  const f = fixture(t);
  rmSync(join(f.bundleDirectory, 'registry-configuration/recovery.yml'));
  assert.throws(
    () => verifyOperation(f, f.run),
    /Installer bundle is incomplete/,
  );
  assert.deepEqual(f.calls, []);
});

test('verifies the bound manifest and every image before pulls; actual local configuration IDs must then match', (t) => {
  const f = fixture(t);
  const result = verifyOperation(f, f.run);
  assert.equal(f.calls.length, 7);
  assert.ok(f.calls.every(([program]) => program === 'cosign'));
  assert.equal(f.calls[0][1][0], 'verify-blob');
  assert.equal(loadState(f.controlDirectory), null);
  const images = pullVerifiedImages(result.bundle, f.run);
  assert.equal(Object.keys(images).length, 6);
  assert.equal(f.calls.length, 19);
  assert.ok(f.calls.slice(7).every(([program]) => program === 'docker'));
  assert.deepEqual(result.accepted.highest, f.release.current);
});

for (const failure of [0, 1, 6])
  test(`a verifier refusal at artifact ${failure} leaves control bytes and services unchanged`, (t) => {
    const old = releasedDistribution();
    const next = releasedDistribution(2, [old]);
    const f = fixture(t, next);
    saveState(
      f.controlDirectory,
      activateRelease(
        acceptRelease(old, null, { expectedDigest: old.current.digest }),
        old.current,
      ),
    );
    const before = readFileSync(join(f.controlDirectory, 'state.json'));
    let count = 0;
    assert.throws(
      () =>
        verifyOperation(f, (program, args) => {
          if (count++ === failure)
            throw new Error('Signature identity rejected');
          return f.run(program, args);
        }),
      /Signature identity rejected/,
    );
    assert.equal(count, failure + 1);
    assert.ok(f.calls.every(([program]) => program !== 'docker'));
    assert.deepEqual(
      readFileSync(join(f.controlDirectory, 'state.json')),
      before,
    );
  });

test('fresh-host old-release replay refuses before invoking even the verifier', (t) => {
  const old = releasedDistribution();
  const f = fixture(t, old);
  assert.throws(
    () =>
      verifyOperation(
        { ...f, expectedDigest: releasedDistribution(2, [old]).current.digest },
        f.run,
      ),
    /independently selected/,
  );
  assert.deepEqual(f.calls, []);
  assert.deepEqual(readdirSync(f.controlDirectory), []);
});

test('an older valid release refuses on an initialized host before image pulls or state writes', (t) => {
  const old = releasedDistribution();
  const latest = releasedDistribution(2, [old]);
  const f = fixture(t, old);
  saveState(
    f.controlDirectory,
    activateRelease(
      acceptRelease(latest, null, { expectedDigest: latest.current.digest }),
      latest.current,
    ),
  );
  const before = readFileSync(join(f.controlDirectory, 'state.json'));
  assert.throws(() => verifyOperation(f, f.run), /replay/);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(
    readFileSync(join(f.controlDirectory, 'state.json')),
    before,
  );
});

test('an inspected local image with different bytes refuses even after a successful signature result', (t) => {
  const f = fixture(t);
  const result = verifyOperation(f, f.run);
  assert.throws(
    () =>
      pullVerifiedImages(result.bundle, (program, args) =>
        args[0] === 'image'
          ? JSON.stringify({
              Os: 'linux',
              Architecture: 'amd64',
              Id: `sha256:${'a'.repeat(64)}`,
            })
          : f.run(program, args),
      ),
    /Pulled image bytes/,
  );
  assert.equal(loadState(f.controlDirectory), null);
});

test('the complete installer inventory refuses missing, changed, added and linked code bytes', (t) => {
  const f = fixture(t);
  const path = join(f.bundleDirectory, 'operation.mjs');
  const original = readFileSync(path);
  for (const mutation of [
    () => rmSync(path),
    () => writeFileSync(path, 'different executable bytes'),
    () => {
      rmSync(path);
      symlinkSync(join(f.bundleDirectory, 'install.mjs'), path);
    },
  ]) {
    mutation();
    assert.throws(() =>
      readInstallerBundle(f.bundleDirectory, f.expectedDigest),
    );
    rmSync(path, { force: true });
    writeFileSync(path, original);
  }
  const rawTemplate = join(
    f.bundleDirectory,
    'templates/deployment/postgres-init.sql',
  );
  const originalTemplate = readFileSync(rawTemplate);
  writeFileSync(rawTemplate, 'different administrator provisioning bytes');
  assert.throws(
    () => readInstallerBundle(f.bundleDirectory, f.expectedDigest),
    /signed inventory/,
  );
  writeFileSync(rawTemplate, originalTemplate);
  writeFileSync(
    join(f.bundleDirectory, 'unlisted.mjs'),
    'extra executable bytes',
  );
  assert.throws(
    () => readInstallerBundle(f.bundleDirectory, f.expectedDigest),
    /signed inventory/,
  );
});

test('durable state keeps mode0600, refuses public files/links and survives a failed update without lowering its high-water mark', (t) => {
  const f = fixture(t);
  const old = f.release;
  const latest = releasedDistribution(2, [old]);
  const prior = activateRelease(
    acceptRelease(old, null, { expectedDigest: old.current.digest }),
    old.current,
  );
  saveState(f.controlDirectory, prior);
  const accepted = acceptRelease(latest, prior, {
    expectedDigest: latest.current.digest,
  });
  saveState(f.controlDirectory, accepted);
  assert.deepEqual(loadState(f.controlDirectory), accepted);
  assert.throws(
    () => saveState(f.controlDirectory, prior),
    /highest accepted release/,
  );
  assert.deepEqual(loadState(f.controlDirectory), accepted);
  assert.deepEqual(readdirSync(f.controlDirectory), ['state.json']);
  const path = join(f.controlDirectory, 'state.json');
  assert.equal(statSync(path).mode & 0o777, 0o600);
  chmodSync(path, 0o644);
  assert.throws(() => loadState(f.controlDirectory), /private operator-owned/);
  assert.throws(
    () => saveState(f.controlDirectory, prior),
    /private operator-owned/,
  );
  rmSync(path);
  symlinkSync(join(f.root, 'absent-state'), path);
  assert.throws(() => loadState(f.controlDirectory), /private operator-owned/);
  assert.throws(
    () => saveState(f.controlDirectory, prior),
    /private operator-owned/,
  );
  chmodSync(f.controlDirectory, 0o755);
  assert.throws(() => privateDirectory(f.controlDirectory), /mode0700/);
  assert.throws(() => privateDirectory('/'), /filesystem root/);
  assert.throws(() => privateFile(f.bundleDirectory), /private operator-owned/);
});

test('the production subprocess wrapper reports actual success and refuses a real command failure', () => {
  assert.equal(
    command(process.execPath, ['-e', 'process.stdout.write("verified")']),
    'verified',
  );
  assert.throws(() => command(process.execPath, ['-e', 'process.exit(7)']));
});
