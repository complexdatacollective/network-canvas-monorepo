#!/usr/bin/env node
// Release-lane wait: blocks until npm serves every @codaco/* version a
// mirrored app's lockfile install will ask for.
//
// The Fresco mirror resolves the app's workspace: dependencies to registry
// ranges and generates its lockfile against npm, so it runs after the release
// job has published this release's packages. Published is not the same as
// served: npm's registry kept answering with the previous package document
// for a while after a publish. On 2026-10-21 the Fresco 4.3.1 mirror started
// two seconds after the release job published @codaco/interview 11.0.0, and
// its lockfile install failed with "No matching version found for
// @codaco/interview@^11.0.0 ... The latest release of @codaco/interview is
// 10.0.0". This waits for the same abbreviated document pnpm reads to list
// every version in the app's published-workspace closure.
//
// Usage:
//   node scripts/release/wait-for-npm-versions.mjs --app apps/fresco [--timeout-seconds 900]
import { pathToFileURL } from 'node:url';

import { classifyLanePackages } from './check-first-publications.mjs';
import { DEFAULT_REGISTRY_URL } from './check-npm-version-collisions.mjs';
import { readWorkspacePackages } from './resolve-manifest.mjs';
import { collectClosure } from './vendor-workspace-packages.mjs';

// Every non-private workspace package the app reaches, at its current version.
function closureVersions(appDir, wsPackages = readWorkspacePackages()) {
  return collectClosure(wsPackages, appDir).map((name) => ({
    name,
    version: wsPackages[name].version,
  }));
}

// Polls until npm lists every package's version, or the deadline passes. A
// registry error is retried like a missing version: the release job has
// already published, so the only question is when npm starts serving it.
export async function waitForRegistryVersions(
  packages,
  {
    registryUrl = DEFAULT_REGISTRY_URL,
    fetchImpl = fetch,
    timeoutMs = 15 * 60_000,
    intervalMs = 15_000,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = () => Date.now(),
    log = console.error,
  } = {},
) {
  const deadline = now() + timeoutMs;
  let pending = packages;
  for (;;) {
    let reason;
    try {
      const { neverPublished, pendingVersions } = await classifyLanePackages(
        pending,
        { registryUrl, fetchImpl },
      );
      pending = [...neverPublished, ...pendingVersions];
      if (pending.length === 0) return;
      reason = `npm does not serve ${pending
        .map((pkg) => `${pkg.name}@${pkg.version}`)
        .join(', ')} yet`;
    } catch (error) {
      reason = error.message;
    }
    if (now() + intervalMs > deadline) {
      throw new Error(
        `Gave up waiting for npm after ${Math.round(timeoutMs / 1000)}s: ${reason}.`,
      );
    }
    log(`[wait-for-npm] ${reason}; checking again in ${intervalMs / 1000}s`);
    await sleep(intervalMs);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const appIndex = args.indexOf('--app');
  const appDir = appIndex === -1 ? undefined : args[appIndex + 1];
  const timeoutIndex = args.indexOf('--timeout-seconds');
  const timeoutSeconds =
    timeoutIndex === -1 ? 900 : Number(args[timeoutIndex + 1]);
  if (!appDir || !Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    console.error(
      'Usage: node scripts/release/wait-for-npm-versions.mjs --app <appDir> [--timeout-seconds <n>]',
    );
    process.exitCode = 1;
    return;
  }

  const packages = closureVersions(appDir);
  await waitForRegistryVersions(packages, {
    registryUrl:
      process.env.NPM_REGISTRY_URL ||
      process.env.npm_config_registry ||
      DEFAULT_REGISTRY_URL,
    timeoutMs: timeoutSeconds * 1000,
  });
  console.log(
    `npm serves every version ${appDir} installs: ${packages
      .map((pkg) => `${pkg.name}@${pkg.version}`)
      .join(', ')}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
