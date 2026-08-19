import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  diffCompatPackage,
  syncCompatPackage,
} from '../packages/protocols/scripts/sync-compat-package.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const sampleSource = path.join(repoRoot, 'packages', 'protocols', 'sample');

async function withTempDir(run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'compat-protocol-'));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function makeFixture(root) {
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');
  for (const dir of [source, target]) {
    await mkdir(path.join(dir, 'assets'), { recursive: true });
    await writeFile(path.join(dir, 'protocol.json'), '{"schemaVersion":8}');
    await writeFile(path.join(dir, 'assets', 'image.png'), 'pixels');
  }
  return { source, target };
}

test('diffCompatPackage reports nothing for identical directories', async () => {
  await withTempDir(async (root) => {
    const { source, target } = await makeFixture(root);
    assert.deepEqual(await diffCompatPackage(source, target), []);
  });
});

test('diffCompatPackage reports every kind of drift', async () => {
  await withTempDir(async (root) => {
    const { source, target } = await makeFixture(root);
    await writeFile(path.join(target, 'protocol.json'), '{"schemaVersion":7}');
    await writeFile(path.join(target, 'assets', 'image.png'), 'other pixels');
    await writeFile(path.join(source, 'assets', 'added.csv'), 'a,b');
    await writeFile(path.join(target, 'assets', 'stale.csv'), 'c,d');

    assert.deepEqual(await diffCompatPackage(source, target), [
      'assets/added.csv is missing',
      'assets/image.png differs',
      'assets/stale.csv is not in the canonical protocol',
      'protocol.json differs',
    ]);
  });
});

test('diffCompatPackage compares assets in nested directories', async () => {
  await withTempDir(async (root) => {
    const { source, target } = await makeFixture(root);
    await mkdir(path.join(source, 'assets', 'nested'), { recursive: true });
    await writeFile(path.join(source, 'assets', 'nested', 'deep.txt'), 'one');
    await mkdir(path.join(target, 'assets', 'nested'), { recursive: true });
    await writeFile(path.join(target, 'assets', 'nested', 'deep.txt'), 'two');

    assert.deepEqual(await diffCompatPackage(source, target), [
      'assets/nested/deep.txt differs',
    ]);
  });
});

test('diffCompatPackage reports a missing assets directory', async () => {
  await withTempDir(async (root) => {
    const { source, target } = await makeFixture(root);
    await rm(path.join(target, 'assets'), { recursive: true });
    assert.deepEqual(await diffCompatPackage(source, target), [
      'assets/ is missing',
    ]);
  });
});

test('syncCompatPackage populates an empty target and leaves no staging directory', async () => {
  await withTempDir(async (root) => {
    const target = path.join(root, 'compat');
    assert.equal(await syncCompatPackage('sample', target), true);
    assert.deepEqual(await diffCompatPackage(sampleSource, target), []);
    assert.ok(!(await readdir(target)).includes('.sync-tmp'));
  });
});

test('syncCompatPackage writes nothing when the target already matches', async () => {
  await withTempDir(async (root) => {
    const target = path.join(root, 'compat');
    await syncCompatPackage('sample', target);

    const before = await stat(path.join(target, 'protocol.json'));
    assert.equal(await syncCompatPackage('sample', target), false);
    const after = await stat(path.join(target, 'protocol.json'));

    // An unconditional copy would churn mtimes on byte-identical files and
    // bust every mtime-keyed cache downstream.
    assert.equal(after.mtimeMs, before.mtimeMs);
  });
});

test('syncCompatPackage repairs a stale target without stranding files', async () => {
  await withTempDir(async (root) => {
    const target = path.join(root, 'compat');
    await syncCompatPackage('sample', target);
    await writeFile(path.join(target, 'protocol.json'), 'corrupted');
    await writeFile(path.join(target, 'assets', 'stowaway.txt'), 'delete me');

    assert.equal(await syncCompatPackage('sample', target), true);
    assert.deepEqual(await diffCompatPackage(sampleSource, target), []);
    assert.ok(!(await readdir(target)).includes('.sync-tmp'));
  });
});

test('syncCompatPackage rejects an unknown protocol id', async () => {
  await withTempDir(async (root) => {
    await assert.rejects(
      () => syncCompatPackage('nonexistent', path.join(root, 'compat')),
      /Unknown protocol "nonexistent"/,
    );
  });
});

test('the compat packages regenerate only at publish time, never on install', async () => {
  for (const pkg of ['sample-protocol', 'development-protocol']) {
    const manifest = JSON.parse(
      await readFile(
        path.join(repoRoot, 'packages', pkg, 'package.json'),
        'utf8',
      ),
    );
    // `prepare` runs on every `pnpm install`, which would rewrite these
    // packages' tracked files in every contributor's working tree.
    assert.equal(
      manifest.scripts.prepare,
      undefined,
      `${pkg} must not sync from a prepare script`,
    );
    assert.match(manifest.scripts.prepack, /sync-compat-package\.mjs/);
  }
});

test('the compat packages do not ignore their tracked generated files', async () => {
  for (const pkg of ['sample-protocol', 'development-protocol']) {
    const ignored = await readFile(
      path.join(repoRoot, 'packages', pkg, '.gitignore'),
      'utf8',
    );
    const patterns = ignored
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    for (const tracked of ['protocol.json', 'assets/', 'assets']) {
      assert.ok(
        !patterns.includes(tracked),
        `${pkg}/.gitignore must not ignore ${tracked}, which is tracked in Git`,
      );
    }
  }
});
