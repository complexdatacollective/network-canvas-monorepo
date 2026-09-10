// Helpers for the gated release lane. These private workspaces are kept in the
// changeset `ignore` list, so `changeset version` never consumes their
// changesets — this module reads and versions them for our own tooling.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = new URL('..', import.meta.url);

const readJson = (url) => JSON.parse(readFileSync(url, 'utf8'));

/**
 * Every workspace in the repository, with the manifest its directory holds.
 *
 * The globs come from the leading `packages:` block of `pnpm-workspace.yaml`,
 * parsed without a YAML dependency: the block is a flat list, indented
 * comments are skipped, and the next top-level key ends it. Directories with
 * no `package.json` are not workspaces and are dropped.
 *
 * One owner, because the guard below and the tests that hold it to the
 * workspace all need the same walk — and because a glob shape this cannot
 * handle must fail loudly rather than quietly leave packages unwalked.
 */
export function workspaceManifests(root = REPO_ROOT) {
  const workspace = readFileSync(new URL('pnpm-workspace.yaml', root), 'utf8');
  const globs = [];
  let inPackages = false;
  for (const line of workspace.split('\n')) {
    if (line.startsWith('packages:')) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    if (/^\S/.test(line)) break;
    const glob = line.match(/^\s+-\s+(\S+)/)?.[1];
    if (glob !== undefined) globs.push(glob);
  }
  if (globs.length === 0) throw new Error('workspace parsing broke');

  return globs.flatMap((glob) => {
    if (!glob.endsWith('/*')) {
      throw new Error(`unsupported workspace glob shape: ${glob}`);
    }
    const parent = fileURLToPath(new URL(glob.slice(0, -1), root));
    return readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(parent, entry.name))
      .filter((directory) => existsSync(join(directory, 'package.json')))
      .map((directory) => ({
        glob,
        directory,
        manifest: JSON.parse(
          readFileSync(join(directory, 'package.json'), 'utf8'),
        ),
      }));
  });
}

export const GATED_PRODUCT_PACKAGES = [
  '@codaco/documentation',
  'networkcanvas.com',
  '@codaco/studio-client',
  '@codaco/studio-rpc',
  '@codaco/studio-server',
  '@codaco/studio-sync',
];

export const GATED_PRODUCT_DIRS = {
  '@codaco/documentation': 'apps/documentation',
  'networkcanvas.com': 'apps/networkcanvas.com',
  '@codaco/studio-client': 'apps/studio/client',
  '@codaco/studio-rpc': 'packages/studio-rpc',
  '@codaco/studio-server': 'apps/studio/server',
  '@codaco/studio-sync': 'packages/studio-sync',
};

// Documentation, Website, and Studio keep separately generated release PRs
// because they release independently from the normal Changesets lane.
// Architect and Interviewer are private packages in that normal lane alongside
// libraries. The Studio lane spans all four Studio workspace packages — the
// two deployable halves plus their private boundary packages — so a Studio
// changeset can name any of them without touching the normal lane.
export const GATED_PRODUCT_RELEASE_LANES = {
  documentation: ['@codaco/documentation'],
  website: ['networkcanvas.com'],
  studio: [
    '@codaco/studio-client',
    '@codaco/studio-rpc',
    '@codaco/studio-server',
    '@codaco/studio-sync',
  ],
};

export function releaseLaneForProduct(
  product,
  lanes = GATED_PRODUCT_RELEASE_LANES,
) {
  return (
    Object.entries(lanes).find(([, products]) =>
      products.includes(product),
    )?.[0] ?? null
  );
}

// Apps compile workspace package source into their own bundles, so releasing a
// package normally does not force an app release — the next app release picks
// the new source up anyway. `@codaco/interview` is the exception: it is the
// participant-facing interview runtime embedded in Architect (preview mode),
// Interviewer, and Fresco, so an interview release that no app release carries
// never reaches anyone. A changeset naming it must also name every bundling
// app. `changeset-app-utils.test.mjs` guards this map against the apps' real
// dependency lists.
export const BUNDLED_RUNTIME_DEPENDENTS = {
  '@codaco/interview': ['@codaco/architect', 'fresco', '@codaco/interviewer'],
};

