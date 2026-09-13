import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { loadState, readInstallerBundle } from './files.mjs';
import { acceptRelease, signatureArguments } from './release.mjs';

export function command(program, args, options = {}) {
  return execFileSync(program, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 300_000,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  });
}

/** All trust/replay/hop refusals occur before Docker pulls or any image runs. */
export function verifyOperation(
  { bundleDirectory, controlDirectory, expectedDigest, recovery = false },
  run = command,
) {
  const bundle = readInstallerBundle(bundleDirectory, expectedDigest);
  run(
    'cosign',
    signatureArguments(
      'blob',
      join(bundle.directory, 'release.json'),
      join(bundle.directory, 'release.sigstore.json'),
    ),
  );
  const previous = loadState(controlDirectory);
  const accepted = acceptRelease(bundle, previous, {
    expectedDigest,
    recovery,
  });
  for (const image of Object.values(bundle.release.images))
    run('cosign', signatureArguments('image', image.reference));
  return { bundle, previous, accepted };
}

/** Match the local image's actual bytes to the signed per-platform identity. */
export function pullVerifiedImages(bundle, run = command) {
  const result = {};
  for (const [name, image] of Object.entries(bundle.release.images)) {
    run('docker', ['pull', image.reference]);
    const info = JSON.parse(
      run('docker', [
        'image',
        'inspect',
        '--format',
        '{{json .}}',
        image.reference,
      ]),
    );
    const platform = `${info.Os}/${info.Architecture}`;
    if (
      !image.configurations[platform] ||
      info.Id !== image.configurations[platform]
    )
      throw new Error(
        'Pulled image bytes do not match the signed platform configuration.',
      );
    result[name] = info.Id;
  }
  return result;
}
