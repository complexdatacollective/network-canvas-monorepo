import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs, {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import configurationFiles from '../apps/studio/deployment/installer/configuration-files.json' with { type: 'json' };
import {
  readInstallerBundle,
  readInstallerFiles,
} from '../apps/studio/deployment/installer/files.mjs';
import { sha256 } from '../apps/studio/deployment/installer/release.mjs';
import {
  buildInstallerArchive,
  readInstallerArchive,
} from './studio-installer-archive.mjs';
import { releasedDistribution } from './test-support/studio-release.mjs';

function fixture(t, reverse = false) {
  const root = mkdtempSync(join(tmpdir(), 'studio-installer-archive-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, 'bundle');
  mkdirSync(directory);
  const release = releasedDistribution();
  const contents = new Map();
  for (const name of [
    'install.mjs',
    'operation.mjs',
    'files.mjs',
    'release.mjs',
    'verify.mjs',
    'smoke.mjs',
    'configuration-files.json',
  ])
    contents.set(
      name,
      readFileSync(
        new URL(`../apps/studio/deployment/installer/${name}`, import.meta.url),
      ),
    );
  contents.set('release.sigstore.json', Buffer.from('{}'));
  contents.set('release.json', Buffer.from(JSON.stringify(release.value)));
  for (const name of configurationFiles) {
    const bytes = readFileSync(
      new URL(`../apps/studio/${name}`, import.meta.url),
    );
    contents.set(`templates/${name}`, bytes);
    // Generated configuration bytes are synthetic; no template is executed.
    contents.set(
      `configuration/${name}`,
      Buffer.from(`# local fixture ${name}\n`),
    );
  }
  contents.set('Z-order', Buffer.from('last uppercase'));
  contents.set('a-order', Buffer.from('first lowercase'));
  for (const [name, bytes] of reverse ? [...contents].reverse() : contents) {
    mkdirSync(dirname(join(directory, name)), { recursive: true });
    writeFileSync(join(directory, name), bytes);
  }
  const build = () =>
    buildInstallerArchive({ directory, source: release.current.source });
  return {
    root,
    directory,
    release,
    contents,
    build,
    output: join(root, 'installer.tar'),
  };
}

function entries(bytes) {
  const result = [];
  let offset = 0;
  while (offset + 512 <= bytes.length && bytes[offset] !== 0) {
    const size = Number.parseInt(
      bytes.subarray(offset + 124, offset + 136).toString(),
      8,
    );
    const next = offset + 512 + Math.ceil(size / 512) * 512;
    result.push({
      name: bytes
        .subarray(offset, offset + 100)
        .toString()
        .replace(/\0.*$/s, ''),
      offset,
      size,
      next,
    });
    offset = next;
  }
  assert.ok(result.length > 0);
  return result;
}
function checksum(bytes, offset = 0) {
  bytes.fill(32, offset + 148, offset + 156);
  const sum = bytes
    .subarray(offset, offset + 512)
    .reduce((value, byte) => value + byte, 0);
  bytes.write(`${sum.toString(8).padStart(7, '0')}\0`, offset + 148, 'ascii');
}
function repack(original, replace) {
  const blocks = entries(original).map((item) => {
    const header = Buffer.from(
      original.subarray(item.offset, item.offset + 512),
    );
    const body = replace(
      item.name,
      Buffer.from(
        original.subarray(item.offset + 512, item.offset + 512 + item.size),
      ),
    );
    header.write(
      `${body.length.toString(8).padStart(11, '0')}\0`,
      124,
      'ascii',
    );
    checksum(header);
    return Buffer.concat([
      header,
      body,
      Buffer.alloc((512 - (body.length % 512)) % 512),
    ]);
  });
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}

test('produces identical bytes across filesystem order/mtime and loads through real tar and installer', (t) => {
  const first = fixture(t);
  const second = fixture(t, true);
  utimesSync(join(second.directory, 'install.mjs'), new Date(1), new Date(2));
  const a = first.build();
  const b = second.build();
  assert.deepEqual(a.bytes, b.bytes);
  assert.equal(a.sha256, sha256(a.bytes));
  const read = readInstallerArchive(a.bytes, first.release.current.digest);
  assert.deepEqual(read.entries, first.contents);
  assert.equal(read.manifest.current.source, first.release.current.source);
  writeFileSync(first.output, a.bytes);
  const extracted = join(first.root, 'extracted');
  mkdirSync(extracted);
  execFileSync('tar', ['-xf', first.output, '-C', extracted]);
  const installed = readInstallerBundle(
    extracted,
    first.release.current.digest,
  );
  assert.deepEqual(installed.files, first.contents);
  assert.equal(installed.current.source, first.release.current.source);
  for (const name of a.entries)
    assert.equal(statSync(join(extracted, name)).mode & 0o777, 0o600);
});

for (const missing of [
  'install.mjs',
  'release.sigstore.json',
  'templates/deployment/restore.sh',
]) {
  test(`refuses missing required file ${missing}`, (t) => {
    const f = fixture(t);
    rmSync(join(f.directory, missing));
    assert.throws(f.build, /incomplete/);
  });
}
for (const path of ['../escape', '/escape', 'a/../../escape']) {
  test(`refuses unsafe archive path ${path}`, (t) => {
    const f = fixture(t);
    const bytes = f.build().bytes;
    bytes.fill(0, 0, 100);
    bytes.write(path, 0, 'ascii');
    checksum(bytes);
    assert.throws(
      () => readInstallerArchive(bytes, f.release.current.digest),
      /Invalid installer archive entry/,
    );
  });
}
for (const [name, mutate] of [
  [
    'checksum',
    (b) => {
      b[148] ^= 1;
    },
  ],
  [
    'magic',
    (b) => {
      b[257] = 120;
      checksum(b);
    },
  ],
  [
    'version',
    (b) => {
      b[264] = 49;
      checksum(b);
    },
  ],
  [
    'symlink type',
    (b) => {
      b[156] = 50;
      checksum(b);
    },
  ],
  [
    'USTAR prefix',
    (b) => {
      b.write('../outside', 345);
      checksum(b);
    },
  ],
  [
    'octal junk',
    (b) => {
      b[125] = 120;
      checksum(b);
    },
  ],
]) {
  test(`refuses malformed archive ${name}`, (t) => {
    const f = fixture(t);
    const bytes = f.build().bytes;
    mutate(bytes);
    assert.throws(
      () => readInstallerArchive(bytes, f.release.current.digest),
      /Invalid installer archive header/,
    );
  });
}

test('refuses duplicate entries even when their headers and bytes are valid', (t) => {
  const f = fixture(t);
  const bytes = f.build().bytes;
  const first = entries(bytes)[0];
  const duplicated = Buffer.concat([bytes.subarray(0, first.next), bytes]);
  assert.throws(
    () => readInstallerArchive(duplicated, f.release.current.digest),
    /archive inventory/,
  );
});

test('refuses modified file content with a valid header', (t) => {
  const f = fixture(t);
  const bytes = f.build().bytes;
  const target = entries(bytes).find((item) => item.name === 'install.mjs');
  assert.ok(target);
  bytes[target.offset + 512] ^= 1;
  assert.throws(
    () => readInstallerArchive(bytes, f.release.current.digest),
    /content differs/,
  );
});

test('refuses nonzero entry padding', (t) => {
  const f = fixture(t);
  const bytes = f.build().bytes;
  const target = entries(bytes).find((item) => item.size % 512 !== 0);
  assert.ok(target);
  bytes[target.offset + 512 + target.size] = 1;
  assert.throws(
    () => readInstallerArchive(bytes, f.release.current.digest),
    /padding/,
  );
});
for (const [name, change] of [
  ['missing both end blocks', (b) => b.subarray(0, b.length - 1024)],
  ['missing one end block', (b) => b.subarray(0, b.length - 512)],
  ['partial end block', (b) => b.subarray(0, b.length - 1)],
  ['trailing nonzero byte', (b) => Buffer.concat([b, Buffer.from('x')])],
  ['trailing zero block', (b) => Buffer.concat([b, Buffer.alloc(512)])],
  ['truncated payload', (b) => b.subarray(0, 600)],
]) {
  test(`refuses ${name}`, (t) => {
    const f = fixture(t);
    assert.throws(
      () =>
        readInstallerArchive(change(f.build().bytes), f.release.current.digest),
      /terminator|Truncated/,
    );
  });
}

test('refuses substituted source, selected manifest and inventory metadata', (t) => {
  const f = fixture(t);
  assert.throws(
    () =>
      buildInstallerArchive({ directory: f.directory, source: 'f'.repeat(40) }),
    /source differs/,
  );
  const bytes = f.build().bytes;
  assert.throws(
    () => readInstallerArchive(bytes, 'f'.repeat(64)),
    /independently selected/,
  );
  for (const mutate of [
    (m) => {
      m.source = 'f'.repeat(40);
    },
    (m) => {
      m.manifestSha256 = 'f'.repeat(64);
    },
    (m) => {
      m.unreviewed = true;
    },
    (m) => {
      m.files = [];
    },
    (m) => {
      delete m.files['install.mjs'];
    },
  ]) {
    const changed = repack(bytes, (name, content) => {
      if (name !== 'installer.json') return content;
      const metadata = JSON.parse(content);
      mutate(metadata);
      return Buffer.from(JSON.stringify(metadata));
    });
    assert.throws(
      () => readInstallerArchive(changed, f.release.current.digest),
      /inventory|independently selected/,
    );
  }
});

test('refuses filesystem symlinks without reading the target', (t) => {
  const f = fixture(t);
  symlinkSync('not-present', join(f.directory, 'linked'));
  assert.throws(f.build, /links are not allowed/);
});

test('checks aggregate inventory limits across separate directories', (t) => {
  const f = fixture(t);
  for (const directory of ['one', 'two']) {
    mkdirSync(join(f.directory, directory));
    for (let index = 0; index < 501; index++)
      writeFileSync(join(f.directory, directory, `file-${index}`), 'x');
  }
  assert.throws(f.build, /inventory is too large/);
});

test('includes generated metadata in the exact 1000-file inventory boundary', (t) => {
  const f = fixture(t);
  const count = readInstallerFiles(f.directory).files.size;
  for (let index = count; index < 1000; index++)
    writeFileSync(join(f.directory, `extra-${index}`), 'x');
  assert.throws(f.build, /inventory is too large/);
});

test('refuses an individual file over 8 MiB and aggregate data over 32 MiB', (t) => {
  const f = fixture(t);
  writeFileSync(
    join(f.directory, 'oversized'),
    Buffer.alloc(8 * 1024 * 1024 + 1),
  );
  assert.throws(f.build, /Invalid installer file/);
  rmSync(join(f.directory, 'oversized'));
  for (let index = 0; index < 4; index++) {
    mkdirSync(join(f.directory, `large-${index}`));
    writeFileSync(
      join(f.directory, `large-${index}`, 'bytes'),
      Buffer.alloc(8 * 1024 * 1024),
    );
  }
  assert.throws(f.build, /inventory is too large/);
});

test('CLI returns bounded metadata and writes exactly one complete private archive', (t) => {
  const f = fixture(t);
  const result = spawnSync(
    process.execPath,
    [
      'scripts/studio-installer-archive.mjs',
      f.directory,
      f.release.current.source,
      f.output,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const metadata = JSON.parse(result.stdout);
  const bytes = readFileSync(f.output);
  assert.deepEqual(metadata, {
    sha256: sha256(bytes),
    source: f.release.current.source,
    manifestSha256: f.release.current.digest,
  });
  assert.ok(result.stdout.length < 400);
  assert.equal(statSync(f.output).mode & 0o777, 0o600);
  assert.deepEqual(
    readInstallerArchive(bytes, f.release.current.digest).entries,
    f.contents,
  );
  assert.deepEqual(readdirSync(f.root).toSorted(), ['bundle', 'installer.tar']);
});

for (const link of [false, true]) {
  test(`refuses to replace an existing ${link ? 'symlink' : 'file'} output`, (t) => {
    const f = fixture(t);
    const target = join(f.root, 'protected');
    writeFileSync(target, 'existing archive');
    if (link) symlinkSync(target, f.output);
    else writeFileSync(f.output, 'existing archive');
    assert.throws(
      () =>
        buildInstallerArchive({
          directory: f.directory,
          source: f.release.current.source,
          output: f.output,
        }),
      { code: 'EEXIST' },
    );
    assert.equal(readFileSync(target, 'utf8'), 'existing archive');
    assert.equal(readFileSync(f.output, 'utf8'), 'existing archive');
    assert.deepEqual(readdirSync(f.root).toSorted(), [
      'bundle',
      'installer.tar',
      'protected',
    ]);
  });
}

test('a real interrupted write leaves neither a partial archive nor a temporary file', (t) => {
  const f = fixture(t);
  const original = fs.writeFileSync;
  fs.writeFileSync = (descriptor, data, ...options) => {
    assert.equal(typeof descriptor, 'number');
    original(descriptor, data.subarray(0, 512), ...options);
    throw new Error('synthetic interrupted archive write');
  };
  syncBuiltinESMExports();
  try {
    assert.throws(
      () =>
        buildInstallerArchive({
          directory: f.directory,
          source: f.release.current.source,
          output: f.output,
        }),
      /synthetic interrupted/,
    );
  } finally {
    fs.writeFileSync = original;
    syncBuiltinESMExports();
  }
  assert.equal(existsSync(f.output), false);
  assert.deepEqual(readdirSync(f.root), ['bundle']);
});

test('CLI validation failure leaves no archive and no machine-readable success', (t) => {
  const f = fixture(t);
  const result = spawnSync(
    process.execPath,
    [
      'scripts/studio-installer-archive.mjs',
      f.directory,
      'f'.repeat(40),
      f.output,
    ],
    { encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /source differs/);
  assert.equal(result.stdout, '');
  assert.equal(existsSync(f.output), false);
  assert.deepEqual(readdirSync(f.root), ['bundle']);
});
