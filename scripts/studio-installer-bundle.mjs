import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import configurationFiles from '../apps/studio/deployment/installer/configuration-files.json' with { type: 'json' };
import registryConfigurationFiles from '../apps/studio/deployment/installer/registry-configuration-files.json' with { type: 'json' };
import { readRelease } from '../apps/studio/deployment/installer/release.mjs';
import { renderDeploymentTemplate } from '../apps/studio/server/src/deployment/configure.ts';
import { renderRegistryDeploymentTemplate } from '../apps/template-registry/src/deployment/configure.ts';
import { readCommittedFile } from './studio-committed-file.mjs';
import { buildInstallerArchive } from './studio-installer-archive.mjs';

const prefix = 'apps/studio/deployment/installer/';

/** Pack the admitted checkout's complete installer and public deployment bytes.
 * Signature authentication belongs to the publisher's mandatory verification
 * gate. No configure command executes and no secret configuration is generated. */
export function buildStudioInstaller({ candidate, release, signature }) {
  const manifest = readRelease(release);
  if (candidate.commit !== manifest.current.source)
    throw new Error('Installer source differs from its release manifest.');
  if (
    !Buffer.isBuffer(signature) ||
    !signature.length ||
    signature.length > 8 * 1024 * 1024
  )
    throw new Error('Installer requires its exact release signature bundle.');
  const committedInventory = readCommittedFile(
    candidate,
    `${prefix}configuration-files.json`,
  );
  if (
    !isDeepStrictEqual(
      JSON.parse(committedInventory.toString()),
      configurationFiles,
    )
  )
    throw new Error(
      'Installer inventory differs from the executing release tools.',
    );
  const directory = mkdtempSync(
    join(tmpdir(), 'studio-installer-preparation-'),
  );
  function stage(name, bytes) {
    if (
      !name
        .split('/')
        .every((part) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part))
    )
      throw new Error('Invalid committed installer path.');
    const path = join(directory, name);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
  }
  try {
    for (const file of candidate.files.filter(({ path }) =>
      path.startsWith(prefix),
    ))
      stage(
        file.path.slice(prefix.length),
        readCommittedFile(candidate, file.path),
      );
    for (const name of configurationFiles) {
      const bytes = readCommittedFile(candidate, `apps/studio/${name}`);
      stage(`templates/${name}`, bytes);
      stage(`configuration/${name}`, renderDeploymentTemplate(name, bytes));
    }
    for (const name of registryConfigurationFiles) {
      const bytes = readCommittedFile(
        candidate,
        `apps/template-registry/deployment/${name}`,
      );
      stage(`registry-templates/${name}`, bytes);
      stage(
        `registry-configuration/${name}`,
        renderRegistryDeploymentTemplate(name, bytes),
      );
    }
    stage('release.json', release);
    stage('release.sigstore.json', signature);
    return buildInstallerArchive({ directory, source: candidate.commit });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
