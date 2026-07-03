# PWA App Beta Releases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `@codaco/architect-web` and `@codaco/interviewer-v8` a changeset-driven, per-app `-beta.N` release flow: authored with the real `pnpm changeset`, gated by a bot-maintained "Release apps" PR, and released (Netlify production + GitHub release) on merge — without disturbing the library `changesets/action` train.

**Architecture:** The two apps stay `private: true` and in the changeset `ignore` list, which makes the library `changeset version` preserve (not consume) their changesets. Our own root scripts read those app changesets, increment only the `-beta.N` counter (base is human-controlled), write per-app `CHANGELOG.md`s, and delete the consumed files. A push-to-`main` bot job runs that versioning on a `changeset-release/apps` branch and maintains a summary PR; merging it bumps the app version, which a version-diff job detects to build, deploy to Netlify prod, and cut a GitHub release. Documentation and a `creating-a-changeset` project skill teach the two-lane authoring rules.

**Tech Stack:** Node 24 ESM scripts (`node --test` built-in runner, no new deps), GitHub Actions, `softprops/action-gh-release`, `peter-evans/create-pull-request`, `netlify-cli`, changesets (libraries only).

## Global Constraints

- **Node** 24.11.1 (`.nvmrc`); scripts are ESM `.mjs`. Use the built-in `node --test` runner — do **not** add vitest at the root.
- **No new runtime/dev dependencies** — the changeset format is hand-parsed (as `scripts/release-notes.mjs` already does). `@changesets/read` is _not_ resolvable from the repo root; do not import it.
- **App packages / dirs (exact):** `@codaco/architect-web` → `apps/architect-web`; `@codaco/interviewer-v8` → `apps/interviewer-v8`.
- **Both apps must stay** `"private": true` and remain in `.changeset/config.json` `ignore`. This is the load-bearing config — do not remove them.
- **Start versions:** both apps `8.0.0-beta.0`. Base `8.0.0` is human-controlled; tooling only increments `-beta.N`.
- **GitHub release action:** `softprops/action-gh-release@718ea10b132b3b2eba29c1007bb80653f286566b # v3.0.1` (match the pinned SHA already used in the workflow).
- **App release git tags:** `@codaco/architect-web@<version>` / `@codaco/interviewer-v8@<version>` (scoped — legacy apps use `v<version>`; do not collide).
- **Netlify:** architect site secret `NETLIFY_SITE_ID_ARCHITECT` (exists), interviewer `NETLIFY_SITE_ID_INTERVIEWER` (must be set). Shared `NETLIFY_AUTH_TOKEN`.
- **Code style (CLAUDE.md):** no `any`, no barrel files, comment only unusual/complex code. The pre-commit hook (`lint-staged` → `oxfmt`) auto-formats staged files on commit — do **not** add manual lint/format steps.
- **Spec:** `docs/superpowers/specs/2026-07-03-pwa-app-beta-releases-design.md`.

---

### Task 1: Shared changeset-app utilities

**Files:**

- Create: `scripts/changeset-app-utils.mjs`
- Test: `scripts/changeset-app-utils.test.mjs`
- Modify: `package.json` (root — add `test:scripts` script)

**Interfaces:**

- Produces:
  - `APP_PACKAGES: string[]` = `['@codaco/architect-web', '@codaco/interviewer-v8']`
  - `APP_DIRS: Record<string,string>` = `{ '@codaco/architect-web': 'apps/architect-web', '@codaco/interviewer-v8': 'apps/interviewer-v8' }`
  - `parseChangeset(contents: string): { releases: {name,type}[], summary: string }`
  - `readChangesets(changesetDir: string): { id, releases, summary }[]`
  - `classifyChangeset(cs, appPackages?): { appReleases, libReleases }`
  - `isMixedChangeset(cs, appPackages?): boolean`
  - `nextBetaVersion(current: string): string` (throws if not `X.Y.Z-beta.N`)
  - `renderChangelogSection(version: string, entries: {type,summary}[]): string`

- [ ] **Step 1: Write the failing tests**

