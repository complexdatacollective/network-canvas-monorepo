import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { sha256 } from '../apps/studio/deployment/installer/release.mjs';

const TOOL_NAMES = ['cosign', 'crane', 'syft'];
const CHECKSUM_LIMIT = 32 * 1024;
const ASSET_LIMIT = 160 * 1024 * 1024;
const EXPANDED_ARCHIVE_LIMIT = 128 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const EXECUTION_TIMEOUT_MS = 10_000;
const HASH = /^[a-f0-9]{64}$/;
const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const manifest = JSON.parse(
  readFileSync(new URL('./studio-release-tools.json', import.meta.url), 'utf8'),
);

function parseOctal(bytes, message) {
  const text = bytes.toString('ascii').replaceAll('\0', '').trim();
  if (!/^[0-7]+$/.test(text)) throw new Error(message);
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value)) throw new Error(message);
  return value;
}

function tarMembers(archive) {
  let tar;
  try {
    tar = gunzipSync(archive, { maxOutputLength: EXPANDED_ARCHIVE_LIMIT });
  } catch {
    throw new Error('Invalid release tool archive.');
  }
  const members = new Map();
  let offset = 0;
  let ended = false;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      ended = true;
      if (!tar.subarray(offset).every((byte) => byte === 0))
        throw new Error('Invalid release tool archive.');
      break;
    }
    const storedChecksum = parseOctal(
      header.subarray(148, 156),
      'Invalid release tool archive.',
    );
    let calculatedChecksum = 0;
    for (let index = 0; index < header.length; index += 1)
      calculatedChecksum += index >= 148 && index < 156 ? 0x20 : header[index];
    if (storedChecksum !== calculatedChecksum)
      throw new Error('Invalid release tool archive.');
    const text = (start, end) =>
      header.subarray(start, end).toString('utf8').split('\0', 1)[0];
    const name = [text(345, 500), text(0, 100)].filter(Boolean).join('/');
    const type = header[156];
    const size = parseOctal(
      header.subarray(124, 136),
      'Invalid release tool archive.',
    );
    const mode = parseOctal(
      header.subarray(100, 108),
      'Invalid release tool archive.',
    );
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    if (
      !name ||
      name.startsWith('/') ||
      name.split('/').includes('..') ||
      (type !== 0 && type !== 0x30) ||
      members.has(name) ||
      bodyEnd > tar.length
    )
      throw new Error('Unsafe release tool archive member.');
    members.set(name, {
      bytes: Buffer.from(tar.subarray(bodyStart, bodyEnd)),
      executable: (mode & 0o111) !== 0,
    });
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
  if (!ended) throw new Error('Invalid release tool archive.');
  return members;
}

function extractExecutable(bytes, tool) {
  if (tool.archive === 'binary') return Buffer.from(bytes);
  if (tool.archive !== 'tar.gz' || !tool.members)
    throw new Error('Invalid release tool manifest.');
  const members = tarMembers(bytes);
  if (
    [...members.keys()].toSorted(compare).join('\n') !==
    Object.keys(tool.members).toSorted(compare).join('\n')
  )
    throw new Error('Unexpected release tool archive inventory.');
  for (const [name, executable] of Object.entries(tool.members))
    if (members.get(name).executable !== executable)
      throw new Error('Unexpected release tool archive executable.');
  const executable = members.get(tool.name);
  if (!executable?.executable)
    throw new Error('Missing release tool executable.');
  return executable.bytes;
}

function officialUrl(url, owner, version, asset) {
  return (
    url === `https://github.com/${owner}/releases/download/v${version}/${asset}`
  );
}

function validateTool(tool, name) {
  if (
    !tool ||
    tool.name !== name ||
    typeof tool.version !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(tool.version) ||
    !HASH.test(tool.sha256) ||
    !HASH.test(tool.executableSha256) ||
    !HASH.test(tool.checksumSha256) ||
    !officialUrl(tool.url, tool.owner, tool.version, tool.asset) ||
    !officialUrl(tool.checksumUrl, tool.owner, tool.version, tool.checksumAsset)
  )
    throw new Error('Invalid release tool manifest.');
}

