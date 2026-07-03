// Helpers for the app (beta) release lane. The two PWA apps are kept in the
// changeset `ignore` list, so `changeset version` never consumes their
// changesets — this module reads and versions them for our own tooling.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_PACKAGES = ['@codaco/architect-web', '@codaco/interviewer-v8'];

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

export function classifyChangeset(cs, appPackages = APP_PACKAGES) {
  const apps = new Set(appPackages);
  return {
    appReleases: cs.releases.filter((r) => apps.has(r.name)),
    libReleases: cs.releases.filter((r) => !apps.has(r.name)),
  };
}

export function isMixedChangeset(cs, appPackages = APP_PACKAGES) {
  const { appReleases, libReleases } = classifyChangeset(cs, appPackages);
  return appReleases.length > 0 && libReleases.length > 0;
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

const TYPE_HEADINGS = {
  major: 'Major changes',
  minor: 'Minor changes',
  patch: 'Patch changes',
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
      for (const r of rest) lines.push(`  ${r}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
