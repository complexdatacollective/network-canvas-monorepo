#!/usr/bin/env node
// Version step for one gated product release lane. It increments an Architect or
// Interviewer beta version, or bumps Documentation with normal semver, writes a
// CHANGELOG section, deletes consumed changesets, and emits a PR-body summary.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  GATED_PRODUCT_DIRS,
  GATED_PRODUCT_PACKAGES,
  nextBetaVersion,
  nextDocumentationVersion,
  readChangesets,
  renderChangelogSection,
} from './changeset-app-utils.mjs';

export function planProductReleases(
  cwd,
  productPackages = GATED_PRODUCT_PACKAGES,
) {
  const changesets = readChangesets(join(cwd, '.changeset'));
  const consumed = new Set();
  const plans = [];
  for (const pkg of productPackages) {
    const entries = [];
    for (const cs of changesets) {
      const rel = cs.releases.find((r) => r.name === pkg);
      if (!rel) continue;
      entries.push({ type: rel.type, summary: cs.summary });
      consumed.add(cs.id);
    }
    if (entries.length === 0) continue;
    const dir = GATED_PRODUCT_DIRS[pkg];
    const current = JSON.parse(
      readFileSync(join(cwd, dir, 'package.json'), 'utf8'),
    ).version;
    plans.push({
      pkg,
      dir,
      from: current,
      to:
        pkg === '@codaco/documentation'
          ? nextDocumentationVersion(current, entries)
          : nextBetaVersion(current),
      entries,
    });
  }
  return { plans, consumed: [...consumed] };
}

export function applyProductReleases(cwd, plans, consumed) {
  for (const plan of plans) {
    const pkgJsonPath = join(cwd, plan.dir, 'package.json');
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    pkgJson.version = plan.to;
    writeFileSync(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`);

    const changelogPath = join(cwd, plan.dir, 'CHANGELOG.md');
    const section = renderChangelogSection(plan.to, plan.entries);
    let previousBody = '';
    if (existsSync(changelogPath)) {
      previousBody = readFileSync(changelogPath, 'utf8').replace(
        /^#[^\n]*\n+/,
        '',
      );
    }
    const body = `# ${plan.pkg}\n\n${section}\n${previousBody}`
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd();
    writeFileSync(changelogPath, `${body}\n`);
  }
  for (const id of consumed) {
    rmSync(join(cwd, '.changeset', `${id}.md`), { force: true });
  }
}

export function renderPrBody(plans) {
  if (plans.length === 0) return 'No product changes pending.\n';
  if (plans.length !== 1) {
    throw new Error('Each release PR must contain exactly one gated product.');
  }
  const [plan] = plans;
  const lines = [
    `Merging this PR releases \`${plan.pkg}\` to Netlify **production**.`,
    ...(plan.pkg === '@codaco/documentation'
      ? []
      : ['It also creates a GitHub prerelease.']),
    '',
    '| Product | From | To |',
    '| --- | --- | --- |',
    ...plans.map((p) => `| \`${p.pkg}\` | ${p.from} | ${p.to} |`),
    '',
  ];
  for (const p of plans) {
    const section = renderChangelogSection(p.to, p.entries)
      .replace(/^## .*\n?/, '')
      .trim();
    lines.push(`### ${p.pkg}@${p.to}`, '', section, '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

// The generated files are committed by the create-pull-request bot, which never
// fires the local pre-commit hooks. So the version step formats its own output,
// mirroring the library lane's `version-packages` (`changeset version && … &&
// pnpm lint:fix`) — otherwise an unformatted CHANGELOG lands on main and fails
// the quality gate's `oxfmt --check .` for every subsequent PR.
function formatGeneratedFiles(cwd, plans) {
  const files = plans.flatMap((p) => [
    join(cwd, p.dir, 'CHANGELOG.md'),
    join(cwd, p.dir, 'package.json'),
  ]);
  if (files.length === 0) return;
  const result = spawnSync('pnpm', ['exec', 'oxfmt', '--write', ...files], {
    cwd,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(
      `oxfmt failed to format generated release files (exit ${result.status ?? result.signal ?? 'unknown'})`,
    );
  }
}

function main() {
  const cwd = process.cwd();
  const packageIdx = process.argv.indexOf('--package');
  const targetPackage =
    packageIdx !== -1 ? process.argv[packageIdx + 1] : undefined;
  if (!targetPackage || !GATED_PRODUCT_PACKAGES.includes(targetPackage)) {
    console.error(
      `--package must be one of: ${GATED_PRODUCT_PACKAGES.map((pkg) => `"${pkg}"`).join(', ')}`,
    );
    process.exit(1);
  }
  const outIdx = process.argv.indexOf('--out');
  if (outIdx !== -1 && !process.argv[outIdx + 1]) {
    console.error('--out requires a file path');
    process.exit(1);
  }
  const outPath = outIdx !== -1 ? process.argv[outIdx + 1] : null;
  const { plans, consumed } = planProductReleases(cwd, [targetPackage]);
  applyProductReleases(cwd, plans, consumed);
  formatGeneratedFiles(cwd, plans);
  const body = renderPrBody(plans);
  if (outPath) writeFileSync(outPath, body);
  process.stdout.write(body);
  console.error(
    `[version-beta-apps] planned ${targetPackage}: ${plans.length} release; consumed ${consumed.length} changeset(s).`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
