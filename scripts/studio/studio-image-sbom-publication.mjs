import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  IMAGE_REPOSITORIES,
  RELEASE_IDENTITY,
  RELEASE_ISSUER,
} from '../../apps/studio/deployment/installer/release.mjs';
import { command } from '../../apps/studio/deployment/installer/verify.mjs';
import { validateCycloneDx } from './studio-image-evidence.mjs';

const IMAGE_NAMES = Object.keys(IMAGE_REPOSITORIES);
const MAX_SBOM_BYTES = 40 * 1024 * 1024;

function execute(run, executable, args, options) {
  return run(executable, args, {
    cwd: options.cwd,
    timeout: options.timeoutMs,
    killSignal: 'SIGKILL',
  });
}

function stage(directory, name, bytes) {
  const path = join(directory, name);
  writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

function verificationArguments(reference, policy) {
  return [
    'verify-attestation',
    reference,
    '--type',
    'cyclonedx',
    '--policy',
    policy,
    '--certificate-identity',
    RELEASE_IDENTITY,
    '--certificate-oidc-issuer',
    RELEASE_ISSUER,
  ];
}

function exactPolicy(bytes) {
  let predicate;
  try {
    predicate = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('Studio image SBOM publication is not configured.');
  }
  return Buffer.from(
    `${JSON.stringify({
      predicateType: 'https://cyclonedx.org/bom',
      predicate,
    })}\n`,
  );
}

/** Attach each complete two-platform CycloneDX document to the immutable image
 * index it describes. A retained exact attestation is reused; every new write
 * is authenticated from the registry with a policy containing the exact
 * predicate before canonical source tags may be promoted. */
export async function publishStudioImageSboms(
  { images, sboms },
  {
    cosign = 'cosign',
    run = command,
    timeoutMs = 300_000,
    verify = execute,
  } = {},
) {
  if (
    !images ||
    !(sboms instanceof Map) ||
    Object.keys(images).toSorted().join('\n') !==
      IMAGE_NAMES.toSorted().join('\n') ||
    sboms.size !== IMAGE_NAMES.length ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    typeof verify !== 'function'
  )
    throw new Error('Studio image SBOM publication is not configured.');

  const directory = mkdtempSync(join(tmpdir(), 'studio-image-sbom-'));
  chmodSync(directory, 0o700);
  try {
    for (const name of IMAGE_NAMES) {
      const image = images[name];
      const bytes = sboms.get(name);
      if (
        !Buffer.isBuffer(bytes) ||
        !bytes.length ||
        bytes.length > MAX_SBOM_BYTES
      )
        throw new Error('Studio image SBOM publication is not configured.');
      validateCycloneDx({
        image: image?.reference,
        configurations: image?.configurations,
        bytes,
      });
      const predicate = stage(directory, `${name}.cdx.json`, bytes);
      const policy = stage(directory, `${name}.policy.cue`, exactPolicy(bytes));
      const options = { cwd: directory, timeoutMs };
      let retained = false;
      try {
        await verify(
          run,
          cosign,
          verificationArguments(image.reference, policy),
          options,
        );
        retained = true;
      } catch {
        // Absence is established by the same authenticated exact-predicate
        // query used below. The following write is still read back before use.
      }
      if (!retained) {
        execute(
          run,
          cosign,
          [
            'attest',
            '--yes',
            '--type',
            'cyclonedx',
            '--predicate',
            predicate,
            image.reference,
          ],
          options,
        );
        await verify(
          run,
          cosign,
          verificationArguments(image.reference, policy),
          options,
        );
      }
      // The files are private and remain byte-identical while Cosign reads
      // them. This also catches an unexpected tool that rewrites its inputs.
      if (
        !readFileSync(predicate).equals(bytes) ||
        !readFileSync(policy).equals(exactPolicy(bytes))
      )
        throw new Error(
          'Studio image SBOM publication changed local evidence.',
        );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
