import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import configurationFiles from '../../apps/studio/deployment/installer/configuration-files.json' with { type: 'json' };
import registryConfigurationFiles from '../../apps/studio/deployment/installer/registry-configuration-files.json' with { type: 'json' };
import { buildInstallerArchive } from '../studio-installer-archive.mjs';
import { releasedDistribution } from './studio-release.mjs';

export function installerFixture(
  t,
  reverse = false,
  release = releasedDistribution(),
) {
  const root = mkdtempSync(join(tmpdir(), 'studio-installer-archive-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, 'bundle');
  mkdirSync(directory);
  const contents = new Map();
  for (const name of [
    'install.mjs',
    'operation.mjs',
    'files.mjs',
    'release.mjs',
    'verify.mjs',
    'smoke.mjs',
    'configuration-files.json',
    'registry-configuration-files.json',
  ])
    contents.set(
      name,
      readFileSync(
        new URL(
          `../../apps/studio/deployment/installer/${name}`,
          import.meta.url,
        ),
      ),
    );
  contents.set('release.sigstore.json', Buffer.from('{}'));
  contents.set('release.json', Buffer.from(JSON.stringify(release.value)));
  for (const name of configurationFiles) {
    const bytes = readFileSync(
      new URL(`../../apps/studio/${name}`, import.meta.url),
    );
    contents.set(`templates/${name}`, bytes);
    // Generated configuration bytes are synthetic; no template is executed.
    contents.set(
      `configuration/${name}`,
      Buffer.from(`# local fixture ${name}\n`),
    );
  }
  for (const name of registryConfigurationFiles) {
    const bytes = readFileSync(
      new URL(
        `../../apps/template-registry/deployment/${name}`,
        import.meta.url,
      ),
    );
    contents.set(`registry-templates/${name}`, bytes);
    contents.set(
      `registry-configuration/${name}`,
      Buffer.from(`# local Registry fixture ${name}\n`),
    );
  }
  contents.set('Z-order', Buffer.from('last uppercase'));
  contents.set('a-order', Buffer.from('first lowercase'));
  for (const [name, bytes] of reverse ? [...contents].reverse() : contents) {
    mkdirSync(dirname(join(directory, name)), { recursive: true });
    writeFileSync(join(directory, name), bytes);
  }
  const build = () =>
    buildInstallerArchive({ directory, source: release.current.source });
  return {
    root,
    directory,
    release,
    contents,
    build,
    output: join(root, 'installer.tar'),
  };
}
