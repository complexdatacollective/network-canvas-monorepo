#!/usr/bin/env node
// Decides and writes everything the `apps-release-studio` job in
// .github/workflows/ci-and-release.yml publishes (plan, check, notes, manifest,
// sbom), so it is tested on pull requests. A release is named by
// @codaco/studio-api's version, the one an instance reports and the update
// check compares, and tagged `studio@<x.y.z>`.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  IMAGES,
  newestVersion,
  TAG_PREFIX,
} from '../../apps/studio/release-test/previous-release.mjs';
import {
  GATED_PRODUCT_DIRS,
  GATED_PRODUCT_RELEASE_LANES,
} from './changeset-app-utils.mjs';
import { notesFromChangelog, versionsSince } from './release-notes.mjs';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

export const API_PACKAGE = '@codaco/studio-api';
export const STUDIO_PACKAGES = GATED_PRODUCT_RELEASE_LANES.studio;
export const MIGRATIONS_DIR = 'apps/studio/api/migrations';

const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const MIGRATION = /^\d{4}_[a-z0-9_]+$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const UTC_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export const tagFor = (version) => `${TAG_PREFIX}${version}`;

export const imageRef = (image, digest) => {
  if (!DIGEST.test(digest)) {
    throw new Error(`not an image digest: ${digest}`);
  }
  return `${IMAGES[image]}@${digest}`;
};

// Until the first tag exists only the push that changes studio-api's version
// releases: the version main held when the lane arrived was never a release.
export function planRelease({ apiVersion, previousApiVersion, tags }) {
  if (!STABLE.test(apiVersion)) {
    return {
      released: false,
      reason: `${API_PACKAGE} ${apiVersion} is not a stable x.y.z version`,
    };
  }
  const tag = tagFor(apiVersion);
  if (tags.includes(tag)) {
    return { released: false, reason: `${tag} already exists` };
  }
  if (newestVersion(tags) === null && apiVersion === previousApiVersion) {
    return {
      released: false,
      reason: `no Studio release is tagged yet, and this push did not change ${API_PACKAGE}'s version from ${apiVersion}`,
    };
  }
  return { released: true, reason: `${tag} is not tagged yet` };
}

export function movedWithoutApi({ current, atNewest }) {
  if (atNewest === null) return [];
  if (current[API_PACKAGE] !== atNewest[API_PACKAGE]) return [];
  return STUDIO_PACKAGES.filter(
    (name) => name !== API_PACKAGE && current[name] !== atNewest[name],
  ).map((name) => ({ name, from: atNewest[name], to: current[name] }));
}

export function newestMigration(root = REPO_ROOT) {
  const names = readdirSync(join(root, MIGRATIONS_DIR), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory() && MIGRATION.test(entry.name))
    .map((entry) => entry.name)
    .toSorted();
  const newest = names.at(-1);
  if (newest === undefined) {
    throw new Error(`no migration directory under ${MIGRATIONS_DIR}`);
  }
  return newest;
}

export function releaseUrl(repository, version) {
  return `https://github.com/${repository}/releases/tag/${tagFor(version)}`;
}

// The first four keys are the update check's release manifest
// (apps/studio/api/src/update/manifest.ts).
export function releaseManifest({
  version,
  date,
  repository,
  migration,
  commit,
  apiDigest,
  webDigest,
}) {
  if (!STABLE.test(version)) throw new Error(`not x.y.z: ${version}`);
  if (!UTC_SECONDS.test(date)) throw new Error(`not a UTC instant: ${date}`);
  if (!MIGRATION.test(migration))
    throw new Error(`not a migration: ${migration}`);
  if (!COMMIT.test(commit)) throw new Error(`not a full commit sha: ${commit}`);
  return {
    version,
    date,
    notes: releaseUrl(repository, version),
    migration,
    tag: tagFor(version),
    commit,
    images: {
      api: imageRef('api', apiDigest),
      web: imageRef('web', webDigest),
    },
  };
}

export const RELEASE_BODY_LIMIT = 125_000;