Create `scripts/changeset-app-utils.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  classifyChangeset,
  isMixedChangeset,
  nextBetaVersion,
  parseChangeset,
  readChangesets,
  renderChangelogSection,
} from './changeset-app-utils.mjs';

test('parseChangeset extracts releases and summary', () => {
  const md = `---\n"@codaco/architect-web": minor\n'@codaco/interviewer-v8': patch\n---\n\nDid a thing`;
  assert.deepEqual(parseChangeset(md), {
    releases: [
      { name: '@codaco/architect-web', type: 'minor' },
      { name: '@codaco/interviewer-v8', type: 'patch' },
    ],
    summary: 'Did a thing',
  });
});

test('parseChangeset tolerates a body-only file', () => {
  assert.deepEqual(parseChangeset('just text'), {
    releases: [],
    summary: 'just text',
  });
});

test('readChangesets reads and ids each .md, skipping README/config', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cs-'));
  writeFileSync(
    join(dir, 'happy-cat.md'),
    `---\n"@codaco/architect-web": minor\n---\n\nA`,
  );
  writeFileSync(join(dir, 'README.md'), 'not a changeset');
  const got = readChangesets(dir);
  assert.equal(got.length, 1);
  assert.equal(got[0].id, 'happy-cat');
  assert.deepEqual(got[0].releases, [
    { name: '@codaco/architect-web', type: 'minor' },
  ]);
});

test('classifyChangeset splits app vs library releases', () => {
  const cs = {
    id: 'x',
    summary: '',
    releases: [
      { name: '@codaco/architect-web', type: 'minor' },
      { name: '@codaco/interview', type: 'patch' },
    ],
  };
  const { appReleases, libReleases } = classifyChangeset(cs);
  assert.deepEqual(appReleases, [
    { name: '@codaco/architect-web', type: 'minor' },
  ]);
  assert.deepEqual(libReleases, [{ name: '@codaco/interview', type: 'patch' }]);
});

test('isMixedChangeset: true only when an app and a library share one changeset', () => {
  const app = { releases: [{ name: '@codaco/architect-web', type: 'minor' }] };
  const lib = { releases: [{ name: '@codaco/interview', type: 'minor' }] };
  const both = { releases: [...app.releases, ...lib.releases] };
  const twoApps = {
    releases: [
      { name: '@codaco/architect-web', type: 'minor' },
      { name: '@codaco/interviewer-v8', type: 'minor' },
    ],
  };
  assert.equal(isMixedChangeset(app), false);
  assert.equal(isMixedChangeset(lib), false);
  assert.equal(isMixedChangeset(both), true);
  assert.equal(isMixedChangeset(twoApps), false); // both ignored → not "mixed"
});

test('nextBetaVersion increments only the beta counter', () => {
  assert.equal(nextBetaVersion('8.0.0-beta.0'), '8.0.0-beta.1');
  assert.equal(nextBetaVersion('8.0.0-beta.9'), '8.0.0-beta.10');
  assert.equal(nextBetaVersion('9.1.0-beta.0'), '9.1.0-beta.1');
});

test('nextBetaVersion rejects a non-beta version', () => {
  assert.throws(() => nextBetaVersion('8.0.0'), /not on a -beta\.N line/);
  assert.throws(
    () => nextBetaVersion('8.0.0-alpha.3'),
    /not on a -beta\.N line/,
  );
});

test('renderChangelogSection groups entries by bump type', () => {
  const out = renderChangelogSection('8.0.0-beta.1', [
    { type: 'minor', summary: 'Add X' },
    { type: 'patch', summary: 'Fix Y' },
    { type: 'minor', summary: 'Add Z' },
  ]);
  assert.equal(
    out,
    '## 8.0.0-beta.1\n\n### Minor Changes\n\n- Add X\n- Add Z\n\n### Patch Changes\n\n- Fix Y\n',
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/changeset-app-utils.test.mjs`
Expected: FAIL — `Cannot find module './changeset-app-utils.mjs'`.

- [ ] **Step 3: Write the implementation**

Create `scripts/changeset-app-utils.mjs`:

```js
// Helpers for the app (beta) release lane. The two PWA apps are kept in the
// changeset `ignore` list, so `changeset version` never consumes their
// changesets — this module reads and versions them for our own tooling.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const APP_PACKAGES = ['@codaco/architect-web', '@codaco/interviewer-v8'];

export const APP_DIRS = {
  '@codaco/architect-web': 'apps/architect-web',
  '@codaco/interviewer-v8': 'apps/interviewer-v8',
};

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
      for (const r of rest) lines.push(`  ${r}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/changeset-app-utils.test.mjs`
Expected: PASS — all tests pass.

- [ ] **Step 5: Add the root `test:scripts` script**

In `package.json` (root), add to `scripts` (next to `test`):

```json
"test:scripts": "node --test scripts/",
```

- [ ] **Step 6: Run the aggregate script test command**

Run: `pnpm test:scripts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/changeset-app-utils.mjs scripts/changeset-app-utils.test.mjs package.json
git commit -m "feat(release): add changeset-app utilities for the beta app lane"
```

---

### Task 2: Mixed-changeset isolation guard

**Files:**

- Create: `scripts/check-changeset-app-isolation.mjs`
- Test: `scripts/check-changeset-app-isolation.test.mjs`
- Modify: `package.json` (root — add `check:changesets` script)

**Interfaces:**

- Consumes (Task 1): `readChangesets`, `isMixedChangeset`, `classifyChangeset`.
- Produces: CLI exiting `0` when clean, `1` listing offenders when a changeset mixes an app + a library. Reads `<cwd>/.changeset`.

- [ ] **Step 1: Write the failing test**

Create `scripts/check-changeset-app-isolation.test.mjs`:

```js
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const GUARD = join(scriptDir, 'check-changeset-app-isolation.mjs');

function fixture(files) {
  const cwd = mkdtempSync(join(tmpdir(), 'guard-'));
  mkdirSync(join(cwd, '.changeset'));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(cwd, '.changeset', name), body);
  }
  return cwd;
}

function run(cwd) {
  return spawnSync(process.execPath, [GUARD], { cwd, encoding: 'utf8' });
}

test('passes when app-only and library-only changesets coexist', () => {
  const cwd = fixture({
    'a.md': `---\n"@codaco/architect-web": minor\n---\n\napp change`,
    'b.md': `---\n"@codaco/interview": minor\n---\n\nlib change`,
  });
  assert.equal(run(cwd).status, 0);
});

