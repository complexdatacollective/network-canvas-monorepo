import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  readRelease,
  signatureArguments,
} from '../apps/studio/deployment/installer/release.mjs';
import { command } from '../apps/studio/deployment/installer/verify.mjs';
import { readInstallerArchive } from './studio-installer-archive.mjs';

function artifact(artifacts, name) {
  const bytes = artifacts.get(name);
  if (!Buffer.isBuffer(bytes) || !bytes.length)
    throw new Error('Publication artifacts are invalid.');
  return bytes;
}

function bindArtifacts(artifacts) {
  if (!(artifacts instanceof Map))
    throw new Error('Publication artifacts are invalid.');
  const releaseBytes = artifact(artifacts, 'release.json');
  const releaseBundle = artifact(artifacts, 'release.sigstore.json');
  const installerBytes = artifact(artifacts, 'installer.tar');
  const installerBundle = artifact(artifacts, 'installer.sigstore.json');
  let manifest;
  let archive;
  try {
    manifest = readRelease(releaseBytes);
    archive = readInstallerArchive(installerBytes, manifest.current.digest);
  } catch {
    throw new Error('Publication artifacts are invalid.');
  }
  if (
    !archive.entries.get('release.json')?.equals(releaseBytes) ||
    !archive.entries.get('release.sigstore.json')?.equals(releaseBundle)
  )
    throw new Error('Publication artifacts are invalid.');
  return {
    installerBundle,
    installerBytes,
    manifest,
    releaseBundle,
    releaseBytes,
  };
}

function stage(directory, name, bytes) {
  const path = join(directory, name);
  writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

/**
 * Verify publisher artifacts using the installer’s fixed Cosign trust policy.
 * The signed blobs are staged only in a private temporary directory, then
 * removed whether verification succeeds or fails.
 */
export function verifyStudioPublication(
  artifacts,
  { cosign = 'cosign', run = command } = {},
) {
  const bound = bindArtifacts(artifacts);
  const directory = mkdtempSync(join(tmpdir(), 'studio-publication-verify-'));
  chmodSync(directory, 0o700);
  try {
    const release = stage(directory, 'release.json', bound.releaseBytes);
    const releaseBundle = stage(
      directory,
      'release.sigstore.json',
      bound.releaseBundle,
    );
    const installer = stage(directory, 'installer.tar', bound.installerBytes);
    const installerBundle = stage(
      directory,
      'installer.sigstore.json',
      bound.installerBundle,
    );
    try {
      const verify = (args) => run(cosign, args, { killSignal: 'SIGKILL' });
      verify(signatureArguments('blob', release, releaseBundle));
      verify(signatureArguments('blob', installer, installerBundle));
      for (const image of Object.values(bound.manifest.release.images))
        verify(signatureArguments('image', image.reference));
    } catch {
      throw new Error('Publication signature verification failed.');
    }
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}