export function studioReleaseNotes({
  root = REPO_ROOT,
  repository,
  version,
  current,
  atNewest,
  apiDigest,
  webDigest,
}) {
  const head = [
    `Network Canvas Studio ${version}. Pin both images by digest:`,
    '',
    '```',
    `STUDIO_API_IMAGE=${imageRef('api', apiDigest)}`,
    `STUDIO_WEB_IMAGE=${imageRef('web', webDigest)}`,
    '```',
  ];
  const full = [...head];
  const linked = [...head];
  for (const name of STUDIO_PACKAGES) {
    const to = current[name];
    const from = atNewest?.[name] ?? null;
    if (from === to) continue;
    const dir = join(root, GATED_PRODUCT_DIRS[name]);
    const versions = from ? versionsSince(dir, to, from) : [to];
    const sections = versions
      .map((each) => ({ each, body: notesFromChangelog(dir, each) }))
      .filter(({ body }) => body !== '');
    const moved = from ? `${from} → ${to}.` : `${to}.`;
    full.push('', `## ${name} ${to}`);
    if (sections.length === 0) {
      full.push('', moved);
    } else if (sections.length === 1) {
      full.push('', sections[0].body);
    } else {
      for (const { each, body } of sections) {
        full.push('', `### ${each}`, '', body);
      }
    }
    linked.push(
      '',
      `## ${name} ${to}`,
      '',
      `${moved} See [its changelog](https://github.com/${repository}/blob/${tagFor(version)}/${GATED_PRODUCT_DIRS[name]}/CHANGELOG.md).`,
    );
  }
  const body = `${full.join('\n')}\n`;
  return body.length <= RELEASE_BODY_LIMIT ? body : `${linked.join('\n')}\n`;
}

const componentKey = (component) => component.purl ?? component['bom-ref'];

export function mergeSboms({ image, version, digest, boms, timestamp }) {
  const root = {
    'bom-ref': `${IMAGES[image]}@${digest}`,
    'type': 'container',
    'name': IMAGES[image],
    version,
    'purl': `pkg:oci/${IMAGES[image].split('/').at(-1)}@${encodeURIComponent(digest)}?repository_url=${encodeURIComponent(IMAGES[image])}`,
  };
  const components = new Map();
  const refs = new Map();
  const tools = new Map();
  const rootDependsOn = new Set();
  const edges = new Map();

  const keep = (component) => {
    const key = componentKey(component);
    const kept = components.get(key);
    if (kept) {
      refs.set(component['bom-ref'], kept['bom-ref']);
      return kept['bom-ref'];
    }
    components.set(key, component);
    refs.set(component['bom-ref'], component['bom-ref']);
    return component['bom-ref'];
  };

  for (const bom of boms) {
    if (bom.bomFormat !== 'CycloneDX') {
      throw new Error('every input must be a CycloneDX document');
    }
    for (const tool of bom.metadata?.tools?.components ?? []) {
      tools.set(`${tool.name}@${tool.version}`, tool);
    }
    const described = bom.metadata?.component;
    if (described?.type === 'container') {
      refs.set(described['bom-ref'], root['bom-ref']);
    } else if (described) {
      rootDependsOn.add(keep(described));
    }
    for (const component of bom.components ?? []) keep(component);
  }

  for (const bom of boms) {
    for (const { ref, dependsOn = [] } of bom.dependencies ?? []) {
      const from = refs.get(ref) ?? ref;
      const targets = edges.get(from) ?? new Set();
      for (const target of dependsOn) targets.add(refs.get(target) ?? target);
      edges.set(from, targets);
    }
  }
  const rootEdges = edges.get(root['bom-ref']) ?? new Set();
  for (const ref of rootDependsOn) rootEdges.add(ref);
  edges.set(root['bom-ref'], rootEdges);

  return {
    $schema: 'http://cyclonedx.org/schema/bom-1.6.schema.json',
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
      timestamp,
      tools: { components: [...tools.values()] },
      component: root,
    },
    components: [...components.values()],
    dependencies: [...edges].map(([ref, dependsOn]) => ({
      ref,
      dependsOn: [...dependsOn].toSorted((a, b) => a.localeCompare(b)),
    })),
  };
}

const git = (root, ...args) =>
  execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });

const versionOf = (text) => JSON.parse(text).version;

function versionsAt(root, revision) {
  return Object.fromEntries(
    STUDIO_PACKAGES.map((name) => [
      name,
      versionOf(
        revision === null
          ? readFileSync(
              join(root, GATED_PRODUCT_DIRS[name], 'package.json'),
              'utf8',
            )
          : git(
              root,
              'show',
              `${revision}:${GATED_PRODUCT_DIRS[name]}/package.json`,
            ),
      ),
    ]),
  );
}

