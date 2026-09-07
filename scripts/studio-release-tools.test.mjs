import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

import { sha256 } from '../apps/studio/deployment/installer/release.mjs';
import { installPinnedReleaseTools } from './studio-release-tools.mjs';

function versionOutput(path) {
  const name = basename(path);
  return name === 'cosign'
    ? 'GitVersion:    v3.1.3\nPlatform:      linux/amd64\n'
    : name === 'syft'
      ? 'Version:       1.51.1\nPlatform:      linux/amd64\n'
      : '0.22.1\n';
}

function octal(header, offset, length, value) {
  const encoded = value.toString(8).padStart(length - 1, '0') + '\0';
  header.write(encoded, offset, length, 'ascii');
}

function archive(entries) {
  const blocks = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.bytes ?? '');
    const header = Buffer.alloc(512);
    header.write(entry.name, 0, 100, 'utf8');
    octal(header, 100, 8, entry.mode ?? 0o644);
    octal(header, 108, 8, 0);
    octal(header, 116, 8, 0);
    octal(header, 124, 12, body.length);
    octal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] = (entry.type ?? '0').charCodeAt(0);
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    let checksum = 0;
    for (const byte of header) checksum += byte;
    header.write(checksum.toString(8).padStart(6, '0'), 148, 6, 'ascii');
    header[154] = 0;
    header[155] = 0x20;
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

function fixture(t, overrides = {}) {
  const parent = mkdtempSync(join(tmpdir(), 'studio-release-tools-test-'));
  chmodSync(parent, 0o700);
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const binaries = {
    cosign: Buffer.from('cosign executable'),
    crane: Buffer.from('crane executable'),
    syft: Buffer.from('syft executable'),
  };
  const assets = {
    cosign: binaries.cosign,
    crane: archive([
      { name: 'LICENSE' },
      { name: 'crane', mode: 0o755, bytes: binaries.crane },
    ]),
    syft: archive([
      { name: 'README.md' },
      { name: 'syft', mode: 0o755, bytes: binaries.syft },
    ]),
    ...overrides.assets,
  };
  const owners = {
    cosign: 'sigstore/cosign',
    crane: 'google/go-containerregistry',
    syft: 'anchore/syft',
  };
  const versions = { cosign: '3.1.3', crane: '0.22.1', syft: '1.51.1' };
  const checksumAssets = {
    cosign: 'cosign_checksums.txt',
    crane: 'checksums.txt',
    syft: 'syft_1.51.1_checksums.txt',
  };
  const entries = {};
  const replies = new Map();
  for (const name of ['cosign', 'crane', 'syft']) {
    const asset = name === 'cosign' ? 'cosign-linux-amd64' : `${name}.tar.gz`;
    const checksum = Buffer.from(`${sha256(assets[name])}  ${asset}\n`);
    const root = `https://github.com/${owners[name]}/releases/download/v${versions[name]}`;
    entries[name] = {
      version: versions[name],
      asset,
      url: `${root}/${asset}`,
      sha256: sha256(assets[name]),
      executableSha256: sha256(binaries[name]),
      checksumUrl: `${root}/${checksumAssets[name]}`,
      checksumSha256: sha256(checksum),
      archive: name === 'cosign' ? 'binary' : 'tar.gz',
      ...(name === 'crane'
        ? { members: { LICENSE: false, crane: true } }
        : name === 'syft'
          ? { members: { 'README.md': false, 'syft': true } }
          : {}),
    };
    replies.set(entries[name].url, assets[name]);
    replies.set(entries[name].checksumUrl, checksum);
  }
  const toolManifest = {
    format: 1,
    platforms: { 'linux/x64': entries },
  };
  const download = async (url, maximum) => {
    const bytes = replies.get(url);
    if (!bytes || bytes.length > maximum) throw new Error('bounded download');
    return Buffer.from(bytes);
  };
  return { download, parent, replies, run: versionOutput, toolManifest };
}

