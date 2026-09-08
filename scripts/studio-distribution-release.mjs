#!/usr/bin/env node
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

import { publishReviewedStudioDistribution } from './studio-distribution-caller.mjs';
import { installStudioReleaseTools } from './studio-release-tools.mjs';

const REPOSITORY = 'complexdatacollective/network-canvas-monorepo';
const WORKFLOW = `${REPOSITORY}/.github/workflows/studio-release.yml@refs/heads/main`;
const SOURCE = /^[a-f0-9]{40}$/;
const TAGGER = Object.freeze({
  name: 'github-actions[bot]',
  email: '41898282+github-actions[bot]@users.noreply.github.com',
});

function workflowInput(env) {
  const oldestSupportedSource = env.STUDIO_OLDEST_SUPPORTED_SOURCE || undefined;
  if (
    env.GITHUB_ACTIONS !== 'true' ||
    env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    env.GITHUB_REPOSITORY !== REPOSITORY ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    env.GITHUB_WORKFLOW_REF !== WORKFLOW ||
    env.RUNNER_OS !== 'Linux' ||
    env.RUNNER_ARCH !== 'X64' ||
    !SOURCE.test(env.GITHUB_SHA ?? '') ||
    (oldestSupportedSource !== undefined && !SOURCE.test(oldestSupportedSource))
  )
    throw new Error('Studio distribution workflow identity is invalid.');
  return {
    source: env.GITHUB_SHA,
    ...(oldestSupportedSource ? { oldestSupportedSource } : {}),
  };
}

export async function runStudioDistributionRelease(
  { cwd, env = process.env, parentDirectory = tmpdir() },
  {
    install = installStudioReleaseTools,
    publish = publishReviewedStudioDistribution,
  } = {},
) {
  if (
    typeof cwd !== 'string' ||
    !isAbsolute(cwd) ||
    typeof parentDirectory !== 'string' ||
    !isAbsolute(parentDirectory)
  )
    throw new Error('Studio distribution workflow path is invalid.');
  const input = workflowInput(env);
  const workspace = mkdtempSync(
    join(parentDirectory, 'studio-release-workflow-'),
  );
  chmodSync(workspace, 0o700);
  try {
    const installed = await install(workspace);
    const installedRelative =
      typeof installed?.directory === 'string'
        ? relative(workspace, installed.directory)
        : '..';
    if (
      !installed ||
      !installedRelative ||
      installedRelative.startsWith('..') ||
      isAbsolute(installedRelative) ||
      !installed.paths ||
      !['cosign', 'crane', 'syft'].every(
        (name) =>
          typeof installed.paths[name] === 'string' &&
          isAbsolute(installed.paths[name]) &&
          !relative(installed.directory, installed.paths[name]).startsWith(
            '..',
          ),
      )
    )
      throw new Error('Pinned Studio release tools are unavailable.');
    return await publish({
      cwd,
      ...input,
      tagger: TAGGER,
      executables: { ...installed.paths },
    });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (process.argv.length !== 2) throw new Error();
    const result = await runStudioDistributionRelease({
      cwd: process.cwd(),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write('Studio distribution release failed.\n');
    process.exitCode = 1;
  }
}
