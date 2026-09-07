import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';

import { stringify } from 'yaml';

import { GATED_PRODUCT_DIRS } from '../changeset-app-utils.mjs';
import {
  recordStudioSourceBaseline,
  STUDIO_RELEASE_PACKAGES,
  studioReleaseEligibility,
  readStudioCandidate,
} from '../studio-release-policy.mjs';
import {
  applyProductReleases,
  planProductReleases,
} from '../version-gated-products.mjs';

const SHARED = '@codaco/shared-consts';
const CLIENT = '@codaco/studio-client';
const SERVER = '@codaco/studio-server';
const REGISTRY = '@codaco/template-registry';
const RPC = '@codaco/studio-rpc';
const SYNC = '@codaco/studio-sync';

export function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'studio-release-policy-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  function git(...args) {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }
  function write(path, value) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(
      join(cwd, path),
      typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`,
    );
  }
  function read(path) {
    return JSON.parse(readFileSync(join(cwd, path), 'utf8'));
  }
  function commit() {
    git('add', '.');
    git('commit', '-qm', 'Release qualification fixture');
    return git('rev-parse', 'HEAD');
  }
  function change(name, type = 'patch', id = 'studio') {
    write(
      `.changeset/${id}.md`,
      `---\n"${name}": ${type}\n---\nRelease fixture change.\n`,
    );
  }
  const dirs = { ...GATED_PRODUCT_DIRS, [SHARED]: 'packages/shared-consts' };
  const dependencies = {
    [CLIENT]: [SHARED, RPC],
    [SERVER]: [SHARED, RPC, SYNC],
    [RPC]: [],
    [SYNC]: [],
    [REGISTRY]: [SYNC],
    [SHARED]: [],
  };
  const lock = {
    lockfileVersion: '9.0',
    settings: {},
    importers: { '.': {} },
    packages: {
      'registry-parser@1.0.0': { resolution: { integrity: 'sha512-fixture' } },
    },
    snapshots: { 'registry-parser@1.0.0': {} },
  };
  for (const name of [...STUDIO_RELEASE_PACKAGES, SHARED]) {
    const deps = Object.fromEntries(
      dependencies[name].map((dependency) => [dependency, 'workspace:^']),
    );
    if (name === REGISTRY) deps['registry-parser'] = '^1.0.0';
    write(`${dirs[name]}/package.json`, {
      name,
      version: name === SHARED ? '1.0.0' : '0.0.0',
      private: name !== SHARED,
      dependencies: deps,
    });
    write(`${dirs[name]}/src/main.ts`, `export const value = '${name}';\n`);
    lock.importers[dirs[name]] = {
      dependencies: Object.fromEntries(
        Object.entries(deps).map(([dependency, specifier]) => [
          dependency,
          {
            specifier,
            version:
              dependency === 'registry-parser'
                ? '1.0.0'
                : `link:${posix.relative(dirs[name], dirs[dependency])}`,
          },
        ]),
      ),
    };
  }
  write('package.json', { private: true, packageManager: 'pnpm@11.20.0' });
  write(
    'pnpm-workspace.yaml',
    "packages:\n  - 'apps/*'\n  - 'apps/studio/*'\n  - 'packages/*'\n",
  );
  write('pnpm-lock.yaml', stringify(lock));
  write(
    'apps/studio/Dockerfile',
    `FROM node:24-slim@sha256:${'a'.repeat(64)}\n`,
  );
  write(
    'apps/studio/deployment/minio.Dockerfile',
    `ADD --checksum=sha256:${'b'.repeat(64)} https://codeload.github.com/minio/minio/tar.gz/${'c'.repeat(40)} /source.tar.gz\nLABEL org.opencontainers.image.revision="${'c'.repeat(40)}"\nRUN go build -ldflags='-X github.com/minio/minio/cmd.CommitID=${'c'.repeat(40)}'\n`,
  );
  write(
    'apps/studio/docker-entrypoint.sh',
    '#!/bin/sh\nexec node dist/index.js\n',
  );
  write('apps/template-registry/Dockerfile', 'FROM node:24-slim\n');
  write('.dockerignore', '.git\n**/node_modules\n');
  write('apps/studio/docker-compose.yml', 'services: {}\n');
  write('scripts/studio-install.mjs', 'export const version = 1;\n');
  write(
    '.changeset/studio.md',
    `---\n${STUDIO_RELEASE_PACKAGES.map((name) => `"${name}": minor`).join('\n')}\n---\nInitial Studio release.\n`,
  );
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Joshua Melville');
  git('config', 'user.email', 'joshua@northwestern.edu');
  git('config', 'core.hooksPath', '/dev/null');
  const published = new Map();
  function tagDependency(version) {
    const source = git('rev-parse', 'HEAD');
    git('tag', `${SHARED}@${version}`);
    published.set(version, {
      source,
      integrity: 'sha512-authenticated-fixture',
      provenance: 'verified-fixture',
    });
  }
  commit();
  tagDependency('1.0.0');
  function releaseStudio() {
    const { plans, consumed } = planProductReleases(
      cwd,
      STUDIO_RELEASE_PACKAGES,
    );
    recordStudioSourceBaseline(cwd, plans);
    applyProductReleases(cwd, plans, consumed);
    return commit();
  }
  function releaseDependency(version = '1.1.0') {
    const path = `${dirs[SHARED]}/package.json`;
    write(path, { ...read(path), version });
    rmSync(join(cwd, '.changeset/normal.md'));
    commit();
    tagDependency(version);
  }
  async function eligible() {
    return studioReleaseEligibility(
      readStudioCandidate(cwd),
      async (_name, version) => {
        const result = published.get(version);
        if (!result) throw new Error('Publication pending');
        return result;
      },
    );
  }
  releaseStudio();
  return {
    cwd,
    git,
    write,
    read,
    dirs,
    commit,
    change,
    lock,
    eligible,
    releaseStudio,
    releaseDependency,
    published,
  };
}
