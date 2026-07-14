import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const RELEASE_REFS = new Set([
  'changeset-release/main',
  'changeset-release/apps',
]);

const VERSIONED_MANIFESTS = [
  'packages/*/package.json',
  'apps/architect/package.json',
  'apps/interviewer/package.json',
  'apps/documentation/package.json',
];

export function releaseRefForEvent({ eventName, headRef, refName }) {
  const candidate =
    eventName === 'pull_request'
      ? headRef
      : eventName === 'workflow_dispatch'
        ? refName
        : '';
  return RELEASE_REFS.has(candidate) ? candidate : '';
}

function readVersionAt(revision, manifest) {
  try {
    const contents = execFileSync('git', ['show', `${revision}:${manifest}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(contents);
    return typeof parsed.version === 'string' ? parsed.version : null;
  } catch {
    return null;
  }
}

function mergeGroupChangesReleaseVersion(baseSha, headSha) {
  if (!baseSha || !headSha) {
    throw new Error(
      'merge_group release detection requires base and head SHAs',
    );
  }

  const changedManifests = execFileSync(
    'git',
    ['diff', '--name-only', baseSha, headSha, '--', ...VERSIONED_MANIFESTS],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean);

  return changedManifests.some(
    (manifest) =>
      readVersionAt(baseSha, manifest) !== readVersionAt(headSha, manifest),
  );
}

export function releaseE2EPolicy(
  { eventName, headRef = '', refName = '', baseSha = '', headSha = '' },
  mergeGroupDetector = mergeGroupChangesReleaseVersion,
) {
  const releaseRef = releaseRefForEvent({ eventName, headRef, refName });
  if (releaseRef) {
    return {
      required: true,
      releaseRef,
      snapshotBranch: `e2e-snapshots/${releaseRef.replaceAll('/', '-')}`,
    };
  }

  if (eventName === 'merge_group') {
    return {
      required: mergeGroupDetector(baseSha, headSha),
      releaseRef: '',
      snapshotBranch: '',
    };
  }

  return { required: false, releaseRef: '', snapshotBranch: '' };
}

function main() {
  const policy = releaseE2EPolicy({
    eventName: process.env.EVENT_NAME ?? '',
    headRef: process.env.HEAD_REF ?? '',
    refName: process.env.REF_NAME ?? '',
    baseSha: process.env.BASE_SHA ?? '',
    headSha: process.env.HEAD_SHA ?? '',
  });
  process.stdout.write(`${JSON.stringify(policy)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
