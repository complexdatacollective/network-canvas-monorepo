// Age-gate exemption for Dependabot security updates.
//
// Context: pnpm's `minimumReleaseAge` gate (see pnpm-workspace.yaml) refuses
// dependency versions younger than 24h, and pnpm re-verifies this on
// `pnpm install --frozen-lockfile`. Dependabot *security* updates bypass the
// Dependabot `cooldown`, so they open against a freshly published fix — which
// the gate then rejects, turning the whole PR red.
//
// This script runs on Dependabot PRs (see dependabot-age-exempt.yml). It:
//   1. attempts a frozen install; if it already passes, does nothing;
//   2. if it fails *specifically* on the age gate, finds the exact
//      name@version entries this PR introduced into pnpm-lock.yaml and adds
//      them to `minimumReleaseAgeExclude`;
//   3. re-verifies that the install now passes.
// The workflow then commits the (narrow, version-pinned) exemption. Because
// each entry pins one version, it becomes inert once that version ages past
// the gate.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const WORKSPACE = 'pnpm-workspace.yaml';

const baseSha = process.env.BASE_SHA;
if (!baseSha) {
  console.error('BASE_SHA is not set — cannot diff the lockfile.');
  process.exit(1);
}

/** Attempt a frozen, script-free install and capture its output. */
const install = () => {
  try {
    execSync('pnpm install --frozen-lockfile --ignore-scripts', {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return { ok: true, output: '' };
  } catch (error) {
    return {
      ok: false,
      output: `${error.stdout ?? ''}\n${error.stderr ?? ''}`,
    };
  }
};

const first = install();
if (first.ok) {
  console.log('Frozen install passed the age gate — no exemption needed.');
  process.exit(0);
}
if (!/MINIMUM_RELEASE_AGE/.test(first.output)) {
  console.error(
    'Install failed for a reason other than the age gate — leaving it for CI to report.',
  );
  console.error(first.output);
  process.exit(1);
}

// The exact package versions this PR introduced into the lockfile. Matches
// pnpm-lock v9 `packages:` / `snapshots:` keys (optional quote, optional
// @scope/, name, @<version>, optional (peer…) suffix, trailing colon) and
// captures the bare name@version.
const diff = execSync(`git diff ${baseSha} HEAD -- pnpm-lock.yaml`, {
  encoding: 'utf8',
});
const introduced = [];
const seen = new Set();
for (const line of diff.split('\n')) {
  if (line[0] !== '+') continue;
  const match = line.match(
    /^\+\s+'?((?:@[^/@'\s]+\/)?[^@'\s()]+@\d[^'():\s]*)'?(?:\([^)]*\))?'?\s*:/,
  );
  if (match && !seen.has(match[1])) {
    seen.add(match[1]);
    introduced.push(match[1]);
  }
}
if (introduced.length === 0) {
  console.error(
    'Age-gate violation, but no changed lockfile entries were found to exempt.',
  );
  process.exit(1);
}

// Merge into minimumReleaseAgeExclude, preserving existing order and layout.
const lines = readFileSync(WORKSPACE, 'utf8').split('\n');
const keyIdx = lines.findIndex((l) => /^minimumReleaseAgeExclude\s*:/.test(l));
if (keyIdx === -1) {
  console.error('minimumReleaseAgeExclude key not found in pnpm-workspace.yaml.');
  process.exit(1);
}

const existing = [];
const inline = lines[keyIdx].match(/:\s*\[(.*)\]\s*$/);
let removeCount = 1;
if (inline) {
  for (const part of inline[1].split(',')) {
    const value = part.trim().replace(/^['"]|['"]$/g, '');
    if (value) existing.push(value);
  }
} else {
  let i = keyIdx + 1;
  while (i < lines.length && /^\s+-\s+/.test(lines[i])) {
    existing.push(
      lines[i].replace(/^\s+-\s+/, '').trim().replace(/^['"]|['"]$/g, ''),
    );
    i++;
  }
  removeCount = i - keyIdx;
}

const existingSet = new Set(existing);
const additions = introduced.filter((value) => !existingSet.has(value));
if (additions.length === 0) {
  console.error(
    'Age-gate violation, but the offending versions are already exempted — aborting.',
  );
  process.exit(1);
}

const merged = [...existing, ...additions];
const block = ['minimumReleaseAgeExclude:', ...merged.map((v) => `  - '${v}'`)];
lines.splice(keyIdx, removeCount, ...block);
writeFileSync(WORKSPACE, lines.join('\n'));

const second = install();
if (!second.ok) {
  console.error('Install still fails after adding exemptions:');
  console.error(second.output);
  process.exit(1);
}

console.log(`Exempted from the age gate: ${additions.join(', ')}`);
