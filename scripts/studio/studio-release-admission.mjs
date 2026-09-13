import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { deriveMinioSourceEvidence } from './studio-image-evidence.mjs';
import { distributionAncestry } from './studio-release-ancestry.mjs';
import { assertSuccessfulStudioSourceCI } from './studio-release-ci-admission.mjs';
import {
  readStudioCandidate,
  studioReleaseEligibility,
} from './studio-release-policy.mjs';

/** Called under the publication lock after fetching origin/main and all tags.
 * Build inputs are read from committed Git objects by the shared release policy.
 * The checkout must match that same reviewed source before executing its build. */
export async function evaluateStudioPublication(cwd, source, { request } = {}) {
  if (typeof source !== 'string' || !/^[a-f0-9]{40}$/.test(source))
    throw new Error('A complete reviewed Studio source commit is required.');
  const git = (args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  if (
    git(['rev-parse', 'HEAD']) !== source ||
    git(['status', '--porcelain', '--untracked-files=normal'])
  )
    throw new Error('Studio publication requires the clean reviewed checkout.');
  if (git(['rev-parse', 'refs/remotes/origin/main']) !== source)
    throw new Error('Studio publication requires the current origin/main tip.');
  const ci = await assertSuccessfulStudioSourceCI(source, { request });
  const candidate = readStudioCandidate(cwd, source);
  const eligibility = await studioReleaseEligibility(candidate);
  const ancestry = distributionAncestry(cwd, source);
  return {
    ci,
    eligibility,
    ancestry,
    minioSource: deriveMinioSourceEvidence(
      candidate.read('apps/studio/deployment/minio.Dockerfile'),
    ),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (process.argv.length !== 3) throw new Error();
    process.stdout.write(
      `${JSON.stringify(await evaluateStudioPublication(process.cwd(), process.argv[2]))}\n`,
    );
  } catch {
    process.stderr.write(
      'Studio publication admission could not be verified.\n',
    );
    process.exitCode = 1;
  }
}