test('fails and names the file when a changeset mixes an app and a library', () => {
  const cwd = fixture({
    'bad.md': `---\n"@codaco/architect-web": minor\n"@codaco/interview": patch\n---\n\nmixed`,
  });
  const res = run(cwd);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /bad\.md/);
  assert.match(res.stderr, /pnpm changeset/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/check-changeset-app-isolation.test.mjs`
Expected: FAIL — guard script does not exist.

- [ ] **Step 3: Write the implementation**

Create `scripts/check-changeset-app-isolation.mjs`:

```js
#!/usr/bin/env node
// CI guard: a single changeset must not mix an app (ignored) with a library.
// `changeset version` hard-errors on such "mixed" changesets, which would break
// the entire library release. Fail fast on the PR instead.
import { join } from 'node:path';

import {
  classifyChangeset,
  isMixedChangeset,
  readChangesets,
} from './changeset-app-utils.mjs';

const changesets = readChangesets(join(process.cwd(), '.changeset'));
const offenders = changesets.filter((cs) => isMixedChangeset(cs));

if (offenders.length === 0) process.exit(0);

console.error(
  'Mixed changesets found — these combine an app with a library and would break\n' +
    'the library release (`changeset version` rejects them):\n',
);
for (const cs of offenders) {
  const { appReleases, libReleases } = classifyChangeset(cs);
  console.error(`  .changeset/${cs.id}.md`);
  console.error(`    apps:      ${appReleases.map((r) => r.name).join(', ')}`);
  console.error(`    libraries: ${libReleases.map((r) => r.name).join(', ')}`);
}
console.error(
  '\nSplit each into an app-only changeset and a library-only changeset ' +
    '(run `pnpm changeset` twice).',
);
process.exit(1);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/check-changeset-app-isolation.test.mjs`
Expected: PASS.

- [ ] **Step 5: Add the root script and run against the real repo**

In `package.json` (root) `scripts`, add:

```json
"check:changesets": "node scripts/check-changeset-app-isolation.mjs",
```

Run: `pnpm check:changesets; echo "exit: $?"`
Expected: `exit: 0` (the repo currently has no mixed changesets).

- [ ] **Step 6: Commit**

```bash
git add scripts/check-changeset-app-isolation.mjs scripts/check-changeset-app-isolation.test.mjs package.json
git commit -m "feat(release): add mixed-changeset isolation guard"
```

---

### Task 3: Version-beta-apps script

**Files:**

- Create: `scripts/version-beta-apps.mjs`
- Test: `scripts/version-beta-apps.test.mjs`

**Interfaces:**

- Consumes (Task 1): `APP_PACKAGES`, `APP_DIRS`, `readChangesets`, `nextBetaVersion`, `renderChangelogSection`.
- Produces:
  - `planAppReleases(cwd, appPackages?): { plans: {pkg,dir,from,to,entries}[], consumed: string[] }`
  - `applyAppReleases(cwd, plans, consumed): void` — writes package.json versions, prepends CHANGELOG sections, deletes consumed `.changeset/<id>.md`.
  - `renderPrBody(plans): string`
  - CLI (`--out <path>`): runs plan+apply against `process.cwd()`, writes the PR body to `--out` and stdout.

- [ ] **Step 1: Write the failing test**

Create `scripts/version-beta-apps.test.mjs`:

```js
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  applyAppReleases,
  planAppReleases,
  renderPrBody,
} from './version-beta-apps.mjs';

function workspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'vba-'));
  mkdirSync(join(cwd, '.changeset'));
  mkdirSync(join(cwd, 'apps/architect-web'), { recursive: true });
  mkdirSync(join(cwd, 'apps/interviewer-v8'), { recursive: true });
  writeFileSync(
    join(cwd, 'apps/architect-web/package.json'),
    JSON.stringify(
      { name: '@codaco/architect-web', version: '8.0.0-beta.0', private: true },
      null,
      2,
    ),
  );
  writeFileSync(
    join(cwd, 'apps/interviewer-v8/package.json'),
    JSON.stringify(
      {
        name: '@codaco/interviewer-v8',
        version: '8.0.0-beta.0',
        private: true,
      },
      null,
      2,
    ),
  );
  return cwd;
}

test('bumps only apps with pending changesets, leaving base + other app untouched', () => {
  const cwd = workspace();
  writeFileSync(
    join(cwd, '.changeset/one.md'),
    `---\n"@codaco/architect-web": minor\n---\n\nAdd search`,
  );
  writeFileSync(
    join(cwd, '.changeset/keep.md'),
    `---\n"@codaco/interview": patch\n---\n\nlib only`,
  );

  const { plans, consumed } = planAppReleases(cwd);
  applyAppReleases(cwd, plans, consumed);

  const arch = JSON.parse(
    readFileSync(join(cwd, 'apps/architect-web/package.json'), 'utf8'),
  );
  const intv = JSON.parse(
    readFileSync(join(cwd, 'apps/interviewer-v8/package.json'), 'utf8'),
  );
  assert.equal(arch.version, '8.0.0-beta.1'); // beta incremented
  assert.equal(intv.version, '8.0.0-beta.0'); // untouched — no changeset
  assert.match(
    readFileSync(join(cwd, 'apps/architect-web/CHANGELOG.md'), 'utf8'),
    /## 8\.0\.0-beta\.1[\s\S]*Add search/,
  );
  assert.equal(existsSync(join(cwd, '.changeset/one.md')), false); // consumed
  assert.equal(existsSync(join(cwd, '.changeset/keep.md')), true); // library changeset preserved
});

test('renderPrBody summarises the plans', () => {
  const body = renderPrBody([
    {
      pkg: '@codaco/architect-web',
      dir: 'apps/architect-web',
      from: '8.0.0-beta.0',
      to: '8.0.0-beta.1',
      entries: [{ type: 'minor', summary: 'Add search' }],
    },
  ]);
  assert.match(
    body,
    /\| `@codaco\/architect-web` \| 8\.0\.0-beta\.0 \| 8\.0\.0-beta\.1 \|/,
  );
  assert.match(body, /Add search/);
});

