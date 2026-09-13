import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  IMAGE_REPOSITORIES,
  readRelease,
  sha256,
  signatureArguments,
} from '../apps/studio/deployment/installer/release.mjs';
import { command } from '../apps/studio/deployment/installer/verify.mjs';
import { validateCycloneDx } from './studio-image-evidence.mjs';

const SOURCE = /^[a-f0-9]{40}$/;

function verifyManifest(bytes, bundle, { cosign, run }) {
  const directory = mkdtempSync(join(tmpdir(), 'studio-history-'));
  chmodSync(directory, 0o700);
  try {
    const target = join(directory, 'release.json');
    const signature = join(directory, 'release.sigstore.json');
    for (const [path, contents] of [
      [target, bytes],
      [signature, bundle],
    ])
      writeFileSync(path, contents, { flag: 'wx', mode: 0o600 });
    run(cosign, signatureArguments('blob', target, signature), {
      timeout: 300_000,
      killSignal: 'SIGKILL',
    });
  } catch {
    throw new Error('Historical distribution signature verification failed.');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Call under the publication lock after fetching main and all remote tags.
 * Git establishes source ancestry; authenticated manifests establish artifact
 * identities. A draft is not a supported release and cannot supply reuse data.
 * Never infer an empty history from a failed API request or missing asset. */
export async function authenticateStudioReleaseHistory(
  { cwd, source, store, oldestSupportedSource },
  { cosign = 'cosign', run = command } = {},
) {
  if (
    !SOURCE.test(source) ||
    (oldestSupportedSource !== undefined && !SOURCE.test(oldestSupportedSource))
  )
    throw new Error('A complete release source is required.');
  const git = (args) =>
    run('git', args, { cwd, timeout: 30_000, killSignal: 'SIGKILL' })
      .toString('utf8')
      .trim();
  git(['merge-base', '--is-ancestor', source, 'refs/remotes/origin/main']);
  const tags = git(['tag', '--list', 'studio/*']).split('\n').filter(Boolean);
  if (tags.length > 100_000)
    throw new Error('Distribution history exceeds its bound.');
  const history = [];
  for (const tag of tags) {
    const commit = tag.slice('studio/'.length);
    if (
      !SOURCE.test(commit) ||
      git(['cat-file', '-t', `refs/tags/${tag}`]) !== 'tag' ||
      git(['rev-parse', `refs/tags/${tag}^{commit}`]) !== commit
    )
      throw new Error(
        'Historical distribution tag has invalid source evidence.',
      );
    // A newer or unrelated tag must block an older publication even if its
    // release is still a draft. A current-source retry is not its own parent.
    git(['merge-base', '--is-ancestor', commit, source]);
    const retained = await store.readPublishedManifest({ tag, source: commit });
    if (retained === null) continue;
    if (
      !Buffer.isBuffer(retained.bytes) ||
      !retained.bytes.length ||
      retained.bytes.length > 4 * 1024 * 1024 ||
      !Buffer.isBuffer(retained.bundle) ||
      !retained.bundle.length ||
      retained.bundle.length > 8 * 1024 * 1024
    )
      throw new Error('Historical distribution evidence is invalid.');
    verifyManifest(retained.bytes, retained.bundle, { cosign, run });
    const release = readRelease(retained.bytes);
    if (
      release.current.source !== commit ||
      release.current.digest !== retained.manifestSha256 ||
      release.current.generation !==
        Number(git(['rev-list', '--count', commit]))
    )
      throw new Error('Historical manifest differs from its Git identity.');
    if (
      !(retained.sboms instanceof Map) ||
      retained.sboms.size !== Object.keys(IMAGE_REPOSITORIES).length
    )
      throw new Error('Historical distribution SBOM inventory is incomplete.');
    const sboms = new Map();
    for (const name of Object.keys(IMAGE_REPOSITORIES)) {
      const bytes = retained.sboms.get(name);
      if (
        !Buffer.isBuffer(bytes) ||
        sha256(bytes) !== release.release.evidence.sboms[name].sha256
      )
        throw new Error('Historical SBOM does not match its signed digest.');
      validateCycloneDx({
        image: release.release.images[name].reference,
        configurations: release.release.images[name].configurations,
        bytes,
      });
      sboms.set(name, Buffer.from(bytes));
    }
    if (commit !== source)
      history.push({
        ...release,
        releaseBytes: Buffer.from(retained.bytes),
        sboms,
      });
  }
  history.sort((a, b) => a.current.generation - b.current.generation);
  for (let index = 1; index < history.length; index += 1) {
    const before = history[index - 1];
    const after = history[index];
    git([
      'merge-base',
      '--is-ancestor',
      before.current.source,
      after.current.source,
    ]);
    if (
      before.current.generation >= after.current.generation ||
      !after.release.ancestors.includes(before.current.source)
    )
      throw new Error(
        'Published distributions do not form a single ancestry chain.',
      );
  }
  let first = 0;
  if (oldestSupportedSource !== undefined) {
    first = history.findIndex(
      ({ current }) => current.source === oldestSupportedSource,
    );
    if (first === -1)
      throw new Error(
        'Oldest supported distribution is not authenticated published history.',
      );
  }
  const supported = history.slice(first);
  if (supported.length > 20)
    throw new Error('Declare the supported release range before publishing.');
  return {
    authenticatedPriorRelease: history.at(-1),
    upgradeFrom: supported.map(({ current }) => current),
    qualificationSources:
      supported.length < 2 ? supported : [supported[0], supported.at(-1)],
  };
}
