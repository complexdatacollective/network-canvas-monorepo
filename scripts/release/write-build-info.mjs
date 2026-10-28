// Writes <dist>/build-info.json AFTER an app's turbo-cached build, immediately
// before deploy (Architect's and Interviewer's netlify.toml build commands,
// their production release jobs and the hotfix lane). The release-test
// workflows read it to pin the commit a deployment serves. The stamp must
// identify the DEPLOYMENT, not the build: turbo can legitimately restore an
// unchanged dist from cache for a later commit, and a SHA baked into the
// cached artifact would then describe whichever commit originally built it,
// blocking every correctly pinned release test. Netlify provides COMMIT_REF;
// the production jobs build in GitHub Actions (GITHUB_SHA) and deploy with
// --no-build; local builds fall back to git. The file is written after the
// build so it never enters the service worker's precache manifest — the
// release-test workflows fetch it uncached.
//
// Usage: node scripts/release/write-build-info.mjs <dist directory>
//
// The hotfix lane runs MAIN's copy of this script against the hotfix tree's
// dist (a hotfix branch cut from an older tag may predate the script), so it
// must set COMMIT_REF explicitly: its GITHUB_SHA is the main commit the
// workflow ran from, not the deployed code.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [distArg] = process.argv.slice(2);
if (!distArg) {
  console.error('Usage: node scripts/release/write-build-info.mjs <dist>');
  process.exit(1);
}
const distDir = resolve(process.cwd(), distArg);

function resolveDeployCommit() {
  const fromEnv = process.env.COMMIT_REF ?? process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv;
  try {
    return execSync('git rev-parse HEAD', {
      cwd: distDir,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

writeFileSync(
  resolve(distDir, 'build-info.json'),
  `${JSON.stringify({ commit: resolveDeployCommit() })}\n`,
);
