import { randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fsyncSync,
  linkSync,
  openSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  readInstallerFiles,
  validateInstallerInventory,
} from '../apps/studio/deployment/installer/files.mjs';
import {
  readRelease,
  sha256,
} from '../apps/studio/deployment/installer/release.mjs';

const block = 512;
const comparePaths = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;
const valid = (path) =>
  path.split('/').every((part) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part));
const maximumBody = 32 * 1024 * 1024;
const maximumArchive = maximumBody + 1000 * block * 2 + block * 2;

function octal(value, length) {
  return `${value.toString(8).padStart(length - 1, '0')}\0`;
}
function headerFor(path, size) {
  if (
    !valid(path) ||
    Buffer.byteLength(path) > 100 ||
    path.split('/').length > 6 ||
    size > 8 * 1024 * 1024
  )
    throw new Error('Invalid installer archive entry.');
  const header = Buffer.alloc(block);
  header.write(path, 0, 100, 'ascii');
  header.write(octal(0o600, 8), 100, 'ascii');
  header.write(octal(0, 8), 108, 'ascii');
  header.write(octal(0, 8), 116, 'ascii');
  header.write(octal(size, 12), 124, 'ascii');
  header.write(octal(0, 12), 136, 'ascii');
  header.fill(0x20, 148, 156);
  header[156] = 48;
  header.write('ustar\0', 257, 'ascii');
  header.write('00', 263, 'ascii');
  const sum = header.reduce((n, byte) => n + byte, 0);
  header.write(octal(sum, 8), 148, 'ascii');
  return header;
}

/** Link a completely written sibling file into place without replacing any
 * existing artifact or following a destination symlink. Publication reconciles
 * same-release retries before invoking this create-only operation. */
function writeArchive(output, bytes) {
  const parent = dirname(output);
  const temporary = join(parent, `.studio-archive-${randomUUID()}`);
  const descriptor = openSync(
    temporary,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600,
  );
  try {
    try {
      writeFileSync(descriptor, bytes);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    linkSync(temporary, output);
    const directory = openSync(parent, constants.O_RDONLY);
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  } finally {
    unlinkSync(temporary);
  }
}

export function buildInstallerArchive({ directory, source, output }) {
  if (!/^[a-f0-9]{40}$/.test(source))
    throw new Error('Installer archive requires an exact source commit.');
  const inventory = readInstallerFiles(directory).files;
  inventory.delete('installer.json');
  const manifest = readRelease(inventory.get('release.json'));
  if (manifest.current.source !== source)
    throw new Error('Installer archive source differs from release manifest.');
  const metadata = Buffer.from(
    `${JSON.stringify({
      format: 1,
      source,
      manifestSha256: manifest.current.digest,
      files: Object.fromEntries(
        [...inventory]
          .toSorted(([a], [b]) => comparePaths(a, b))
          .map(([name, bytes]) => [name, sha256(bytes)]),
      ),
    })}\n`,
  );
  inventory.set('installer.json', metadata);
  validateInstallerInventory(inventory, manifest.current.digest);
  const bytes = Buffer.concat(
    [...inventory]
      .toSorted(([a], [b]) => comparePaths(a, b))
      .flatMap(([name, body]) => [
        headerFor(name, body.length),
        body,
        Buffer.alloc((block - (body.length % block)) % block),
      ])
      .concat(Buffer.alloc(block * 2)),
  );
  if (output) writeArchive(output, bytes);
  return {
    bytes,
    sha256: sha256(bytes),
    source,
    manifestSha256: manifest.current.digest,
    entries: [...inventory.keys()].toSorted(comparePaths),
  };
}

/** Inspect our canonical USTAR dialect without extracting or executing anything.
 * Authentication of these exact bytes by trusted Cosign remains a separate gate. */
export function readInstallerArchive(bytes, expectedManifestSha256) {
  if (!Buffer.isBuffer(bytes) || bytes.length > maximumArchive)
    throw new Error('Installer inventory is too large.');
  const entries = new Map();
  let offset = 0;
  let total = 0;
  let terminated = false;
  while (offset + block <= bytes.length) {
    const header = bytes.subarray(offset, offset + block);
    if (header.every((byte) => byte === 0)) {
      if (
        offset + block * 2 !== bytes.length ||
        !bytes.subarray(offset + block).every((byte) => byte === 0)
      )
        throw new Error('Invalid installer archive terminator.');
      offset = bytes.length;
      terminated = true;
      break;
    }
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    const encodedSize = header.subarray(124, 136).toString('ascii');
    if (!/^[0-7]{11}\0$/.test(encodedSize))
      throw new Error('Invalid installer archive header.');
    const size = Number.parseInt(encodedSize, 8);
    if (!header.equals(headerFor(name, size)))
      throw new Error('Invalid installer archive header.');
    if (entries.has(name) || entries.size >= 1000)
      throw new Error('Invalid installer archive inventory.');
    const end = offset + block + size;
    const next = offset + block + Math.ceil(size / block) * block;
    if (next > bytes.length) throw new Error('Truncated installer archive.');
    if (!bytes.subarray(end, next).every((byte) => byte === 0))
      throw new Error('Invalid installer archive padding.');
    total += size;
    if (total > maximumBody)
      throw new Error('Installer inventory is too large.');
    entries.set(name, bytes.subarray(offset + block, end));
    offset = next;
  }
  if (!terminated || offset !== bytes.length)
    throw new Error('Invalid installer archive terminator.');
  const validated = validateInstallerInventory(entries, expectedManifestSha256);
  return {
    entries: validated.files,
    metadata: JSON.parse(validated.inventory.toString()),
    manifest: { release: validated.release, current: validated.current },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [directory, source, output, ...extra] = process.argv.slice(2);
  if (!directory || !source || !output || extra.length)
    throw new Error(
      'Usage: studio-installer-archive <bundle-directory> <source-commit> <output.tar>',
    );
  const {
    bytes: _bytes,
    entries: _entries,
    ...metadata
  } = buildInstallerArchive({ directory, source, output });
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
}
