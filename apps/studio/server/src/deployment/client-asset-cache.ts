import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  chmod,
  copyFile,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  symlink,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';

const MAX_FILES = 100_000;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;
const DIGEST = /^[a-f0-9]{64}$/;
const GENERATION = /^generations\/([a-f0-9]{64})$/;
const HASHED_NAME = /-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*$/;

type Asset = { path: string; sha256: string; size: number };
type Inventory = { version: 1; files: Asset[] };

export type VerifiedClientAssetCache = Readonly<{
  /** An immutable generation, never the mutable current symlink. */
  root: string;
  generation: string;
  files: number;
}>;

function invalid(): never {
  throw new Error('Retained client assets are invalid.');
}

function missing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function isHashedClientAssetPath(path: string): boolean {
  const parts = path.split('/');
  return (
    path.length <= 1024 &&
    parts.length <= 16 &&
    parts.every((part) => /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(part)) &&
    HASHED_NAME.test(parts.at(-1) ?? '')
  );
}

function ordered(files: Asset[]): Asset[] {
  return files.toSorted((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
}

function bytes(value: Inventory): string {
  return `${JSON.stringify({
    version: value.version,
    files: value.files.map(({ path, size, sha256 }) => ({
      path,
      size,
      sha256,
    })),
  })}\n`;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function fileDigest(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

/** Every path is enumerated; symlinks and untracked bytes cannot be hidden. */
async function inventory(root: string): Promise<Inventory> {
  if (!(await lstat(root)).isDirectory()) invalid();
  const files: Asset[] = [];
  async function visit(directory: string, prefix = ''): Promise<void> {
    for (const name of await readdir(directory)) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (path.length > 1024 || path.split('/').length > 16) invalid();
      const absolute = join(directory, name);
      const info = await lstat(absolute);
      if (info.isDirectory()) {
        if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(name)) invalid();
        await visit(absolute, path);
      } else {
        if (
          !info.isFile() ||
          !isHashedClientAssetPath(path) ||
          info.size > MAX_FILE_BYTES ||
          files.length >= MAX_FILES
        )
          invalid();
        files.push({
          path,
          size: info.size,
          sha256: await fileDigest(absolute),
        });
      }
    }
  }
  await visit(root);
  if (files.length === 0) invalid();
  return { version: 1, files: ordered(files) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseInventory(text: string): Inventory {
  const value: unknown = JSON.parse(text);
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    value.version !== 1 ||
    !Array.isArray(value.files) ||
    value.files.length === 0 ||
    value.files.length > MAX_FILES
  )
    invalid();
  const files: Asset[] = [];
  const seen = new Set<string>();
  for (const item of value.files) {
    if (
      !isRecord(item) ||
      Object.keys(item).length !== 3 ||
      typeof item.path !== 'string' ||
      !isHashedClientAssetPath(item.path) ||
      typeof item.sha256 !== 'string' ||
      !DIGEST.test(item.sha256) ||
      typeof item.size !== 'number' ||
      !Number.isSafeInteger(item.size) ||
      item.size < 0 ||
      item.size > MAX_FILE_BYTES ||
      seen.has(item.path)
    )
      invalid();
    seen.add(item.path);
    files.push({ path: item.path, size: item.size, sha256: item.sha256 });
  }
  const result: Inventory = { version: 1, files: ordered(files) };
  if (bytes(result) !== text) invalid();
  return result;
}

async function generationInventory(root: string, generation: string) {
  if (!GENERATION.test(generation)) invalid();
  if (!(await lstat(join(root, 'generations'))).isDirectory()) invalid();
  const directory = join(root, generation);
  if (!(await lstat(directory)).isDirectory()) invalid();
  const entries = await readdir(directory);
  if (
    entries.length !== 2 ||
    !entries.includes('assets') ||
    !entries.includes('manifest.json')
  )
    invalid();
  const path = join(directory, 'manifest.json');
  const info = await lstat(path);
  if (!info.isFile() || info.size > MAX_MANIFEST_BYTES) invalid();
  const text = await readFile(path, 'utf8');
  if (generation !== `generations/${digest(text)}`) invalid();
  const declared = parseInventory(text);
  if (bytes(await inventory(join(directory, 'assets'))) !== bytes(declared))
    invalid();
  return declared;
}

async function currentInventory(root: string) {
  if (!(await lstat(root)).isDirectory()) invalid();
  const entries = await readdir(root);
  if (
    entries.some((name) => !['.lock', 'generations', 'current'].includes(name))
  )
    invalid();
  if (
    entries.includes('generations') &&
    !(await lstat(join(root, 'generations'))).isDirectory()
  )
    invalid();
  const pointer = join(root, 'current');
  try {
    if (!(await lstat(pointer)).isSymbolicLink()) invalid();
  } catch (error) {
    if (!missing(error)) throw error;
    // A killed first writer can leave its private staging/generation directory.
    // No complete current generation means no cache has ever been admitted.
    return undefined;
  }
  const generation = await readlink(pointer);
  return { generation, inventory: await generationInventory(root, generation) };
}

function includesSource(retained: Inventory, source: Inventory): void {
  const existing = new Map(retained.files.map((file) => [file.path, file]));
  for (const file of source.files) {
    const before = existing.get(file.path);
    if (!before || before.sha256 !== file.sha256 || before.size !== file.size)
      invalid();
  }
}

/** Fails before web admission; the returned directory stays immutable. */
export async function verifyClientAssetCache(
  root: string,
  source?: string,
): Promise<VerifiedClientAssetCache> {
  const current = await currentInventory(root);
  if (!current) invalid();
  if (source) includesSource(current.inventory, await inventory(source));
  return Object.freeze({
    root: join(root, current.generation),
    generation: current.generation,
    files: current.inventory.files.length,
  });
}

async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function syncDirectories(root: string): Promise<void> {
  for (const item of await readdir(root, { withFileTypes: true }))
    if (item.isDirectory()) await syncDirectories(join(root, item.name));
  await syncDirectory(root);
}

/** Only the operator entrypoint calls this writer, under its kernel flock. */
export async function retainClientAssets(
  source: string,
  root: string,
): Promise<VerifiedClientAssetCache> {
  const incoming = await inventory(source);
  await mkdir(root, { recursive: true, mode: 0o755 });
  const before = await currentInventory(root);
  const union = new Map(
    (before?.inventory.files ?? []).map((file) => [file.path, file]),
  );
  for (const file of incoming.files) {
    const previous = union.get(file.path);
    if (
      previous &&
      (previous.sha256 !== file.sha256 || previous.size !== file.size)
    )
      throw new Error('An immutable client asset URL has different bytes.');
    union.set(file.path, file);
  }
  const merged: Inventory = { version: 1, files: ordered([...union.values()]) };
  if (merged.files.length > MAX_FILES) invalid();
  const manifest = bytes(merged);
  if (Buffer.byteLength(manifest) > MAX_MANIFEST_BYTES) invalid();
  const generation = `generations/${digest(manifest)}`;
  if (before?.generation === generation)
    return verifyClientAssetCache(root, source);
  const generations = join(root, 'generations');
  await mkdir(generations, { recursive: true, mode: 0o755 });
  if (!(await lstat(generations)).isDirectory()) invalid();
  const destination = join(root, generation);
  let destinationExists = false;
  try {
    await lstat(destination);
    destinationExists = true;
  } catch (error) {
    if (!missing(error)) throw error;
  }
  // A first publication may have died after renaming its complete generation.
  // Reuse only those exact complete bytes; never replace a damaged generation.
  if (
    destinationExists &&
    bytes(await generationInventory(root, generation)) !== manifest
  )
    invalid();
  const staging = await mkdtemp(join(generations, '.pending-'));
  try {
    if (!destinationExists) {
      await mkdir(join(staging, 'assets'));
      const oldFiles = new Set(
        before?.inventory.files.map((file) => file.path),
      );
      for (const file of merged.files) {
        const stagedFile = join(staging, 'assets', file.path);
        await mkdir(dirname(stagedFile), { recursive: true, mode: 0o755 });
        if (before && oldFiles.has(file.path))
          await link(
            join(root, before.generation, 'assets', file.path),
            stagedFile,
          );
        else {
          await copyFile(join(source, file.path), stagedFile);
          await chmod(stagedFile, 0o644);
          const handle = await open(stagedFile, 'r');
          try {
            await handle.sync();
          } finally {
            await handle.close();
          }
        }
      }
      const handle = await open(join(staging, 'manifest.json'), 'wx', 0o644);
      try {
        await handle.writeFile(manifest);
        await handle.sync();
      } finally {
        await handle.close();
      }
      if (bytes(await inventory(join(staging, 'assets'))) !== manifest)
        invalid();
      await chmod(staging, 0o755);
      await syncDirectories(staging);
      await rename(staging, destination);
      // The completed stage moved above. Recreate our private directory only
      // to stage the pointer on the same filesystem before atomic replacement.
      await mkdir(staging, { mode: 0o700 });
    }
    await syncDirectory(generations);
    const pointer = join(staging, 'current');
    await symlink(generation, pointer);
    await rename(pointer, join(root, 'current'));
    await syncDirectory(root);
    return verifyClientAssetCache(root, source);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
