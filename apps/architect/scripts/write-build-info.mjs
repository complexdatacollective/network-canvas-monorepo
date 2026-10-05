// Writes dist/build-info.json AFTER the turbo-cached build, immediately
// before deploy (netlify.toml's build command; the apps-release-architect
// job). The stamp must identify the DEPLOYMENT, not the build: turbo can
// legitimately restore an unchanged dist from cache for a later commit, and a
// SHA baked into the cached artifact would then describe whichever commit
// originally built it, blocking every correctly pinned release test. Netlify
// provides COMMIT_REF; the production job builds in GitHub Actions (GITHUB_SHA)
// and deploys with --no-build; local builds fall back to git. The file is
// written after the build so it never enters the service worker's precache
// manifest — the release-test workflow fetches it with cache: 'no-store'.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The hotfix lane runs MAIN's copy of this script against the hotfix tree's
// dist (a hotfix branch cut from an older tag may predate the script), so the
// output directory can be overridden as the first argument — and that lane
// must also set COMMIT_REF explicitly: its GITHUB_SHA is the main commit the
// workflow ran from, not the deployed code.
const distDir = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : resolve(appDir, 'dist');

function resolveDeployCommit() {
  const fromEnv = process.env.COMMIT_REF ?? process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv;
  try {
    return execSync('git rev-parse HEAD', { cwd: appDir }).toString().trim();
  } catch {
    return 'unknown';
  }
}

writeFileSync(
  resolve(distDir, 'build-info.json'),
  `${JSON.stringify({ commit: resolveDeployCommit() })}\n`,
);