test('authenticates checksums and exact executables into a new private directory', async (t) => {
  const f = fixture(t);
  const installed = await installPinnedReleaseTools(
    {
      parentDirectory: f.parent,
      platform: 'linux/x64',
      toolManifest: f.toolManifest,
    },
    { download: f.download, run: f.run },
  );
  assert.equal(statSync(installed.directory).mode & 0o777, 0o700);
  assert.deepEqual(Object.keys(installed.paths).toSorted(), [
    'cosign',
    'crane',
    'syft',
  ]);
  for (const path of Object.values(installed.paths)) {
    assert.equal(statSync(path).mode & 0o777, 0o700);
    assert.equal(statSync(path).isFile(), true);
  }
});

test('refuses a substituted checksum source and removes partial output', async (t) => {
  const f = fixture(t);
  const original = f.download;
  const download = async (url, maximum) => {
    const bytes = await original(url, maximum);
    return url.includes('cosign_checksums')
      ? Buffer.concat([bytes, Buffer.from('substitution')])
      : bytes;
  };
  await assert.rejects(
    () =>
      installPinnedReleaseTools(
        {
          parentDirectory: f.parent,
          platform: 'linux/x64',
          toolManifest: f.toolManifest,
        },
        { download, run: f.run },
      ),
    /checksum source is not authentic/,
  );
  assert.deepEqual(readdirSync(f.parent), []);
});

test('refuses a correctly hashed executable that reports the wrong version', async (t) => {
  const f = fixture(t);
  await assert.rejects(
    () =>
      installPinnedReleaseTools(
        {
          parentDirectory: f.parent,
          platform: 'linux/x64',
          toolManifest: f.toolManifest,
        },
        { download: f.download, run: () => '0.0.0\n' },
      ),
    /unexpected version/,
  );
  assert.deepEqual(readdirSync(f.parent), []);
});

for (const { description, entry, pattern } of [
  {
    description: 'traversal',
    entry: { name: '../crane', mode: 0o755 },
    pattern: /Unsafe/,
  },
  {
    description: 'symlink',
    entry: { name: 'crane', mode: 0o755, type: '2' },
    pattern: /Unsafe/,
  },
  {
    description: 'hardlink',
    entry: { name: 'crane', mode: 0o755, type: '1' },
    pattern: /Unsafe/,
  },
  {
    description: 'executable substitution',
    entry: { name: 'crane', mode: 0o644 },
    pattern: /executable/,
  },
]) {
  test(`refuses ${description} in an authenticated archive`, async (t) => {
    const malicious = archive([
      { name: 'LICENSE' },
      { ...entry, bytes: 'crane executable' },
    ]);
    const f = fixture(t, { assets: { crane: malicious } });
    await assert.rejects(
      () =>
        installPinnedReleaseTools(
          {
            parentDirectory: f.parent,
            platform: 'linux/x64',
            toolManifest: f.toolManifest,
          },
          { download: f.download, run: f.run },
        ),
      pattern,
    );
    assert.deepEqual(readdirSync(f.parent), []);
  });
}

test('refuses an unexpected executable in an authenticated archive', async (t) => {
  const malicious = archive([
    { name: 'LICENSE' },
    { name: 'crane', mode: 0o755, bytes: 'crane executable' },
    { name: 'substitute', mode: 0o755, bytes: 'unexpected executable' },
  ]);
  const f = fixture(t, { assets: { crane: malicious } });
  await assert.rejects(
    () =>
      installPinnedReleaseTools(
        {
          parentDirectory: f.parent,
          platform: 'linux/x64',
          toolManifest: f.toolManifest,
        },
        { download: f.download, run: f.run },
      ),
    /archive inventory/,
  );
  assert.deepEqual(readdirSync(f.parent), []);
});

test('refuses a non-directory parent before downloading or writing', async (t) => {
  const f = fixture(t);
  writeFileSync(join(f.parent, 'file'), 'not a directory');
  await assert.rejects(
    () =>
      installPinnedReleaseTools(
        {
          parentDirectory: join(f.parent, 'file'),
          platform: 'linux/x64',
          toolManifest: f.toolManifest,
        },
        { download: f.download, run: f.run },
      ),
    /parent directory is invalid/,
  );
});
