import { spawn } from 'node:child_process';

import {
  IMAGE_REPOSITORIES,
  sha256,
} from '../apps/studio/deployment/installer/release.mjs';
import { deriveImageEvidence } from './studio-image-evidence.mjs';

const OUTPUT_LIMIT = 1024 * 1024;
const DIAGNOSTIC_LIMIT = 64 * 1024;
const TIMEOUT_MS = 30_000;
const PLATFORMS = new Set(['linux/amd64', 'linux/arm64']);

function imageReference(name, reference) {
  const repository = IMAGE_REPOSITORIES[name];
  if (!repository || typeof reference !== 'string') {
    throw new Error('Image reference is outside the controlled repositories.');
  }
  const at = reference.lastIndexOf('@');
  const digest = at === -1 ? '' : reference.slice(at + 1);
  if (
    reference.slice(0, at) !== repository ||
    !/^sha256:[a-f0-9]{64}$/.test(digest)
  ) {
    throw new Error('Image reference is outside the controlled repositories.');
  }
  return { repository, digest };
}

function parse(bytes, message) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(message);
  }
}

function descriptorDigest(value, message) {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value))
    throw new Error(message);
  return value;
}

function craneRead(executable, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks = [];
    let size = 0;
    let diagnosticSize = 0;
    let settled = false;
    let timer;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const terminate = () => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    };
    timer = setTimeout(() => {
      terminate();
      settle(reject, new Error('Registry evidence command timed out.'));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > OUTPUT_LIMIT) {
        terminate();
        settle(
          reject,
          new Error('Registry evidence command exceeded its output bound.'),
        );
      } else chunks.push(chunk);
    });
    // Drain diagnostics so an untrusted registry/client error cannot block the child;
    // public errors deliberately remain fixed and contain no registry output.
    child.stderr.on('data', (chunk) => {
      diagnosticSize += chunk.length;
      if (diagnosticSize > DIAGNOSTIC_LIMIT) {
        terminate();
        settle(
          reject,
          new Error('Registry evidence command exceeded its diagnostic bound.'),
        );
      }
    });
    child.on('error', () =>
      settle(reject, new Error('Registry evidence command failed.')),
    );
    child.on('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        settle(reject, new Error('Registry evidence command failed.'));
        return;
      }
      settle(resolve, Buffer.concat(chunks));
    });
  });
}

/** Read immutable manifest and config bytes with crane without reserializing them. */
export async function acquireImageEvidence({
  name,
  reference,
  crane = 'crane',
  timeoutMs = TIMEOUT_MS,
}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error('Invalid registry evidence timeout.');
  const { repository, digest } = imageReference(name, reference);
  const manifestBytes = await craneRead(
    crane,
    ['manifest', reference],
    timeoutMs,
  );
  if (`sha256:${sha256(manifestBytes)}` !== digest)
    throw new Error('Registry index bytes do not match the requested digest.');
  const index = parse(manifestBytes, 'Invalid registry image index.');
  if (!Array.isArray(index.manifests))
    throw new Error('Invalid registry image index.');
  const children = index.manifests.filter((entry) =>
    PLATFORMS.has(`${entry?.platform?.os}/${entry?.platform?.architecture}`),
  );
  if (children.length !== PLATFORMS.size)
    throw new Error('Registry image is missing a required platform.');
  const blobs = new Map();
  for (const child of children) {
    const childDigest = descriptorDigest(
      child.digest,
      'Invalid registry child manifest.',
    );
    const childBytes = await craneRead(
      crane,
      ['manifest', `${repository}@${childDigest}`],
      timeoutMs,
    );
    blobs.set(childDigest, childBytes);
    const manifest = parse(childBytes, 'Invalid registry child manifest.');
    const configDigest = descriptorDigest(
      manifest.config?.digest,
      'Invalid registry image configuration.',
    );
    const configBytes = await craneRead(
      crane,
      ['blob', `${repository}@${configDigest}`],
      timeoutMs,
    );
    blobs.set(configDigest, configBytes);
  }
  return deriveImageEvidence({
    name,
    reference: repository,
    manifestBytes,
    blobs,
  });
}