export function missingBundlingApps(
  cs,
  dependents = BUNDLED_RUNTIME_DEPENDENTS,
) {
  const named = new Set(cs.releases.map((r) => r.name));
  return Object.entries(dependents)
    .filter(([pkg]) => named.has(pkg))
    .map(([pkg, apps]) => ({
      package: pkg,
      missingApps: apps.filter((app) => !named.has(app)),
    }))
    .filter((entry) => entry.missingApps.length > 0);
}

// Workspaces with no release path at all: never published, never deployed, and
// in no gated lane. A changeset must not name one.
//
// The default is the other way round, which is why this needs a guard rather
// than a convention. `privatePackages.version` is `true` and these are not in
// the config `ignore` list, so `changeset version` does not reject a changeset
// naming one — it bumps the package and writes it a `CHANGELOG.md` in the
// normal lane's Version Packages PR, announcing a release of something nobody
// can install.
//
// Being private is not the qualifying property on its own: `@codaco/architect`,
// `@codaco/interviewer`, `fresco` and `@codaco/background-creator` are private
// and deploy from the normal lane; `@codaco/art` and `@codaco/interface-images`
// are private and versioned in it on purpose (both carry a `CHANGELOG.md`); and
// the Studio packages are private and released by the Studio lane. What
// qualifies is having none of those paths, which every manifest already says —
// so this is read from the workspace rather than typed out. A hand list is what
// goes quiet at exactly the wrong moment: #1842 split
// `@codaco/protocol-builder-core` out of `@codaco/protocol-builder`, and a new
// package inherits no entry someone wrote for the old one.
//
// `changeset-app-utils.test.mjs` holds every derived entry to the same standard
// from the other side, and names packages that must and must not be in it.
// A Cloudflare Worker deploys from its own `wrangler` config — by hand for
// `workers/posthog-proxy`, whose changesets say so in as many words. Deployed
// is a release path, so a changeset may name one; it is the artefact rather
// than the directory that says so, and nothing outside `workers/` carries one.
const isDeployedWorker = (directory) =>
  readdirSync(directory).some((entry) => entry.startsWith('wrangler.'));

const unreleasedPackages = (root = REPO_ROOT) => {
  const { ignore } = readJson(new URL('.changeset/config.json', root));
  // A package npm has never heard of but whose first publication is approved is
  // about to have a publish path (CLAUDE.md: first publications are made by
  // hand, so its version moves outside the lane and no changeset should name it
  // either — but that is the first-publication guard's refusal to make, with
  // its own explanation, not this one's).
  const { approvals } = readJson(
    new URL('.github/npm-first-publications.json', root),
  );
  const approved = new Set(approvals.map((approval) => approval.name));

  return workspaceManifests(root)
    .filter(
      ({ directory, manifest }) =>
        manifest.private === true &&
        manifest.publishConfig === undefined &&
        !existsSync(join(directory, 'CHANGELOG.md')) &&
        !GATED_PRODUCT_PACKAGES.includes(manifest.name) &&
        !ignore.includes(manifest.name) &&
        !approved.has(manifest.name) &&
        !isDeployedWorker(directory),
    )
    .map(({ manifest }) => manifest.name)
    .toSorted((left, right) => (left < right ? -1 : left > right ? 1 : 0));
};

export const UNRELEASED_PACKAGES = unreleasedPackages();

export function unreleasedReleases(cs, unreleased = UNRELEASED_PACKAGES) {
  const names = new Set(unreleased);
  return cs.releases.filter((release) => names.has(release.name));
}