function releaseTags(root) {
  return git(root, 'tag', '--list', `${TAG_PREFIX}*`)
    .split('\n')
    .filter((line) => line !== '');
}

const previousApiVersion = (root) =>
  versionOf(
    git(root, 'show', `HEAD^:${GATED_PRODUCT_DIRS[API_PACKAGE]}/package.json`),
  );

function atNewestRelease(root) {
  const newest = newestVersion(releaseTags(root));
  return newest === null ? null : versionsAt(root, tagFor(newest));
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) {
      throw new Error(
        `expected --name value pairs, got ${argv.slice(i).join(' ')}`,
      );
    }
    args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

function required(args, ...names) {
  for (const name of names) {
    if (!args[name]) throw new Error(`--${name} is required`);
  }
  return args;
}

const writeJson = (path, value) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const COMMANDS = {
  plan(root) {
    const current = versionsAt(root, null);
    const plan = planRelease({
      apiVersion: current[API_PACKAGE],
      previousApiVersion: previousApiVersion(root),
      tags: releaseTags(root),
    });
    const outputs = `released=${plan.released}\nversion=${current[API_PACKAGE]}\n`;
    if (process.env.GITHUB_OUTPUT) {
      writeFileSync(process.env.GITHUB_OUTPUT, outputs, { flag: 'a' });
    }
    console.log(
      `[studio] version=${current[API_PACKAGE]} released=${plan.released} (${plan.reason})`,
    );
  },

  check(root) {
    const moved = movedWithoutApi({
      current: versionsAt(root, null),
      atNewest: atNewestRelease(root),
    });
    if (moved.length === 0) {
      console.log(
        `[studio] every moved Studio package moves ${API_PACKAGE} too`,
      );
      return;
    }
    for (const { name, from, to } of moved) {
      console.error(
        `::error::${name} moves from ${from} to ${to}, but ${API_PACKAGE} stays at its released version, so no Studio release would publish it. Add a ${API_PACKAGE} entry to one of this release's changesets.`,
      );
    }
    process.exitCode = 1;
  },

  notes(root, args) {
    required(args, 'version', 'repository', 'api-digest', 'web-digest', 'out');
    writeFileSync(
      args.out,
      studioReleaseNotes({
        root,
        repository: args.repository,
        version: args.version,
        current: versionsAt(root, null),
        atNewest: atNewestRelease(root),
        apiDigest: args['api-digest'],
        webDigest: args['web-digest'],
      }),
    );
  },

  manifest(root, args) {
    required(
      args,
      'version',
      'commit',
      'repository',
      'api-digest',
      'web-digest',
      'out',
    );
    writeJson(
      args.out,
      releaseManifest({
        version: args.version,
        date: args.date ?? `${new Date().toISOString().slice(0, 19)}Z`,
        repository: args.repository,
        migration: newestMigration(root),
        commit: args.commit,
        apiDigest: args['api-digest'],
        webDigest: args['web-digest'],
      }),
    );
  },

  sbom(_root, args) {
    required(args, 'image', 'version', 'digest', 'inputs', 'out');
    if (!(args.image in IMAGES)) throw new Error(`unknown image ${args.image}`);
    writeFileSync(
      args.out,
      JSON.stringify(
        mergeSboms({
          image: args.image,
          version: args.version,
          digest: args.digest,
          boms: args.inputs
            .split(',')
            .map((path) => JSON.parse(readFileSync(path, 'utf8'))),
          timestamp: new Date().toISOString(),
        }),
      ),
    );
  },
};

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2);
  if (!(command in COMMANDS)) {
    console.error(
      `usage: node scripts/release/studio-release.mjs <${Object.keys(COMMANDS).join('|')}> [--name value ...]`,
    );
    process.exit(2);
  }
  const root = process.env.STUDIO_RELEASE_ROOT ?? REPO_ROOT;
  if (!existsSync(join(root, GATED_PRODUCT_DIRS[API_PACKAGE]))) {
    console.error(`studio-release.mjs: ${root} is not the repository root`);
    process.exit(2);
  }
  try {
    COMMANDS[command](root, parseArgs(rest));
  } catch (error) {
    console.error(`studio-release.mjs ${command}: ${error.message}`);
    process.exit(1);
  }
}
