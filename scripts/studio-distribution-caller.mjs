import { isAbsolute } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { command } from '../apps/studio/deployment/installer/verify.mjs';
import { createGitHubDistributionStore } from './studio-github-distribution-store.mjs';
import { prepareStudioImages } from './studio-image-preparation.mjs';
import { verifyStudioPublication } from './studio-publication-verification.mjs';
import { evaluateStudioPublication } from './studio-release-admission.mjs';
import { authenticateStudioReleaseHistory } from './studio-release-history.mjs';
import { readStudioCandidate } from './studio-release-policy.mjs';
import { createStudioReleasePreparation } from './studio-release-preparation.mjs';
import { publishStudioDistribution } from './studio-release-publication.mjs';

/** Compose concrete publication I/O under the workflow's non-cancelling lock.
 * The caller supplies pinned tool paths and the actual isolated installation,
 * upgrade and recovery qualifier. No shell command or cached success is accepted
 * as a substitute for that qualification boundary. */
export async function publishReviewedStudioDistribution(
  { cwd, source, tagger, executables, oldestSupportedSource, qualify },
  {
    request,
    run = command,
    evaluate = evaluateStudioPublication,
    authenticate = authenticateStudioReleaseHistory,
    prepare = createStudioReleasePreparation,
    verify = verifyStudioPublication,
    store: suppliedStore,
  } = {},
) {
  if (
    typeof cwd !== 'string' ||
    !isAbsolute(cwd) ||
    typeof source !== 'string' ||
    !/^[a-f0-9]{40}$/.test(source) ||
    (oldestSupportedSource !== undefined &&
      (typeof oldestSupportedSource !== 'string' ||
        !/^[a-f0-9]{40}$/.test(oldestSupportedSource))) ||
    typeof qualify !== 'function' ||
    !executables ||
    !['cosign', 'crane', 'syft'].every(
      (name) =>
        typeof executables[name] === 'string' && isAbsolute(executables[name]),
    )
  )
    throw new Error(
      'Studio publication requires an explicit qualified caller.',
    );
  const paths = { ...executables };
  const store =
    suppliedStore ?? createGitHubDistributionStore({ request, tagger });
  let history;

  function refresh() {
    // A changed local tag causes fetch to fail: do not force-update immutable
    // release history or prune an older reservation during publication.
    run(
      'git',
      [
        'fetch',
        '--no-tags',
        'origin',
        '+refs/heads/main:refs/remotes/origin/main',
        'refs/tags/*:refs/tags/*',
      ],
      { cwd, timeout: 30_000, killSignal: 'SIGKILL' },
    );
  }

  return publishStudioDistribution(
    { source },
    {
      admission: async (requestedSource) => {
        if (requestedSource !== source)
          throw new Error('Studio publication source changed.');
        refresh();
        return evaluate(cwd, source, { request });
      },
      reserve: (requestedSource) => store.reserve(requestedSource),
      prepare: async (gate) => {
        refresh();
        history = await authenticate(
          { cwd, source, store, oldestSupportedSource },
          { cosign: paths.cosign, run },
        );
        const candidate = readStudioCandidate(cwd, source);
        return prepare(
          { candidate, store, ...history },
          {
            cosign: paths.cosign,
            crane: paths.crane,
            run,
            prepareImages: (input, options) =>
              prepareStudioImages(input, {
                ...options,
                crane: paths.crane,
                syft: paths.syft,
                run,
              }),
          },
        )(gate);
      },
      verify: (artifacts) => verify(artifacts, { cosign: paths.cosign, run }),
      qualify: async (manifest, artifacts) => {
        if (!history)
          throw new Error('Authenticated upgrade history is unavailable.');
        const expectedDigest = manifest.current.digest;
        const expectedUpgrades = history.qualificationSources.map(
          ({ current }) => ({
            source: current.source,
            manifestSha256: current.digest,
          }),
        );
        const qualificationSources = history.qualificationSources.map(
          (prior) => ({
            ...structuredClone({
              release: prior.release,
              current: prior.current,
            }),
            releaseBytes: Buffer.from(prior.releaseBytes),
            sboms: new Map(
              [...prior.sboms].map(([name, bytes]) => [
                name,
                Buffer.from(bytes),
              ]),
            ),
          }),
        );
        const receipt = await qualify({
          manifest,
          artifacts,
          qualificationSources,
          executables: { ...paths },
          store: { readAsset: (tag, name) => store.readAsset(tag, name) },
        });
        if (
          receipt?.verdict !== 'passed' ||
          receipt.source !== source ||
          receipt.manifestSha256 !== expectedDigest ||
          receipt.freshInstall !== true ||
          receipt.populatedRecovery !== true ||
          !isDeepStrictEqual(receipt.upgrades, expectedUpgrades)
        )
          throw new Error(
            'Studio installation and recovery qualification is incomplete.',
          );
      },
      ensureDraft: (identity) => store.ensureDraft(identity),
      readAsset: (tag, name) => store.readAsset(tag, name),
      uploadAsset: (tag, name, bytes) => store.uploadAsset(tag, name, bytes),
      publish: (identity) => store.publish(identity),
    },
  );
}
