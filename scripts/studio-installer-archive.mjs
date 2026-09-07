import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import configurationFiles from '../apps/studio/deployment/installer/configuration-files.json' with { type: 'json' };
import {
  readRelease,
  sha256,
} from '../apps/studio/deployment/installer/release.mjs';

const block = 512;
const valid = (path) =>
  path.split('/').every((part) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part));
const required = [
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
];
function octal(value, length) {
  return `${value.toString(8).padStart(length - 1, '0')}\0`;
}
function field(header, offset, length, value) {
  Buffer.from(value).copy(
    header,
    offset,
    0,
    Math.min(length, Buffer.byteLength(value)),
  );
}
function entry(path, bytes) {
  if (
    !valid(path) ||
    Buffer.byteLength(path) > 100 ||
    bytes.length > 8 * 1024 * 1024
  )
    throw new Error('Invalid installer archive entry.');
  const header = Buffer.alloc(block);
  field(header, 0, 100, path);
  field(header, 100, 8, octal(0o600, 8));
  field(header, 108, 8, octal(0, 8));
  field(header, 116, 8, octal(0, 8));
  field(header, 124, 12, octal(bytes.length, 12));
  field(header, 136, 12, octal(0, 12));
  header.fill(0x20, 148, 156);
  header[156] = 48;
  field(header, 257, 6, 'ustar\0');
  field(header, 263, 2, '00');
  const sum = [...header].reduce((n, byte) => n + byte, 0);
  field(header, 148, 8, octal(sum, 8));
  return Buffer.concat([
    header,
    bytes,
    Buffer.alloc((block - (bytes.length % block)) % block),
  ]);
}
function files(root, path = '') {
  const out = new Map();
  for (const name of readdirSync(join(root, path)).toSorted()) {
    const item = path ? `${path}/${name}` : name;
    const info = lstatSync(join(root, item));
    if (info.isSymbolicLink() || !valid(item) || item.split('/').length > 5)
      throw new Error('Invalid installer path.');
    if (info.isDirectory())
      for (const [child, bytes] of files(root, item)) out.set(child, bytes);
    else if (info.isFile()) out.set(item, readFileSync(join(root, item)));
    else throw new Error('Invalid installer path.');
  }
  return out;
}
export function buildInstallerArchive({ directory, source, output }) {
  if (!/^[a-f0-9]{40}$/.test(source))
    throw new Error('Installer archive requires an exact source commit.');
  const root = resolve(directory);
  const inventory = files(root);
  inventory.delete('installer.json');
  for (const name of required)
    if (!inventory.has(name))
      throw new Error(`Installer archive is incomplete: ${name}`);
  const manifest = readRelease(inventory.get('release.json'));
  if (manifest.current.source !== source)
    throw new Error('Installer archive source differs from release manifest.');
  const metadata = Buffer.from(
    `${JSON.stringify({ format: 1, source, manifestSha256: manifest.current.digest, files: Object.fromEntries([...inventory].map(([name, bytes]) => [name, sha256(bytes)])) })}\n`,
  );
  inventory.set('installer.json', metadata);
  const bytes = Buffer.concat(
    [...inventory]
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([name, body]) => entry(name, body))
      .concat(Buffer.alloc(block * 2)),
  );
  if (output) writeFileSync(output, bytes, { mode: 0o600 });
  return {
    bytes,
    sha256: sha256(bytes),
    source,
    manifestSha256: manifest.current.digest,
    entries: [...inventory.keys()].toSorted(),
  };
}
export function readInstallerArchive(bytes, expectedManifestSha256) {
  const entries = new Map();
  let offset = 0;
  while (offset + block <= bytes.length) {
    const header = bytes.subarray(offset, offset + block);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, '');
    const size = Number.parseInt(
      header.subarray(124, 136).toString().replace(/\0.*$/, ''),
      8,
    );
    if (
      !valid(name) ||
      header[156] !== 48 ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      entries.has(name)
    )
      throw new Error('Invalid installer archive.');
    const body = bytes.subarray(offset + block, offset + block + size);
    if (body.length !== size) throw new Error('Truncated installer archive.');
    entries.set(name, body);
    offset += block + Math.ceil(size / block) * block;
  }
  const metadata = JSON.parse(
    entries.get('installer.json')?.toString() ?? 'null',
  );
  if (
    !metadata ||
    metadata.format !== 1 ||
    metadata.manifestSha256 !== expectedManifestSha256 ||
    !/^[a-f0-9]{40}$/.test(metadata.source)
  )
    throw new Error('Installer archive manifest binding refused.');
  for (const name of required)
    if (!entries.has(name)) throw new Error('Installer archive is incomplete.');
  const manifest = readRelease(entries.get('release.json'));
  if (
    manifest.current.digest !== expectedManifestSha256 ||
    manifest.current.source !== metadata.source
  )
    throw new Error('Installer archive manifest binding refused.');
  entries.delete('installer.json');
  if (
    Object.keys(metadata.files).toSorted().join('\n') !==
      [...entries.keys()].toSorted().join('\n') ||
    [...entries].some(([name, body]) => metadata.files[name] !== sha256(body))
  )
    throw new Error('Installer archive content differs from inventory.');
  return { entries, metadata, manifest };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [directory, source, output] = process.argv.slice(2);
  if (!directory || !source || !output)
    throw new Error(
      'Usage: studio-installer-archive <bundle-directory> <source-commit> <output.tar>',
    );
  process.stdout.write(
    `${JSON.stringify(buildInstallerArchive({ directory, source, output }))}\n`,
  );
}