export function parseChangeset(contents) {
  const m = contents.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { releases: [], summary: contents.trim() };
  const releases = [];
  for (const line of m[1].split(/\r?\n/)) {
    const lm = line.match(
      /^\s*["']?(@?[^"':]+?)["']?\s*:\s*(major|minor|patch)\s*$/,
    );
    if (lm) releases.push({ name: lm[1].trim(), type: lm[2] });
  }
  return { releases, summary: m[2].trim() };
}

export function readChangesets(changesetDir) {
  return readdirSync(changesetDir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .toSorted()
    .map((f) => ({
      id: f.slice(0, -3),
      ...parseChangeset(readFileSync(join(changesetDir, f), 'utf8')),
    }));
}

// Whether `changeset version` will leave this changeset alone: it names at
// least one package and every package it names is in the config `ignore`
// list. Such changesets belong to a separately gated lane and persist in
// .changeset/ until that lane's release PR consumes them. Everything else —
// a changeset naming any normal-lane package, or an empty one — is the normal
// lane's, and its presence sends changesets/action down the "regenerate the
// release PR" path instead of publishing. prune-ignored-changesets.mjs hides
// the former from the action; check-version-packages-freshness.mjs refuses a
// release-PR merge that leaves any of the latter behind.
export function isIgnoredLaneChangeset(cs, ignored) {
  return (
    cs.releases.length > 0 &&
    cs.releases.every((release) => ignored.has(release.name))
  );
}

export function classifyChangeset(
  cs,
  productPackages = GATED_PRODUCT_PACKAGES,
) {
  const products = new Set(productPackages);
  return {
    gatedProductReleases: cs.releases.filter((r) => products.has(r.name)),
    normalReleases: cs.releases.filter((r) => !products.has(r.name)),
  };
}

export function isMixedChangeset(cs, productPackages = GATED_PRODUCT_PACKAGES) {
  const { gatedProductReleases, normalReleases } = classifyChangeset(
    cs,
    productPackages,
  );
  return gatedProductReleases.length > 0 && normalReleases.length > 0;
}

export function isMultiProductLaneChangeset(
  cs,
  productPackages = GATED_PRODUCT_PACKAGES,
  lanes = GATED_PRODUCT_RELEASE_LANES,
) {
  const { gatedProductReleases } = classifyChangeset(cs, productPackages);
  const releaseLanes = gatedProductReleases.map((release) =>
    releaseLaneForProduct(release.name, lanes),
  );
  // A gated product missing from the lane map is a configuration error. Treat
  // it as its own lane so a changeset cannot silently couple it to another
  // product.
  return (
    new Set(
      releaseLanes.map(
        (lane, index) =>
          lane ?? `unconfigured:${gatedProductReleases[index].name}`,
      ),
    ).size > 1
  );
}

export function nextStableVersion(current, entries) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!match) {
    throw new Error(
      `Version "${current}" is not a stable semver version (expected e.g. 0.1.0).`,
    );
  }

  const releaseType = ['major', 'minor', 'patch'].find((type) =>
    entries.some((entry) => entry.type === type),
  );
  if (!releaseType) {
    throw new Error('Stable releases require at least one changeset.');
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (releaseType === 'major') return `${major + 1}.0.0`;
  if (releaseType === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const TYPE_HEADINGS = {
  major: 'Major Changes',
  minor: 'Minor Changes',
  patch: 'Patch Changes',
};

export function renderChangelogSection(version, entries) {
  const lines = [`## ${version}`, ''];
  for (const type of ['major', 'minor', 'patch']) {
    const forType = entries.filter((e) => e.type === type);
    if (forType.length === 0) continue;
    lines.push(`### ${TYPE_HEADINGS[type]}`, '');
    for (const e of forType) {
      const [first, ...rest] = e.summary.trim().split('\n');
      lines.push(`- ${first}`);
      // Blank continuation lines must stay truly empty; indenting them would
      // emit trailing whitespace that fails `oxfmt --check`.
      for (const r of rest) lines.push(r.trim() === '' ? '' : `  ${r}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
