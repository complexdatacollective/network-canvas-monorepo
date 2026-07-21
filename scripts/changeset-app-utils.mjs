// Helpers for the gated release lane. These private workspaces are kept in the
// changeset `ignore` list, so `changeset version` never consumes their
// changesets — this module reads and versions them for our own tooling.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const GATED_PRODUCT_PACKAGES = [
  '@codaco/architect',
  '@codaco/background-creator',
  '@codaco/documentation',
  '@codaco/interviewer',
  'networkcanvas.com',
];

export const GATED_PRODUCT_DIRS = {
  '@codaco/architect': 'apps/architect',
  '@codaco/background-creator': 'apps/background-creator',
  '@codaco/documentation': 'apps/documentation',
  '@codaco/interviewer': 'apps/interviewer',
  'networkcanvas.com': 'apps/networkcanvas.com',
};

export const STABLE_GATED_PRODUCT_PACKAGES = [
  '@codaco/documentation',
  'networkcanvas.com',
];

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
    productReleases: cs.releases.filter((r) => products.has(r.name)),
    libReleases: cs.releases.filter((r) => !products.has(r.name)),
  };
}

export function isMixedChangeset(cs, productPackages = GATED_PRODUCT_PACKAGES) {
  const { productReleases, libReleases } = classifyChangeset(
    cs,
    productPackages,
  );
  return productReleases.length > 0 && libReleases.length > 0;
}

export function isMultiProductChangeset(
  cs,
  productPackages = GATED_PRODUCT_PACKAGES,
) {
  const { productReleases } = classifyChangeset(cs, productPackages);
  return new Set(productReleases.map((release) => release.name)).size > 1;
}

// Releases that are in the Changesets `ignore` list but are NOT gated products —
// i.e. the maintenance-mode "classic" apps. They have no release lane of their
// own (`changeset version` ignores them and no product release PR consumes
// them), so an entry for one is only valid when it stands alone.
export function foreignIgnoredReleases(
  cs,
  ignore,
  productPackages = GATED_PRODUCT_PACKAGES,
) {
  const products = new Set(productPackages);
  return cs.releases.filter(
    (r) => ignore.includes(r.name) && !products.has(r.name),
  );
}

// A gated product must ship alone. `isMixedChangeset` catches product+library
// and `isMultiProductChangeset` catches product+product, but both miss a gated
// product paired with a foreign ignored app (a classic): the pair has no
// library (so it is not "mixed") and only one gated product (so it is not
// "multi-product"), yet version-beta-apps.mjs would consume the whole file for
// the product and silently drop the classic entry. This closes that gap.
export function isProductWithForeignIgnoredAppChangeset(
  cs,
  ignore,
  productPackages = GATED_PRODUCT_PACKAGES,
) {
  const products = new Set(productPackages);
  const hasProduct = cs.releases.some((r) => products.has(r.name));
  return (
    hasProduct && foreignIgnoredReleases(cs, ignore, productPackages).length > 0
  );
}

const BETA_RE = /^(\d+)\.(\d+)\.(\d+)-beta\.(\d+)$/;

export function nextBetaVersion(current) {
  const m = BETA_RE.exec(current);
  if (!m) {
    throw new Error(
      `Version "${current}" is not on a -beta.N line (expected e.g. 8.0.0-beta.0). ` +
        'Set the base version manually in the app package.json before releasing.',
    );
  }
  const [, major, minor, patch, beta] = m;
  return `${major}.${minor}.${patch}-beta.${Number(beta) + 1}`;
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
