// Helpers for the gated release lane. These private workspaces are kept in the
// changeset `ignore` list, so `changeset version` never consumes their
// changesets — this module reads and versions them for our own tooling.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
