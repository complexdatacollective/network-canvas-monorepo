import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const DISTRIBUTION_TAG_PREFIX = 'studio-distribution-';

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Run after fetching release tags, while holding the combined distribution
 * publication/promotion lock. Every tag reserves its source even if a failed
 * run has not uploaded all assets yet; exact-source retries finish that run.
 * Image equality never exempts installer, Compose or manifest publication.
 */
export function distributionAncestry(cwd, ref = 'HEAD') {
  const source = git(cwd, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${ref}^{commit}`,
  ]);
  if (!/^[a-f0-9]{40}$/.test(source))
    throw new Error('A full distribution source commit is required.');
  const tags = git(cwd, ['tag', '--list', `${DISTRIBUTION_TAG_PREFIX}*`])
    .split('\n')
    .filter(Boolean);
  const ancestors = [];
  let retry = false;
  for (const tag of tags) {
    const namedSource = tag.slice(DISTRIBUTION_TAG_PREFIX.length);
    if (!/^[a-f0-9]{40}$/.test(namedSource))
      throw new Error('A distribution tag has an invalid source identity.');
    const released = git(cwd, [
      'rev-parse',
      '--verify',
      `refs/tags/${tag}^{commit}`,
    ]);
    if (released !== namedSource)
      throw new Error(
        'A distribution tag does not match its immutable source identity.',
      );
    try {
      git(cwd, ['merge-base', '--is-ancestor', released, source]);
    } catch {
      return { status: 'superseded', source, conflictingRelease: released };
    }
    if (released === source) retry = true;
    else ancestors.push(released);
  }
  // Counting committed ancestors is monotonic along the required ancestry
  // chain; timestamps and package semver are not reliable release ordering.
  const generation = Number(git(cwd, ['rev-list', '--count', source]));
  if (!Number.isSafeInteger(generation) || generation < 1)
    throw new Error('Distribution generation is unavailable.');
  return {
    status: 'ready',
    source,
    generation,
    ancestors: ancestors.toSorted((left, right) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
    retry,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (process.argv.length > 3)
      throw new Error('Expected an optional source ref.');
    process.stdout.write(
      `${JSON.stringify(distributionAncestry(process.cwd(), process.argv[2]))}\n`,
    );
  } catch {
    process.stderr.write('Distribution ancestry could not be verified.\n');
    process.exitCode = 1;
  }
}
