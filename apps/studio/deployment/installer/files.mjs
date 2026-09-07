import { randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import configurationFiles from './configuration-files.json' with { type: 'json' };
import { readRelease, readState, sha256 } from './release.mjs';

// Inventory order is byte-lexical and independent of the host's locale.
const comparePaths = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

export function privateDirectory(path) {
  const resolved = resolve(path);
  if (resolved === dirname(resolved))
    throw new Error('The filesystem root is not an installation directory.');
  if (!existsSync(resolved)) mkdirSync(resolved, { mode: 0o700 });
  const info = lstatSync(resolved);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.mode & 0o077 ||
    info.uid !== process.getuid()
  )
    throw new Error(
      'Installation control requires an operator-owned mode0700 directory.',
    );
  return realpathSync(resolved);
}

export function privateFile(path, limit = 16_384) {
  const info = lstatSync(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.mode & 0o077 ||
    info.uid !== process.getuid() ||
    info.size > limit
  )
    throw new Error('Expected a private operator-owned regular file.');
  return readFileSync(path);
}

/** Caller holds the kernel installation lock for the entire operation. */
export function loadState(directory) {
  const path = join(directory, 'state.json');
  return lstatSync(path, { throwIfNoEntry: false })
    ? readState(privateFile(path))
    : null;
}

export function saveState(directory, state) {
  const bytes = Buffer.from(`${JSON.stringify(state)}\n`);
  readState(bytes);
  const path = join(directory, 'state.json');
  if (lstatSync(path, { throwIfNoEntry: false })) {
    const previous = readState(privateFile(path));
    if (
      state.highest.generation < previous.highest.generation ||
      (state.highest.generation === previous.highest.generation &&
        (state.highest.source !== previous.highest.source ||
          state.highest.digest !== previous.highest.digest))
    )
      throw new Error(
        'The protected highest accepted release cannot be lowered or replaced.',
      );
  }
  writePrivateFile(path, bytes);
}

/** Atomic, fsynced operator metadata; never follow an existing destination link. */
export function writePrivateFile(path, bytes) {
  if (lstatSync(path, { throwIfNoEntry: false }))
    privateFile(path, 32 * 1024 * 1024);
  const directory = dirname(path);
  const temporary = join(directory, `.write-${randomUUID()}`);
  const handle = openSync(
    temporary,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600,
  );
  try {
    writeFileSync(handle, bytes);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  try {
    renameSync(temporary, path);
    const parent = openSync(directory, constants.O_RDONLY);
    try {
      fsyncSync(parent);
    } finally {
      closeSync(parent);
    }
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

/** Complete bounded inventory, shared by publication and the authenticated installer. */
export function readInstallerFiles(directory) {
  const root = realpathSync(directory);
  const files = new Map();
  let total = 0;
  function walk(path = '') {
    for (const name of readdirSync(join(root, path))) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name))
        throw new Error('Invalid installer path.');
      const relative = path ? `${path}/${name}` : name;
      const target = join(root, relative);
      const info = lstatSync(target);
      if (info.isSymbolicLink())
        throw new Error('Installer links are not allowed.');
      if (info.isDirectory()) {
        if (relative.split('/').length > 5)
          throw new Error('Invalid installer depth.');
        walk(relative);
      } else if (info.isFile() && info.size <= 8 * 1024 * 1024) {
        const bytes = readFileSync(target);
        total += bytes.length;
        files.set(relative, bytes);
        if (files.size > 1000 || total > 32 * 1024 * 1024)
          throw new Error('Installer inventory is too large.');
      } else throw new Error('Invalid installer file.');
    }
  }
  walk();
  return { directory: root, files };
}

/** Validate the same manifest binding and file inventory before and after packing.
 * This does not authenticate signatures; trusted Cosign must do that first. */
export function validateInstallerInventory(inventoryFiles, expectedDigest) {
  let total = 0;
  if (inventoryFiles.size > 1000)
    throw new Error('Installer inventory is too large.');
  for (const [path, bytes] of inventoryFiles) {
    if (
      !path
        .split('/')
        .every((part) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part)) ||
      path.split('/').length > 6
    )
      throw new Error('Invalid installer path.');
    if (!Buffer.isBuffer(bytes) || bytes.length > 8 * 1024 * 1024)
      throw new Error('Invalid installer file.');
    total += bytes.length;
    if (total > 32 * 1024 * 1024)
      throw new Error('Installer inventory is too large.');
  }
  const inventory = inventoryFiles.get('installer.json');
  const metadata = JSON.parse(inventory?.toString() ?? 'null');
  if (
    metadata?.format !== 1 ||
    !metadata.files ||
    typeof metadata.files !== 'object' ||
    Array.isArray(metadata.files) ||
    Object.keys(metadata).toSorted().join(',') !==
      'files,format,manifestSha256,source'
  )
    throw new Error('Invalid installer inventory.');
  for (const required of [
    'install.mjs',
    'operation.mjs',
    'files.mjs',
    'release.mjs',
    'verify.mjs',
    'smoke.mjs',
    'configuration-files.json',
    'release.json',
    'release.sigstore.json',
    ...configurationFiles.map((name) => `templates/${name}`),
    ...configurationFiles.map((name) => `configuration/${name}`),
  ])
    if (!inventoryFiles.has(required))
      throw new Error('Installer bundle is incomplete.');
  const files = new Map(inventoryFiles);
  files.delete('installer.json');
  if (
    Object.keys(metadata.files).toSorted(comparePaths).join('\n') !==
      [...files.keys()].toSorted(comparePaths).join('\n') ||
    [...files].some(([path, bytes]) => metadata.files[path] !== sha256(bytes))
  )
    throw new Error('Installer content differs from its signed inventory.');
  const bytes = files.get('release.json');
  const parsed = readRelease(bytes);
  if (
    metadata.manifestSha256 !== expectedDigest ||
    parsed.current.digest !== expectedDigest ||
    metadata.source !== parsed.current.source
  )
    throw new Error(
      'The installer does not bind the independently selected release manifest.',
    );
  return { ...parsed, files, inventory };
}

/** The archive itself must be verified with trusted Cosign BEFORE extraction. */
export function readInstallerBundle(directory, expectedDigest) {
  const bundle = readInstallerFiles(directory);
  return {
    ...validateInstallerInventory(bundle.files, expectedDigest),
    directory: bundle.directory,
  };
}