test('no pending app changesets → empty plan, no writes', () => {
  const cwd = workspace();
  const { plans, consumed } = planAppReleases(cwd);
  assert.deepEqual(plans, []);
  assert.deepEqual(consumed, []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/version-beta-apps.test.mjs`
Expected: FAIL — `Cannot find module './version-beta-apps.mjs'`.

- [ ] **Step 3: Write the implementation**

Create `scripts/version-beta-apps.mjs`:

```js
#!/usr/bin/env node
// Version step for the app (beta) release lane. Reads pending app changesets,
// increments each app's -beta.N (base untouched), writes CHANGELOG sections,
// deletes the consumed changesets, and emits a PR-body summary. Consumed by the
// `apps-release-pr` workflow job. Apps with no pending changesets are skipped.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  APP_DIRS,
  APP_PACKAGES,
  nextBetaVersion,
  readChangesets,
  renderChangelogSection,
} from './changeset-app-utils.mjs';

export function planAppReleases(cwd, appPackages = APP_PACKAGES) {
  const changesets = readChangesets(join(cwd, '.changeset'));
  const consumed = new Set();
  const plans = [];
  for (const pkg of appPackages) {
    const entries = [];
    for (const cs of changesets) {
      const rel = cs.releases.find((r) => r.name === pkg);
      if (!rel) continue;
      entries.push({ type: rel.type, summary: cs.summary });
      consumed.add(cs.id);
    }
    if (entries.length === 0) continue;
    const dir = APP_DIRS[pkg];
    const current = JSON.parse(
      readFileSync(join(cwd, dir, 'package.json'), 'utf8'),
    ).version;
    plans.push({
      pkg,
      dir,
      from: current,
      to: nextBetaVersion(current),
      entries,
    });
  }
  return { plans, consumed: [...consumed] };
}

export function applyAppReleases(cwd, plans, consumed) {
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
  if (plans.length === 0) return 'No app changes pending.\n';
  const lines = [
    'Merging this PR releases the app(s) below to Netlify **production** and',
    'creates a GitHub release for each.',
    '',
    '| App | From | To |',
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

function main() {
  const cwd = process.cwd();
  const outIdx = process.argv.indexOf('--out');
  const outPath = outIdx !== -1 ? process.argv[outIdx + 1] : null;
  const { plans, consumed } = planAppReleases(cwd);
  applyAppReleases(cwd, plans, consumed);
  const body = renderPrBody(plans);
  if (outPath) writeFileSync(outPath, body);
  process.stdout.write(body);
  console.error(
    `[version-beta-apps] released ${plans.length} app(s); consumed ${consumed.length} changeset(s).`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/version-beta-apps.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/version-beta-apps.mjs scripts/version-beta-apps.test.mjs
git commit -m "feat(release): add version-beta-apps script for the beta app lane"
```

---

### Task 4: Set app start versions and seed changelogs

**Files:**

- Modify: `apps/architect-web/package.json` (`version`)
- Modify: `apps/interviewer-v8/package.json` (`version`)
- Create: `apps/architect-web/CHANGELOG.md`
- Create: `apps/interviewer-v8/CHANGELOG.md`

**Interfaces:** none (config/content only).

- [ ] **Step 1: Set both versions to `8.0.0-beta.0`**

In `apps/architect-web/package.json` change `"version": "7.0.0-beta.1"` → `"version": "8.0.0-beta.0"`.
In `apps/interviewer-v8/package.json` change `"version": "8.0.0-alpha.14"` → `"version": "8.0.0-beta.0"`.

- [ ] **Step 2: Seed the changelogs**

Create `apps/architect-web/CHANGELOG.md`:

```markdown
# @codaco/architect-web

## 8.0.0-beta.0

- Start of the changeset-driven beta release line.
```

Create `apps/interviewer-v8/CHANGELOG.md`:

```markdown
# @codaco/interviewer-v8

## 8.0.0-beta.0

- Start of the changeset-driven beta release line.
```

- [ ] **Step 3: Verify versions and a no-op version run**

Run:

```bash
node -e 'for (const d of ["apps/architect-web","apps/interviewer-v8"]) console.log(d, require("./"+d+"/package.json").version)'
node scripts/version-beta-apps.mjs --out /dev/null; echo "exit: $?"
```

Expected: both print `8.0.0-beta.0`; the script prints `No app changes pending.` and `exit: 0`, and `git status` shows no changes beyond the two package.json + CHANGELOG edits (no app changesets exist yet, so nothing is bumped/consumed).

- [ ] **Step 4: Commit**

```bash
git add apps/architect-web/package.json apps/interviewer-v8/package.json apps/architect-web/CHANGELOG.md apps/interviewer-v8/CHANGELOG.md
git commit -m "chore(release): start architect-web & interviewer-v8 on 8.0.0-beta.0"
```

---

### Task 5: Wire the guard and script tests into the quality job

**Files:**

- Modify: `.github/workflows/ci-and-release.yml` (the `quality` job, around line 222 `Run all gates`)

**Interfaces:**

- Consumes: `pnpm check:changesets` (Task 2), `pnpm test:scripts` (Task 1).

- [ ] **Step 1: Add the two steps**

In the `quality` job, immediately after the `Run all gates` step (the `pnpm exec turbo run //#lint //#knip typecheck build test` step), add:

```yaml
- name: Changeset app-isolation guard
  run: pnpm check:changesets
- name: Release-script unit tests
  run: pnpm test:scripts
```

- [ ] **Step 2: Verify the workflow still parses and the commands pass locally**

Run:

```bash
npx --yes js-yaml .github/workflows/ci-and-release.yml >/dev/null && echo "yaml OK"
pnpm check:changesets && pnpm test:scripts
```

Expected: `yaml OK`, guard exits 0, all script tests pass.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci-and-release.yml
git commit -m "ci: run changeset app-isolation guard + release-script tests in quality"
```

---

### Task 6: Remove every-push production deploy for the two apps

**Files:**

- Modify: `.github/workflows/ci-and-release.yml` (delete jobs `deploy-architect-prod` ~line 538 and `deploy-interviewer-v8-prod` ~line 594; audit references)

**Interfaces:** none. Production deploy moves to Task 8.

- [ ] **Step 1: Delete the two jobs**

Remove the entire `deploy-architect-prod:` job block and the entire `deploy-interviewer-v8-prod:` job block from `.github/workflows/ci-and-release.yml`. Leave `deploy-architect-preview`, `deploy-interviewer-v8-preview`, and the `deploy-*-prod` job for docs/website untouched.

- [ ] **Step 2: Audit for dangling references**

Run:

```bash
grep -nE 'deploy-architect-prod|deploy-interviewer-v8-prod' .github/workflows/ci-and-release.yml || echo "no references remain"
```

Expected: `no references remain`. If the `carry-forward-statuses` job (near the end) lists either job name in its status matrix/needs, remove those entries too, then re-run the grep until it prints `no references remain`.

- [ ] **Step 3: Verify the workflow parses**

Run: `npx --yes js-yaml .github/workflows/ci-and-release.yml >/dev/null && echo "yaml OK"`
Expected: `yaml OK`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci-and-release.yml
git commit -m "ci: retire every-push prod deploy for architect-web & interviewer-v8"
```

---

### Task 7: The "Release apps" PR bot job

**Files:**

- Modify: `.github/workflows/ci-and-release.yml` (add job `apps-release-pr`)

**Interfaces:**

- Consumes: `scripts/check-changeset-app-isolation.mjs` (Task 2), `scripts/version-beta-apps.mjs` (Task 3).
- Produces: a maintained PR from branch `changeset-release/apps` → `main`.

- [ ] **Step 1: Add the job**

Add this job to `.github/workflows/ci-and-release.yml` (top-level under `jobs:`, e.g. after the `release` job):

```yaml
# Maintains a "Release apps" PR (sibling of the library "Version Packages" PR).
# On every push to main it re-runs the app version step on a fresh branch and
# opens/updates/closes the PR. Merging the PR is the release gate (see
# apps-release below). App changesets are ignored by the library release, so
# they persist here until this consumes them.
apps-release-pr:
  needs: quality
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  runs-on: ubuntu-latest
  permissions:
    contents: write
    pull-requests: write
  steps:
    - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v6
      with:
        fetch-depth: 0
    - uses: pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271 # v6.0.9
    - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6
      with:
        node-version-file: '.nvmrc'
        cache: 'pnpm'
    - run: pnpm install --frozen-lockfile --ignore-scripts
    - name: Guard against mixed changesets
      run: pnpm check:changesets
    - name: Compute app version bumps
      run: node scripts/version-beta-apps.mjs --out "${RUNNER_TEMP}/apps-release-body.md"
    - name: Open/update the Release apps PR
      uses: peter-evans/create-pull-request@5f6978faf089d4d20b00c7766989d076bb2fc7f1 # v8.1.1
      with:
        branch: changeset-release/apps
        base: main
        delete-branch: true
        title: 'Release apps (beta)'
        commit-message: 'chore(release): version beta apps'
        body-path: ${{ runner.temp }}/apps-release-body.md
```

- [ ] **Step 2: Verify the workflow parses**

Run: `npx --yes js-yaml .github/workflows/ci-and-release.yml >/dev/null && echo "yaml OK"`
Expected: `yaml OK`.

- [ ] **Step 3: Confirm the versioning logic the job relies on is covered**

Run: `node --test scripts/version-beta-apps.test.mjs`
Expected: PASS — the bump / consume-changeset / no-op behaviour this job invokes is exercised by Task 3's test.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci-and-release.yml
git commit -m "ci: add Release apps PR bot"
```

---

### Task 8: Release-on-merge — detect, deploy, GitHub release

**Files:**

- Create: `.github/scripts/detect-app-release.sh`
- Modify: `.github/workflows/ci-and-release.yml` (add jobs `apps-release-detect` and `apps-release`)

**Interfaces:**

- Consumes: `scripts/release-notes.mjs` (existing — notes from the app's `CHANGELOG.md` `## <version>` section), the build/deploy commands from the (removed) prod jobs.

- [ ] **Step 1: Write the detect script**

Create `.github/scripts/detect-app-release.sh` (mirrors `detect-legacy-release.sh`, but idempotency is a local git-tag check — there is no external repo):

```bash
#!/usr/bin/env bash
# Decides whether a PWA app (architect-web / interviewer-v8) should be released.
# Writes `version` and `released` to $GITHUB_OUTPUT.
#
# Inputs (env):
#   PKG_JSON   path to the app's package.json
#   PKG_NAME   the app's package name (used for the git tag <PKG_NAME>@<version>)
set -euo pipefail

current=$(node -p "require('./$PKG_JSON').version")
echo "version=$current" >> "$GITHUB_OUTPUT"

released=false
reason=""

# Version changed since the previous commit (i.e. the Release apps PR just merged).
if git cat-file -e "HEAD^:$PKG_JSON" 2>/dev/null; then
  previous=$(git show "HEAD^:$PKG_JSON" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")
else
  previous=""
fi
if [[ -n "$current" && "$current" != "$previous" ]]; then
  released=true
  reason="version changed ${previous:-<none>} -> $current"
fi

# Idempotency: if the tag already exists (a rerun), do not re-release.
if [[ "$released" == "true" ]] && git rev-parse -q --verify "refs/tags/$PKG_NAME@$current" >/dev/null; then
  released=false
  reason="tag $PKG_NAME@$current already exists"
fi

echo "released=$released" >> "$GITHUB_OUTPUT"
echo "[$PKG_NAME] version=$current released=$released ${reason:+($reason)}"
```

- [ ] **Step 2: Add the detect job**

Add to `.github/workflows/ci-and-release.yml`:

```yaml
apps-release-detect:
  needs: quality
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  runs-on: ubuntu-latest
  timeout-minutes: 10
  outputs:
    architect_released: ${{ steps.architect.outputs.released }}
    architect_version: ${{ steps.architect.outputs.version }}
    interviewer_released: ${{ steps.interviewer.outputs.released }}
    interviewer_version: ${{ steps.interviewer.outputs.version }}
  steps:
    - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v6
      with:
        fetch-depth: 2
        fetch-tags: true
    - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6
      with:
        node-version-file: '.nvmrc'
    - id: architect
      env:
        PKG_JSON: apps/architect-web/package.json
        PKG_NAME: '@codaco/architect-web'
      run: bash .github/scripts/detect-app-release.sh
    - id: interviewer
      env:
        PKG_JSON: apps/interviewer-v8/package.json
        PKG_NAME: '@codaco/interviewer-v8'
      run: bash .github/scripts/detect-app-release.sh
```

- [ ] **Step 3: Add the release job**

Add to `.github/workflows/ci-and-release.yml`. It builds/deploys each app whose version changed (reusing the exact build+deploy commands from the removed prod jobs) and creates a prerelease GitHub release from the CHANGELOG notes:

```yaml
apps-release:
  needs: apps-release-detect
  if: >-
    needs.apps-release-detect.outputs.architect_released == 'true' ||
    needs.apps-release-detect.outputs.interviewer_released == 'true'
  runs-on: ubuntu-latest
  timeout-minutes: 30
  permissions:
    contents: write
  env:
    NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
    VITE_FRESCO_PREVIEW_URL: ${{ secrets.VITE_FRESCO_PREVIEW_URL }}
    VITE_FRESCO_PREVIEW_API_TOKEN: ${{ secrets.VITE_FRESCO_PREVIEW_API_TOKEN }}
  steps:
    - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v6
    - uses: pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271 # v6.0.9
    - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6
      with:
        node-version-file: '.nvmrc'
        cache: 'pnpm'
    - run: pnpm install --frozen-lockfile --ignore-scripts

    # architect-web
    - if: needs.apps-release-detect.outputs.architect_released == 'true'
      name: Build & deploy architect-web to production
      run: |
        pnpm exec turbo run build --filter=@codaco/architect-web
        npx --yes netlify-cli@22 deploy --no-build --prod \
          --filter=@codaco/architect-web \
          --dir=apps/architect-web/dist \
          --site="${{ secrets.NETLIFY_SITE_ID_ARCHITECT }}"
    - if: needs.apps-release-detect.outputs.architect_released == 'true'
      name: architect-web release notes
      run: >-
        node scripts/release-notes.mjs
        --app apps/architect-web
        --pkg @codaco/architect-web
        --version ${{ needs.apps-release-detect.outputs.architect_version }}
        --out "${RUNNER_TEMP}/architect-notes.md"
    - if: needs.apps-release-detect.outputs.architect_released == 'true'
      uses: softprops/action-gh-release@718ea10b132b3b2eba29c1007bb80653f286566b # v3.0.1
      with:
        tag_name: '@codaco/architect-web@${{ needs.apps-release-detect.outputs.architect_version }}'
        name: 'Architect ${{ needs.apps-release-detect.outputs.architect_version }}'
        body_path: ${{ runner.temp }}/architect-notes.md
        prerelease: true
        make_latest: 'false'

    # interviewer-v8
    - if: needs.apps-release-detect.outputs.interviewer_released == 'true'
      name: Build & deploy interviewer-v8 to production
      run: |
        pnpm exec turbo run build --filter=@codaco/interviewer-v8^...
        pnpm --filter=@codaco/interviewer-v8 build:web
        npx --yes netlify-cli@22 deploy --no-build --prod \
          --filter=@codaco/interviewer-v8 \
          --dir=apps/interviewer-v8/dist \
          --site="${{ secrets.NETLIFY_SITE_ID_INTERVIEWER }}"
    - if: needs.apps-release-detect.outputs.interviewer_released == 'true'
      name: interviewer-v8 release notes
      run: >-
        node scripts/release-notes.mjs
        --app apps/interviewer-v8
        --pkg @codaco/interviewer-v8
        --version ${{ needs.apps-release-detect.outputs.interviewer_version }}
        --out "${RUNNER_TEMP}/interviewer-notes.md"
    - if: needs.apps-release-detect.outputs.interviewer_released == 'true'
      uses: softprops/action-gh-release@718ea10b132b3b2eba29c1007bb80653f286566b # v3.0.1
      with:
        tag_name: '@codaco/interviewer-v8@${{ needs.apps-release-detect.outputs.interviewer_version }}'
        name: 'Interviewer ${{ needs.apps-release-detect.outputs.interviewer_version }}'
        body_path: ${{ runner.temp }}/interviewer-notes.md
        prerelease: true
        make_latest: 'false'
```

- [ ] **Step 4: Verify the workflow parses and release-notes works for an app**

Run:

```bash
chmod +x .github/scripts/detect-app-release.sh
npx --yes js-yaml .github/workflows/ci-and-release.yml >/dev/null && echo "yaml OK"
node scripts/release-notes.mjs --app apps/architect-web --pkg @codaco/architect-web --version 8.0.0-beta.0
```

Expected: `yaml OK`; the release-notes command prints `- Start of the changeset-driven beta release line.` (read from the seeded CHANGELOG).

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/detect-app-release.sh .github/workflows/ci-and-release.yml
git commit -m "ci: release apps on merge (detect version bump, deploy prod, GitHub release)"
```

---

### Task 9: `creating-a-changeset` project skill

**Files:**

- Create: `.claude/skills/creating-a-changeset/SKILL.md`

**Interfaces:** none.

- [ ] **Step 1: Write the skill**

Create `.claude/skills/creating-a-changeset/SKILL.md`:

```markdown
---
name: creating-a-changeset
description: Use when finishing a change and preparing to open a PR in the network-canvas monorepo — to decide whether a changeset is needed and author it in the correct lane. Keywords: changeset, do I need a changeset, release notes, pnpm changeset, version bump, before opening a PR, releasable change.
---

# Creating a Changeset

## When a changeset is needed

Add a changeset when the change is **consumer- or participant-visible** in a
released package or app:

- A published library under `packages/*` (e.g. `@codaco/interview`,
  `@codaco/protocol-validation`) — any behaviour/API/type change consumers see.
- An app: `@codaco/architect-web` or `@codaco/interviewer-v8`.

Skip it for docs-only, test-only, CI/tooling-only, or internal refactors with no
consumer-visible effect. Don't add an empty changeset just to have one.

## Two lanes — never mix them

**A single changeset must target either libraries or an app, never both.** CI
(`pnpm check:changesets`) rejects a mixed changeset, because `changeset version`
hard-errors on it and would break the library release. If one PR changes both,
run `pnpm changeset` twice and write two files.

|           | Library packages (`packages/*`)        | Apps (`architect-web`, `interviewer-v8`)                                  |
| --------- | -------------------------------------- | ------------------------------------------------------------------------- |
| Bump type | Real semver impact (major/minor/patch) | Only **categorises** the notes — base is fixed, `-beta.N` auto-increments |
| Ships via | The "Version Packages" PR → npm        | The "Release apps (beta)" PR → Netlify prod + GitHub release              |

## How to author

1. Run `pnpm changeset`.
2. Select the package(s) — for an app, select only that app (plus optionally the
   other app; never a library alongside it).
3. Choose the bump type. For libraries this drives the released version; for apps
   it only groups the entry under Major/Minor/Patch changes.
4. Write the summary as **reader-facing release notes** — it becomes the
   changelog / GitHub release text. For app-facing entries use the
   participant-appropriate tone described in `developing-in-network-canvas`.
5. Commit the generated `.changeset/*.md` with your PR.

## Notes

- App changesets live in `.changeset/` like everyone else; the library release
  intentionally leaves them alone (the apps are in the changeset `ignore` list)
  until the "Release apps" PR consumes them.
- Full model: `docs/superpowers/specs/2026-07-03-pwa-app-beta-releases-design.md`
  and each app's `RELEASING.md`.
```

- [ ] **Step 2: Verify frontmatter and discovery**

Run:

```bash
head -4 .claude/skills/creating-a-changeset/SKILL.md
grep -q '^name: creating-a-changeset$' .claude/skills/creating-a-changeset/SKILL.md && echo "frontmatter OK"
```

Expected: shows the `name`/`description` frontmatter; prints `frontmatter OK`.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/creating-a-changeset/SKILL.md
git commit -m "docs(skill): add creating-a-changeset project skill"
```

---

### Task 10: Documentation

**Files:**

- Rewrite: `apps/interviewer-v8/RELEASING.md`
- Create: `apps/architect-web/RELEASING.md`
- Modify: `CLAUDE.md` (root — release/changeset guidance)
- Modify: `.changeset/README.md`

**Interfaces:** none.

- [ ] **Step 1: Rewrite `apps/interviewer-v8/RELEASING.md`**

Replace the whole file with content describing the new model. Required points (the current file says the opposite — "Deploys are continuous, not versioned"):

```markdown
# Releasing Interviewer v8

> **Web-only, offline-first PWA** on Netlify. Updates propagate via the service
> worker, same as architect-web.

## Versioned beta releases (changeset-driven)

interviewer-v8 is on a `8.0.0-beta.N` line. It is `private` and in the changeset
`ignore` list, so the library `changeset version` never touches it — a dedicated
lane handles it instead.

1. **Author a changeset.** `pnpm changeset`, select `@codaco/interviewer-v8`
   (see the `creating-a-changeset` skill). Never mix an app and a library in one
   changeset — CI rejects it.
2. **The "Release apps (beta)" PR.** On every push to `main`, the
   `apps-release-pr` job increments `-beta.N`, updates `CHANGELOG.md`, removes the
   consumed changesets, and opens/updates a summary PR. This PR is the release
   gate.
3. **Merge to release.** Merging bumps `package.json`; the `apps-release-detect`
   job sees the version change and `apps-release` builds (`build:web`, which runs
   the PWA precache assertion), deploys to Netlify **production**, and creates the
   GitHub release `@codaco/interviewer-v8@<version>`.

The base `8.0.0` is fixed; the bump type in a changeset only categorises the
notes. To change the base (e.g. graduate out of beta), edit `package.json`
manually.

## Service worker update propagation

(unchanged — keep the existing "Service worker update propagation" section.)

## Manual setup required (one-time)

Production deploys need `NETLIFY_SITE_ID_INTERVIEWER` set (Netlify site created
manually; `NETLIFY_AUTH_TOKEN` is shared). See the previous version of this file
for the site-creation steps.
```

(Preserve the existing "Service worker update propagation" section verbatim.)

- [ ] **Step 2: Create `apps/architect-web/RELEASING.md`**

```markdown
# Releasing Architect (web)

> **Offline-first PWA** on Netlify. Updates propagate via the service worker.

## Versioned beta releases (changeset-driven)

architect-web is on a `8.0.0-beta.N` line. It is `private` and in the changeset
`ignore` list, so the library `changeset version` never touches it.

1. **Author a changeset.** `pnpm changeset`, select `@codaco/architect-web` (see
   the `creating-a-changeset` skill). Never mix an app and a library in one
   changeset — CI rejects it.
2. **The "Release apps (beta)" PR.** On every push to `main`, the
   `apps-release-pr` job increments `-beta.N`, updates `CHANGELOG.md`, removes the
   consumed changesets, and opens/updates a summary PR. This PR is the release
   gate.
3. **Merge to release.** Merging bumps `package.json`; the `apps-release-detect`
   job sees the change and `apps-release` builds, deploys to Netlify
   **production** (`NETLIFY_SITE_ID_ARCHITECT`), and creates the GitHub release
   `@codaco/architect-web@<version>`.

The base `8.0.0` is fixed; a changeset's bump type only categorises the notes.
```

- [ ] **Step 3: Update root `CLAUDE.md`**

In `CLAUDE.md`, under the Version Management section, add a subsection describing the two lanes. Insert after the existing `pnpm changeset` guidance:

```markdown
#### Changeset lanes: libraries vs apps

- **Library packages** (`packages/*`) release to npm via `changesets/action` (the
  "Version Packages" PR).
- **The two PWA apps** (`@codaco/architect-web`, `@codaco/interviewer-v8`) are
  `private` and in the changeset `ignore` list. They release on a `-beta.N` line
  via a separate "Release apps (beta)" PR (`apps-release-pr` job) that deploys to
  Netlify production and cuts a GitHub release on merge.
- **Never put an app and a library in the same changeset** — `changeset version`
  errors on mixed changesets and `pnpm check:changesets` (a quality-gate step)
  rejects them. Write two changesets.
- See the `creating-a-changeset` skill and
  `docs/superpowers/specs/2026-07-03-pwa-app-beta-releases-design.md`.
```

- [ ] **Step 4: Note the app lane in `.changeset/README.md`**

Append to `.changeset/README.md`:

```markdown
## App changesets (architect-web / interviewer-v8)

These two apps are `private` and in the `ignore` list, so `changeset version`
preserves their changesets. They release on a `-beta.N` line via the separate
"Release apps (beta)" PR — see the `creating-a-changeset` skill. Do not combine an
app and a library in one changeset.
```

- [ ] **Step 5: Verify markdown**

Run: `git diff --stat` and skim the four files.
Expected: interviewer-v8 RELEASING.md keeps its service-worker section; the other three read correctly.

- [ ] **Step 6: Commit**

```bash
git add apps/interviewer-v8/RELEASING.md apps/architect-web/RELEASING.md CLAUDE.md .changeset/README.md
git commit -m "docs: document the changeset-driven beta app release model"
```

---

## Self-Review

**Spec coverage:**

- Part A (versions/config) → Task 4 (+ constraint to keep `private`/`ignore`).
- Part B (authoring lane + guard) → Tasks 2, 5.
- Part C (Release apps PR bot) → Tasks 1, 3, 7.
- Part D (release on merge) → Task 8.
- Part E (remove prod deploy) → Task 6.
- Part F (documentation) → Task 10.
- Part G (skill) → Task 9.
- Risks: mixed-changeset guard (Tasks 2/5); `changesets/action` co-existence (unaffected — separate branch/packages); multi-app changeset (covered by `planAppReleases` consuming a changeset once across apps — Task 3); GITHUB_TOKEN CI-retrigger caveat (documented in spec; the bot PR is mechanical); Netlify `NETLIFY_SITE_ID_INTERVIEWER` prerequisite (Task 8 + docs).

**Type consistency:** `readChangesets`/`parseChangeset`/`classifyChangeset`/`isMixedChangeset`/`nextBetaVersion`/`renderChangelogSection` defined in Task 1 are consumed with the same signatures in Tasks 2–3. `planAppReleases`/`applyAppReleases`/`renderPrBody` defined and consumed within Task 3 and used by the Task 7 CLI. Release-notes CLI flags (`--app/--pkg/--version/--out`) match the existing `scripts/release-notes.mjs`.

**Placeholder scan:** none — every code/YAML/doc step contains complete content.

## Execution Handoff

_(Filled in when handing off to execution.)_