function normalizedManifest(value, platform) {
  const tools = value?.platforms?.[platform];
  if (
    value?.format !== 1 ||
    !tools ||
    Object.keys(tools).toSorted().join('\n') !== TOOL_NAMES.join('\n')
  )
    throw new Error('Unsupported release tool platform.');
  return Object.fromEntries(
    TOOL_NAMES.map((name) => {
      const owner =
        name === 'cosign'
          ? 'sigstore/cosign'
          : name === 'syft'
            ? 'anchore/syft'
            : 'google/go-containerregistry';
      const checksumAsset =
        name === 'cosign'
          ? 'cosign_checksums.txt'
          : name === 'syft'
            ? `syft_${tools[name].version}_checksums.txt`
            : 'checksums.txt';
      const tool = { ...tools[name], name, owner, checksumAsset };
      validateTool(tool, name);
      return [name, tool];
    }),
  );
}

async function fetchBytes(url, maximum) {
  let response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      headers: { Accept: 'application/octet-stream' },
    });
  } catch {
    throw new Error('Release tool download failed.');
  }
  if (!response.ok) throw new Error('Release tool download failed.');
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximum)
    throw new Error('Release tool download exceeded its size bound.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Release tool download failed.');
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      throw new Error('Release tool download exceeded its size bound.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function checksumAuthenticates(checksums, tool) {
  if (sha256(checksums) !== tool.checksumSha256)
    throw new Error('Release tool checksum source is not authentic.');
  const lines = checksums.toString('utf8').split(/\r?\n/);
  if (!lines.includes(`${tool.sha256}  ${tool.asset}`))
    throw new Error('Release tool checksum source does not bind its asset.');
}

function verifyVersion(name, tool, path, platform, run) {
  let output;
  try {
    output = run(path, ['version'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: EXECUTION_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      env: { ...process.env, SYFT_CHECK_FOR_APP_UPDATE: 'false' },
    });
  } catch {
    throw new Error('Release tool version verification failed.');
  }
  const reportedPlatform =
    platform === 'linux/x64' ? 'linux/amd64' : 'darwin/arm64';
  const valid =
    name === 'cosign'
      ? output.includes(`GitVersion:    v${tool.version}`) &&
        output.includes(`Platform:      ${reportedPlatform}`)
      : name === 'syft'
        ? output.includes(`Version:       ${tool.version}`) &&
          output.includes(`Platform:      ${reportedPlatform}`)
        : output.trim() === tool.version;
  if (!valid) throw new Error('Release tool reported an unexpected version.');
}

function privateParent(parentDirectory) {
  const metadata = lstatSync(parentDirectory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink())
    throw new Error('Release tool parent directory is invalid.');
}

export async function installPinnedReleaseTools(
  { parentDirectory, platform, toolManifest },
  { download = fetchBytes, run = execFileSync } = {},
) {
  privateParent(parentDirectory);
  const tools = normalizedManifest(toolManifest, platform);
  const directory = mkdtempSync(join(parentDirectory, 'studio-release-tools-'));
  chmodSync(directory, 0o700);
  try {
    const paths = {};
    for (const name of TOOL_NAMES) {
      const tool = tools[name];
      const checksums = await download(tool.checksumUrl, CHECKSUM_LIMIT);
      if (!Buffer.isBuffer(checksums) || checksums.length > CHECKSUM_LIMIT)
        throw new Error('Release tool download exceeded its size bound.');
      checksumAuthenticates(checksums, tool);
      const asset = await download(tool.url, ASSET_LIMIT);
      if (!Buffer.isBuffer(asset) || asset.length > ASSET_LIMIT)
        throw new Error('Release tool download exceeded its size bound.');
      if (sha256(asset) !== tool.sha256)
        throw new Error('Release tool asset is not authentic.');
      const executable = extractExecutable(asset, tool);
      if (sha256(executable) !== tool.executableSha256)
        throw new Error('Release tool executable is not authentic.');
      const path = join(directory, name);
      writeFileSync(path, executable, { flag: 'wx', mode: 0o700 });
      chmodSync(path, 0o700);
      if (sha256(readFileSync(path)) !== tool.executableSha256)
        throw new Error('Release tool executable readback failed.');
      verifyVersion(name, tool, path, platform, run);
      paths[name] = path;
    }
    return { directory, paths };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function installStudioReleaseTools(
  parentDirectory = tmpdir(),
  options,
) {
  return installPinnedReleaseTools(
    {
      parentDirectory,
      platform: `${process.platform}/${process.arch}`,
      toolManifest: manifest,
    },
    options,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3)
    throw new Error('Usage: node scripts/studio-release-tools.mjs [parent]');
  const installed = await installStudioReleaseTools(process.argv[2]);
  process.stdout.write(`${installed.directory}\n`);
}
