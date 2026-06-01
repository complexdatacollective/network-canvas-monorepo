# Turbo dev dependency watchers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dev-server tasks bring up their workspace dependencies' `dev` watchers (and one-shot tasks build deps once), so consumers never run against stale dependency `dist`.

**Architecture:** Extend the existing `scripts/with-turbo.mjs` guard with two flags — `--with-deps` (re-dispatch `turbo run <task> --filter=...<pkg>`) and `--watch-deps` (build the dep closure once, run deps' `dev` watchers in the background, run the server in the foreground). Wrap each package's scripts according to a task taxonomy. No package consumes dependencies from source; everything still flows through built `dist`.

**Tech Stack:** Node.js (ESM script), pnpm workspaces, Turborepo 2.9.x.

**Spec:** `docs/superpowers/specs/2026-06-01-turbo-dev-dependency-watchers-design.md`

**Working-tree note:** the repo currently has unrelated in-progress changes. Every commit step uses explicit paths — never `git add -A`/`git add .`.

---

### Task 1: Extend the `with-turbo.mjs` guard with `--with-deps` and `--watch-deps`

Split a pure planning function (`buildPlan`) from the side-effecting `main()` so the
flag/filter logic is verifiable without spawning turbo. The verification is an inline
`node -e` assertion rather than a committed `.mjs` test file, because the repo's test
runner is vitest (per-package) and a stray standalone test would trip `pnpm knip`.

**Files:**

- Modify (overwrite): `scripts/with-turbo.mjs`

- [ ] **Step 1: Write the failing assertion and run it (red)**

Run:

```bash
node --input-type=module -e "
import assert from 'node:assert/strict';
import { buildPlan } from './scripts/with-turbo.mjs';
assert.deepEqual(buildPlan('default','build','@codaco/x').run, ['run','build','--filter=@codaco/x']);
const w = buildPlan('with-deps','dev','@codaco/x');
assert.equal(w.kind,'redispatch');
assert.deepEqual(w.run, ['run','dev','--filter=...@codaco/x']);
const s = buildPlan('watch-deps','storybook','@codaco/x');
assert.equal(s.kind,'watch');
assert.deepEqual(s.build, ['run','build','--filter=@codaco/x^...']);
assert.deepEqual(s.watch, ['run','dev','--filter=@codaco/x^...','--ui=stream']);
console.log('with-turbo buildPlan: OK');
"
```

Expected: FAIL — the current `scripts/with-turbo.mjs` does not export `buildPlan`
(`SyntaxError: ... does not provide an export named 'buildPlan'`).

- [ ] **Step 3: Rewrite the guard**

Overwrite `scripts/with-turbo.mjs` with:

```js
#!/usr/bin/env node
// Ensures a package script runs with its workspace dependencies satisfied via
// turbo. turbo injects TURBO_HASH into every task process; when this script is run
// directly (e.g. `pnpm dev`) that variable is absent, so we re-dispatch through
// turbo and turbo then re-enters this same script with TURBO_HASH set, at which
// point we run the real command. The env check breaks the otherwise-infinite
// recursion.
//
// Leading flag selects how dependencies are handled:
//   (none)        one-shot tasks (build, build-storybook, electron:build):
//                 `turbo run <task> --filter=<pkg>` — deps built once via ^build.
//   --with-deps   non-electron dev servers (dev):
//                 `turbo run dev --filter=...<pkg>` — server + every dep's dev
//                 watcher in one turbo process.
//   --watch-deps  storybook and every electron dev server:
//                 build the dep closure once, run deps' dev watchers in the
//                 background, run the server in the foreground, stop watchers on
//                 exit. (Used where `...` would mis-fan the task onto deps.)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Pure: map (mode, task, pkg) to the turbo invocation(s) needed. Exported for tests.
export function buildPlan(mode, task, pkg) {
  if (mode === 'watch-deps') {
    return {
      kind: 'watch',
      build: ['run', 'build', `--filter=${pkg}^...`],
      watch: ['run', 'dev', `--filter=${pkg}^...`, '--ui=stream'],
    };
  }
  const filter =
    mode === 'with-deps' ? `--filter=...${pkg}` : `--filter=${pkg}`;
  return { kind: 'redispatch', run: ['run', task, filter] };
}

function resolveTurbo() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const local = join(repoRoot, 'node_modules', '.bin', 'turbo');
  return existsSync(local) ? local : 'turbo';
}

function runReal(realCommand) {
  const [cmd, ...args] = realCommand;
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

function main() {
  const argv = process.argv.slice(2);
  let mode = 'default';
  let rest = argv;
  if (argv[0] === '--with-deps') {
    mode = 'with-deps';
    rest = argv.slice(1);
  } else if (argv[0] === '--watch-deps') {
    mode = 'watch-deps';
    rest = argv.slice(1);
  }
  const realCommand = rest;
  const task = process.env.npm_lifecycle_event;
  const pkg = process.env.npm_package_name;

  // Inside turbo already (or missing context): run the real command.
  if (process.env.TURBO_HASH || !task || !pkg) {
    runReal(realCommand);
    return;
  }

  const turbo = resolveTurbo();
  const plan = buildPlan(mode, task, pkg);

  if (plan.kind === 'redispatch') {
    console.error(
      `[with-turbo] "${task}" run directly; routing through turbo: turbo ${plan.run.join(' ')} ` +
        `(run that yourself to skip this notice).`,
    );
    const result = spawnSync(turbo, plan.run, { stdio: 'inherit' });
    if (result.error) {
      console.error(
        `[with-turbo] failed to launch turbo: ${result.error.message}`,
      );
      process.exit(1);
    }
    process.exit(result.status ?? 1);
  }

  // watch-deps: build deps once (no cold-start race), watch them in the
  // background, run the server in the foreground, stop watchers on exit.
  console.error(
    `[with-turbo] "${task}" run directly; building "${pkg}" dependencies then watching ` +
      `them while the server runs.`,
  );
  const built = spawnSync(turbo, plan.build, { stdio: 'inherit' });
  if (built.error) {
    console.error(
      `[with-turbo] failed to launch turbo: ${built.error.message}`,
    );
    process.exit(1);
  }
  if (built.status) process.exit(built.status);

  const watchers = spawn(turbo, plan.watch, { stdio: 'inherit' });
  const [cmd, ...args] = realCommand;
  const server = spawnSync(cmd, args, { stdio: 'inherit' });
  watchers.kill('SIGTERM');
  process.exit(server.status ?? 1);
}

// Run main only when invoked as the entry script, so tests can import buildPlan.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
```

- [ ] **Step 4: Re-run the assertion to verify it passes (green)**

Run the same `node --input-type=module -e "…"` block from Step 1.
Expected: PASS — prints `with-turbo buildPlan: OK`.

- [ ] **Step 5: Verify passthrough when under turbo (flag stripped, real command runs)**

Run:

```bash
TURBO_HASH=x npm_lifecycle_event=dev npm_package_name=@codaco/x \
  node scripts/with-turbo.mjs --with-deps node -e "console.log('REAL_RAN')"
```

Expected: prints `REAL_RAN` (the `--with-deps` flag is stripped; the real command runs because TURBO_HASH is set).

- [ ] **Step 6: Verify default re-dispatch routes through turbo**

Run:

```bash
env -u TURBO_HASH npm_lifecycle_event=build npm_package_name=@codaco/biometric-keystore \
  node scripts/with-turbo.mjs node -e "console.log('unused')" 2>&1 | grep -iE "with-turbo|FULL TURBO|cache hit"
```

Expected: prints the `[with-turbo] "build" run directly; routing through turbo: turbo run build --filter=@codaco/biometric-keystore …` notice, followed by a turbo cache hit / `FULL TURBO` line.

- [ ] **Step 7: Format and lint**

Run: `pnpm exec oxfmt scripts/with-turbo.mjs && pnpm exec oxlint --fix scripts/with-turbo.mjs`
Expected: 0 warnings, 0 errors.

- [ ] **Step 8: Commit**

```bash
git add scripts/with-turbo.mjs
git commit -m "feat(tooling): add --with-deps/--watch-deps modes to with-turbo guard"
```

---

### Task 2: Wrap `dev` (with `--with-deps`) for non-Electron servers, normalizing the four `npm run build -- --watch` libs

`--with-deps` makes `pnpm dev` / `pnpm --filter X dev` run the server plus all deps' `dev`
watchers. The four libs whose `dev` is `npm run build -- --watch` are normalized to
`vite build --watch` first (behavior-preserving — all four have `build: "vite build"`),
which is required before Task 3 wraps `build`.

**Files (Modify the `"dev"` script line in each):**

- `apps/architect-web/package.json`
- `apps/interviewer-v7/package.json`
- `packages/fresco-ui/package.json`
- `packages/interview/package.json`
- `packages/protocol-utilities/package.json`
- `packages/network-exporters/package.json`
- `packages/network-query/package.json`
- `packages/protocol-validation/package.json`
- `packages/shared-consts/package.json`

- [ ] **Step 1: Edit the already-`vite`/`vite build --watch` packages**

In each file, replace the `"dev"` value:

`apps/architect-web/package.json` and `apps/interviewer-v7/package.json`:

```
"dev": "vite"
```

→

```
"dev": "node ../../scripts/with-turbo.mjs --with-deps vite"
```

`packages/fresco-ui/package.json`, `packages/interview/package.json`, `packages/protocol-utilities/package.json`:

```
"dev": "vite build --watch"
```

→

```
"dev": "node ../../scripts/with-turbo.mjs --with-deps vite build --watch"
```

- [ ] **Step 2: Normalize + wrap the four `npm run build -- --watch` libs**

In `packages/network-exporters/package.json`, `packages/network-query/package.json`, `packages/protocol-validation/package.json`, `packages/shared-consts/package.json`, replace:

```
"dev": "npm run build -- --watch"
```

→

```
"dev": "node ../../scripts/with-turbo.mjs --with-deps vite build --watch"
```

- [ ] **Step 3: Verify the dev plan includes dependencies and has no errors**

Run: `pnpm exec turbo run dev --filter=...@codaco/interview --dry 2>&1 | grep -iE "persistent|cannot|error" | head`
Expected: no `cannot`/`error` lines (turbo accepts the multi-persistent plan).

Run: `pnpm exec turbo run dev --filter=...@codaco/interview --dry 2>&1 | grep -iE "Packages in Scope" -A1 | grep -E "@codaco" | head`
Expected: scope includes `@codaco/interview` plus its deps (`@codaco/fresco-ui`, `@codaco/shared-consts`, …).

- [ ] **Step 4: Verify a normalized lib's dev still builds in watch mode (smoke, time-boxed)**

Run: `timeout 20 pnpm exec turbo run dev --filter=@codaco/shared-consts 2>&1 | grep -iE "build|watch|vite" | head`
Expected: shows `vite build` running in watch mode (the command exits via timeout; that's fine).

- [ ] **Step 5: Format**

Run: `pnpm exec oxfmt apps/architect-web/package.json apps/interviewer-v7/package.json packages/fresco-ui/package.json packages/interview/package.json packages/protocol-utilities/package.json packages/network-exporters/package.json packages/network-query/package.json packages/protocol-validation/package.json packages/shared-consts/package.json`
Expected: completes, no diff beyond the edited lines.

- [ ] **Step 6: Commit**

```bash
git add apps/architect-web/package.json apps/interviewer-v7/package.json \
  packages/fresco-ui/package.json packages/interview/package.json \
  packages/protocol-utilities/package.json packages/network-exporters/package.json \
  packages/network-query/package.json packages/protocol-validation/package.json \
  packages/shared-consts/package.json
git commit -m "feat(dev): route dev servers + dependency watchers through turbo"
```

---

### Task 3: Wrap `build` (plain) for the dist-built libs and `architect-web`

Now that no `dev` script calls `npm run build`, wrapping `build` is safe. A direct
`pnpm --filter X build` will route through turbo and build deps first.

**Files (Modify the `"build"` script line in each):**

- `apps/architect-web/package.json`
- `packages/fresco-ui/package.json`
- `packages/interview/package.json`
- `packages/protocol-utilities/package.json`
- `packages/network-exporters/package.json`
- `packages/network-query/package.json`
- `packages/protocol-validation/package.json`
- `packages/shared-consts/package.json`

- [ ] **Step 1: Edit each `"build"` value**

In every file above, replace:

```
"build": "vite build"
```

→

```
"build": "node ../../scripts/with-turbo.mjs vite build"
```

- [ ] **Step 2: Verify build is still a normal, cached turbo task (guard is transparent under turbo)**

Run: `pnpm exec turbo run build --filter=@codaco/shared-consts 2>&1 | grep -iE "cache|FULL TURBO|vite" | head`
Expected: turbo builds (or cache-hits) `@codaco/shared-consts#build`; no recursion / no `with-turbo` notice (because turbo sets TURBO_HASH).

- [ ] **Step 3: Verify a direct build re-dispatches through turbo**

Run: `pnpm --filter @codaco/shared-consts build 2>&1 | grep -iE "with-turbo|FULL TURBO|cache" | head`
Expected: the `[with-turbo] "build" run directly; routing through turbo …` notice, then a turbo build/cache line.

- [ ] **Step 4: Confirm dev still works after build is wrapped (no `npm run build` regression)**

Run: `timeout 20 pnpm exec turbo run dev --filter=@codaco/network-exporters 2>&1 | grep -iE "watch|vite build" | head`
Expected: `vite build` runs in watch mode (normalized dev unaffected by the wrapped `build`).

- [ ] **Step 5: Format**

Run: `pnpm exec oxfmt apps/architect-web/package.json packages/fresco-ui/package.json packages/interview/package.json packages/protocol-utilities/package.json packages/network-exporters/package.json packages/network-query/package.json packages/protocol-validation/package.json packages/shared-consts/package.json`
Expected: completes.

- [ ] **Step 6: Commit**

```bash
git add apps/architect-web/package.json packages/fresco-ui/package.json \
  packages/interview/package.json packages/protocol-utilities/package.json \
  packages/network-exporters/package.json packages/network-query/package.json \
  packages/protocol-validation/package.json packages/shared-consts/package.json
git commit -m "feat(build): route direct package builds through turbo"
```

---

### Task 4: Switch `storybook` to `--watch-deps`

Storybook must run its dependencies' `dev` watchers (e.g. fresco-ui) so edits propagate,
but `--filter=...` would launch deps' own Storybooks (port clash), so it uses the
background-watcher orchestration.

**Files (Modify the `"storybook"` script line in each):**

- `packages/fresco-ui/package.json`
- `packages/interview/package.json`
- `packages/art/package.json`

- [ ] **Step 1: Edit each `"storybook"` value**

`packages/fresco-ui/package.json` and `packages/interview/package.json`:

```
"storybook": "node ../../scripts/with-turbo.mjs storybook dev -p 6006"
```

→

```
"storybook": "node ../../scripts/with-turbo.mjs --watch-deps storybook dev -p 6006"
```

`packages/art/package.json`:

```
"storybook": "node ../../scripts/with-turbo.mjs storybook dev -p 6007"
```

→

```
"storybook": "node ../../scripts/with-turbo.mjs --watch-deps storybook dev -p 6007"
```

- [ ] **Step 2: Verify the two underlying turbo invocations the guard will run (deps build + deps dev)**

Run: `pnpm exec turbo run build --filter=@codaco/interview^... --dry 2>&1 | grep -iE "Packages in Scope" -A1 | grep -E "@codaco" | head`
Expected: scope is interview's dependencies (e.g. `@codaco/fresco-ui`, `@codaco/shared-consts`) and excludes `@codaco/interview` itself.

Run: `pnpm exec turbo run dev --filter=@codaco/interview^... --dry 2>&1 | grep -iE "persistent|cannot|error" | head`
Expected: no `cannot`/`error` lines.

- [ ] **Step 3: Smoke-test propagation (the spec's open verification item)**

Manual: in one shell run `pnpm --filter @codaco/interview storybook`. Confirm the notice prints, deps build, fresco-ui's `dev` watcher starts (streamed log lines), and Storybook serves on 6006. In another shell, edit a `packages/fresco-ui/src/*.tsx` file and confirm fresco-ui's `dist` rebuilds (watcher log). Note whether the running Storybook reflects the change; if it does not, add the minimal Vite `optimizeDeps.exclude`/`server.watch` config to `packages/interview/.storybook` and re-test. Stop Storybook and confirm the background watcher exits.

- [ ] **Step 4: Format**

Run: `pnpm exec oxfmt packages/fresco-ui/package.json packages/interview/package.json packages/art/package.json`
Expected: completes.

- [ ] **Step 5: Commit**

```bash
git add packages/fresco-ui/package.json packages/interview/package.json packages/art/package.json
git commit -m "feat(storybook): watch dependency dev tasks while storybook runs"
```

---

### Task 5: Switch every Electron dev-server to `--watch-deps`

Unify all Electron dev servers onto the background-watcher orchestration (the
foreground process is the Electron app; deps' `dev` watchers run behind it).

**Files (Modify the indicated script line in each):**

- `apps/interviewer-v7/package.json` — `"electron:dev"`
- `apps/architect-desktop/package.json` — `"dev"`
- `apps/interviewer/package.json` — `"dev"`

- [ ] **Step 1: Edit `interviewer-v7` electron:dev**

`apps/interviewer-v7/package.json`:

```
"electron:dev": "node ../../scripts/with-turbo.mjs electron-vite dev"
```

→

```
"electron:dev": "node ../../scripts/with-turbo.mjs --watch-deps electron-vite dev"
```

- [ ] **Step 2: Edit the two legacy Electron apps' `dev`**

`apps/architect-desktop/package.json` and `apps/interviewer/package.json`:

```
"dev": "node ../../scripts/with-turbo.mjs electron-vite dev"
```

→

```
"dev": "node ../../scripts/with-turbo.mjs --watch-deps electron-vite dev"
```

- [ ] **Step 3: Verify the dep-watcher plans (deps only, excluding the app)**

Run: `pnpm exec turbo run dev --filter=@codaco/interviewer-v7^... --dry 2>&1 | grep -iE "Packages in Scope" -A1 | grep -E "@codaco" | head`
Expected: interviewer-v7's dependencies (fresco-ui, interview, shared-consts, …) and **not** `@codaco/interviewer-v7` itself.

Run: `pnpm exec turbo run dev --filter=network-canvas-architect^... --dry 2>&1 | grep -iE "Packages in Scope" -A1 | grep -E "@codaco" | head`
Expected: `@codaco/protocol-validation` (+ its deps), excluding `network-canvas-architect`.

- [ ] **Step 4: Verify root `turbo watch dev` still runs these directly (passthrough under turbo)**

Run: `pnpm exec turbo run dev --filter=network-canvas-architect --dry 2>&1 | grep -iE "network-canvas-architect" | head`
Expected: `network-canvas-architect#dev` appears as a task to run (turbo will execute `electron-vite dev` directly because TURBO_HASH is set inside turbo, so no orchestration recursion).

- [ ] **Step 5: Format**

Run: `pnpm exec oxfmt apps/interviewer-v7/package.json apps/architect-desktop/package.json apps/interviewer/package.json`
Expected: completes.

- [ ] **Step 6: Commit**

```bash
git add apps/interviewer-v7/package.json apps/architect-desktop/package.json apps/interviewer/package.json
git commit -m "feat(electron): watch dependency dev tasks while electron dev runs"
```

---

### Task 6: Document the task taxonomy in root `CLAUDE.md`

**Files:**

- Modify: `CLAUDE.md` (the existing "Running tasks through turbo" section)

- [ ] **Step 1: Append a subsection**

After the existing "Running tasks through turbo" prose (which ends with the
`turbo run <task> --filter=<package>` explanation), add:

````markdown
#### Dev servers and dependency watchers

`scripts/with-turbo.mjs` takes an optional leading flag selecting how workspace
dependencies are satisfied when a wrapped script is run directly:

- **(no flag)** — one-shot tasks (`build`, `build-storybook`, `electron:build`).
  Re-dispatches `turbo run <task> --filter=<pkg>`; dependencies are built once via
  `^build`.
- **`--with-deps`** — non-Electron dev servers (`dev`). Re-dispatches
  `turbo run dev --filter=...<pkg>`, running the package's dev server and every
  dependency's `dev` watcher in one turbo process.
- **`--watch-deps`** — Storybook and every Electron dev server. Builds the
  dependency closure once, runs the dependencies' `dev` watchers in the background
  (`turbo run dev --filter=<pkg>^... --ui=stream`), and runs the server in the
  foreground, stopping the watchers on exit. (Used where `--filter=...<pkg>` would
  wrongly fan the task out onto dependencies that share its name.)

Equivalent manual commands:

```bash
turbo run dev --filter=...<pkg>     # a dev server plus its dependencies' watchers
pnpm dev                            # (root) turbo watch dev — every package
turbo run dev --filter=<pkg>^...    # only a package's dependencies' watchers
```

Only wrap a script whose task name is a real turbo task (`build`, `dev`,
`storybook`, `build-storybook`, or a package-specific task like
`electron:dev`/`electron:build`); the guard re-dispatches `turbo run <task>`, which
must exist.
````

- [ ] **Step 2: Format**

Run: `pnpm exec oxfmt CLAUDE.md`
Expected: completes.

- [ ] **Step 3: Verify the doc commands are accurate**

Run: `pnpm exec turbo run dev --filter=...@codaco/architect-web --dry 2>&1 | grep -iE "error|cannot" | head`
Expected: no errors — the documented `turbo run dev --filter=...<pkg>` form is valid.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document with-turbo dev-watcher task taxonomy"
```

---

## Final verification (after all tasks)

- [ ] Re-run the Task 1 Step 1 `buildPlan` assertion → `with-turbo buildPlan: OK`
- [ ] `pnpm exec turbo run build --filter='!network-canvas-interviewer' --filter='!network-canvas-architect' --dry 2>&1 | grep -i error` → no errors (root build graph intact; wrapped build scripts transparent to turbo).
- [ ] `git status --short` shows only the files this plan touched (plus the pre-existing unrelated changes) — nothing staged unintentionally.
- [ ] Manual: `pnpm --filter @codaco/interview storybook`, edit a fresco-ui source file, confirm fresco-ui `dist` rebuilds; record whether the running Storybook reflects it (open verification item from the spec) and add the small Vite config if needed.
