#!/usr/bin/env node
// Version step for one separately gated product release lane. It bumps a site
// with normal semver, writes a CHANGELOG section, deletes consumed changesets,
// and emits a PR-body summary. Private Architect and Interviewer releases use
// the normal Changesets CLI instead of this helper.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  GATED_PRODUCT_DIRS,
  GATED_PRODUCT_PACKAGES,
  GATED_PRODUCT_RELEASE_LANES,
  nextStableVersion,
  readChangesets,
  releaseLaneForProduct,
  renderChangelogSection,
} from './changeset-app-utils.mjs';

export function planProductReleases(
  cwd,
  productPackages = GATED_PRODUCT_PACKAGES,
) {
  const changesets = readChangesets(join(cwd, '.changeset'));
  const selectedProducts = new Set(productPackages);
  const plans = [];
  for (const pkg of productPackages) {
    const entries = [];
    for (const cs of changesets) {
      const rel = cs.releases.find((r) => r.name === pkg);
      if (!rel) continue;
      entries.push({ type: rel.type, summary: cs.summary });
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
      to: nextStableVersion(current, entries),
      entries,
    });
  }
  // Consume a changeset only when this invocation owns every gated product it
  // names. This protects a shared Architect+Interviewer changeset from being
  // deleted by an incorrectly scoped single-product invocation.
  const consumed = changesets
    .filter((cs) => {
      return (
        cs.releases.length > 0 &&
        cs.releases.every((release) => selectedProducts.has(release.name))
      );
    })
    .map((cs) => cs.id);
  return { plans, consumed };
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
  const lanes = new Set(plans.map((plan) => releaseLaneForProduct(plan.pkg)));
  if (lanes.size !== 1 || lanes.has(null)) {
    throw new Error('Each release PR must contain exactly one product lane.');
  }
  const products = plans.map((plan) => `\`${plan.pkg}\``);
  const lines = [
    `Merging this PR releases ${products.join(' and ')} to Netlify **production**.`,
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

export function validateTargetPackages(targetPackages) {
  const unique = [...new Set(targetPackages)];
  if (
    unique.length !== targetPackages.length ||
    unique.some((pkg) => !GATED_PRODUCT_PACKAGES.includes(pkg))
  ) {
    return null;
  }
  const laneNames = new Set(
    unique.map((pkg) => releaseLaneForProduct(pkg)).filter(Boolean),
  );
  if (laneNames.size !== 1) return null;
  const [laneName] = laneNames;
  const expected = GATED_PRODUCT_RELEASE_LANES[laneName];
  if (
    unique.length !== expected.length ||
    expected.some((pkg) => !unique.includes(pkg))
  ) {
    return null;
  }
  return unique;
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
  const targetPackages = process.argv.flatMap((arg, index, args) =>
    arg === '--package' && args[index + 1] ? [args[index + 1]] : [],
  );
  const selectedPackages = validateTargetPackages(targetPackages);
  if (!selectedPackages) {
    console.error(
      '--package must select one complete release lane: ' +
        Object.values(GATED_PRODUCT_RELEASE_LANES)
          .map((packages) =>
            packages.map((pkg) => `--package "${pkg}"`).join(' '),
          )
          .join(' OR '),
    );
    process.exit(1);
  }
  const outIdx = process.argv.indexOf('--out');
  if (outIdx !== -1 && !process.argv[outIdx + 1]) {
    console.error('--out requires a file path');
    process.exit(1);
  }
  const outPath = outIdx !== -1 ? process.argv[outIdx + 1] : null;
  const { plans, consumed } = planProductReleases(cwd, selectedPackages);
  applyProductReleases(cwd, plans, consumed);
  formatGeneratedFiles(cwd, plans);
  const body = renderPrBody(plans);
  if (outPath) writeFileSync(outPath, body);
  process.stdout.write(body);
  console.error(
    `[version-gated-products] planned ${selectedPackages.join(', ')}: ${plans.length} release(s); consumed ${consumed.length} changeset(s).`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
