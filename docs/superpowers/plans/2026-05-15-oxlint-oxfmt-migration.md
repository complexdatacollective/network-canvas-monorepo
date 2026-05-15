# Oxlint + Oxfmt Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Biome with oxlint + oxfmt across the monorepo, applying Fresco's lint conventions via shared profiles, with class sorting and Tailwind v4 linting handled natively.

**Architecture:** One root `.oxlintrc.json` (baseline) + one root `.oxfmtrc.json` (formatter). Two shared profiles in `tooling/oxlint/` (`react.json`, `tailwind.json`). Per-package `.oxlintrc.json` files extend root + applicable profiles. All 14 existing `biome.json` files deleted.

**Tech Stack:** `oxlint`, `oxfmt`, `oxlint-tailwindcss`, husky, lint-staged, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-05-15-oxlint-oxfmt-migration-design.md`

**Branch:** `feature/update-lint-formatting`

---

## Task 1: Install dependencies and remove Biome

**Files:**
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml` (remove `'@biomejs/biome': true` from `allowBuilds`)
- Modify: `pnpm-lock.yaml` (regenerated)

- [ ] **Step 1: Remove Biome and add Oxc packages**

```bash
pnpm remove -w @biomejs/biome
pnpm add -Dw oxlint oxfmt oxlint-tailwindcss
```

- [ ] **Step 2: Remove `'@biomejs/biome': true` from `pnpm-workspace.yaml` `allowBuilds`**

Open `pnpm-workspace.yaml` and delete the line `'@biomejs/biome': true` from the `allowBuilds:` mapping. Leave the other entries intact.

- [ ] **Step 3: Verify the install**

Run:
```bash
pnpm install
pnpm exec oxlint --version
pnpm exec oxfmt --version
```
Expected: each command prints a version. No errors.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "chore(deps): replace @biomejs/biome with oxlint + oxfmt + oxlint-tailwindcss"
```

---

## Task 2: Create root `.oxfmtrc.json`

**Files:**
- Create: `.oxfmtrc.json`

- [ ] **Step 1: Write `.oxfmtrc.json`**

```json
{
  "$schema": "./node_modules/oxfmt/configuration_schema.json",
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "quoteProps": "consistent",
  "trailingComma": "all",
  "arrowParens": "always",
  "bracketSpacing": true,
  "jsxSingleQuote": false,
  "endOfLine": "lf",
  "sortImports": {
    "newlinesBetween": true,
    "internalPattern": ["~/", "@/", "@codaco/"],
    "groups": [
      "builtin",
      "external",
      ["internal", "subpath"],
      ["parent", "sibling", "index"],
      "style",
      "unknown"
    ]
  },
  "sortTailwindcss": {
    "functions": ["cva", "cx", "cn", "clsx"]
  },
  "ignorePatterns": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/out/**",
    "**/coverage/**",
    "**/.turbo/**",
    "**/public/**/*.*",
    "**/worker-configuration.d.ts"
  ]
}
```

- [ ] **Step 2: Verify the config is recognized**

Run:
```bash
pnpm exec oxfmt --check README.md
```
Expected: prints either "all formatted" or a diff. Must not error on the config file itself. If oxfmt rejects an option, note the option and switch it to the closest supported value, then re-run.

- [ ] **Step 3: Commit**

```bash
git add .oxfmtrc.json
git commit -m "chore: add root oxfmt config"
```

---

## Task 3: Create root `.oxlintrc.json`

**Files:**
- Create: `.oxlintrc.json`

- [ ] **Step 1: Write `.oxlintrc.json`**

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "unicorn", "oxc", "import", "promise"],
  "categories": {
    "correctness": "error",
    "suspicious": "warn"
  },
  "settings": { "typeAware": true },
  "env": { "browser": true, "node": true, "es2024": true },
  "rules": {
    "no-console": "warn",
    "no-process-env": "error",
    "no-unreachable": "error",

    "typescript/consistent-type-definitions": ["error", "type"],
    "typescript/consistent-type-imports": [
      "warn",
      { "prefer": "type-imports", "fixStyle": "inline-type-imports" }
    ],
    "typescript/no-unused-vars": [
      "error",
      { "caughtErrors": "none", "argsIgnorePattern": "^_" }
    ],
    "typescript/no-explicit-any": "error",
    "typescript/switch-exhaustiveness-check": "error",
    "typescript/no-misused-promises": ["error", { "checksVoidReturn": false }],
    "typescript/no-inferrable-types": "error",

    "import/no-cycle": "error",
    "import/no-duplicates": "warn",
    "import/no-anonymous-default-export": "off"
  },
  "overrides": [
    {
      "files": ["**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs"],
      "settings": { "typeAware": false }
    },
    {
      "files": ["**/*.d.ts"],
      "rules": { "typescript/consistent-type-definitions": "off" }
    },
    {
      "files": [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/__tests__/**/*.ts",
        "**/__tests__/**/*.tsx"
      ],
      "rules": { "typescript/unbound-method": "off" }
    },
    {
      "files": [
        "**/scripts/**",
        "**/vite.config.*",
        "**/vitest.config.*",
        "**/next.config.*",
        "tooling/**"
      ],
      "rules": { "no-process-env": "off", "no-console": "off" }
    }
  ],
  "ignorePatterns": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/out/**",
    "**/coverage/**",
    "**/.turbo/**",
    "**/public/**/*.*",
    "**/worker-configuration.d.ts"
  ]
}
```

- [ ] **Step 2: Verify oxlint loads the config**

Run:
```bash
pnpm exec oxlint --print-config 2>&1 | head -40
```
Expected: prints the resolved config without errors. If any rule name is rejected (e.g. `typescript/no-misused-promises` is named differently), update the name to what oxlint reports and re-run.

- [ ] **Step 3: Commit**

```bash
git add .oxlintrc.json
git commit -m "chore: add root oxlint config"
```

---

## Task 4: Create shared React profile

**Files:**
- Create: `tooling/oxlint/react.json`

- [ ] **Step 1: Create directory and file**

```bash
mkdir -p tooling/oxlint
```

Write `tooling/oxlint/react.json`:
```json
{
  "plugins": ["react", "react-hooks", "jsx-a11y"],
  "rules": {
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "react/no-unknown-property": "off",
    "react/jsx-no-target-blank": "off",
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "error",
    "jsx-a11y/alt-text": ["warn", { "elements": ["img"], "img": ["Image"] }],
    "jsx-a11y/aria-props": "warn",
    "jsx-a11y/aria-proptypes": "warn",
    "jsx-a11y/aria-unsupported-elements": "warn",
    "jsx-a11y/role-has-required-aria-props": "warn",
    "jsx-a11y/role-supports-aria-props": "warn"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add tooling/oxlint/react.json
git commit -m "chore(oxlint): add shared React profile"
```

---

## Task 5: Create shared Tailwind profile

**Files:**
- Create: `tooling/oxlint/tailwind.json`

- [ ] **Step 1: Write `tooling/oxlint/tailwind.json`**

```json
{
  "plugins": ["oxlint-tailwindcss"],
  "rules": {
    "oxlint-tailwindcss/no-unknown-classes": "error",
    "oxlint-tailwindcss/no-duplicate-classes": "error",
    "oxlint-tailwindcss/no-conflicting-classes": "warn",
    "oxlint-tailwindcss/no-unnecessary-whitespace": "error",
    "oxlint-tailwindcss/enforce-canonical": "warn"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add tooling/oxlint/tailwind.json
git commit -m "chore(oxlint): add shared Tailwind profile"
```

---

## Task 6: Update root `package.json` scripts and lint-staged

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Replace scripts and lint-staged sections**

In `package.json`, replace the existing `lint` and `lint:fix` scripts (and add `format` / `format:check`):

```json
"lint": "oxlint && oxfmt --check .",
"lint:fix": "oxlint --fix && oxfmt .",
"format": "oxfmt .",
"format:check": "oxfmt --check .",
```

Replace the existing `lint-staged` block:

```json
"lint-staged": {
  "*.{js,jsx,mjs,cjs,ts,tsx}": ["oxlint --fix", "oxfmt"],
  "*.{json,jsonc,md,css,html,yaml,yml}": ["oxfmt"]
}
```

- [ ] **Step 2: Verify scripts run**

Run:
```bash
pnpm run lint 2>&1 | tail -20
```
Expected: oxlint and oxfmt execute. They may report errors (we haven't reformatted yet) — that's fine; we just want to see them run without "command not found" or config errors.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: switch root scripts and lint-staged to oxlint/oxfmt"
```

---

## Task 7: Update `.vscode/settings.json` and `.vscode/extensions.json`

**Files:**
- Modify: `.vscode/settings.json`
- Modify: `.vscode/extensions.json`

- [ ] **Step 1: Overwrite `.vscode/extensions.json`**

```json
{ "recommendations": ["oxc.oxc-vscode"] }
```

- [ ] **Step 2: Overwrite `.vscode/settings.json`**

```json
{
  "typescript.tsdk": "./node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "cSpell.words": ["netcanvas", "Tipbox", "codaco"],
  "editor.defaultFormatter": "oxc.oxc-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.oxc": "always"
  },
  "[javascript]":       { "editor.defaultFormatter": "oxc.oxc-vscode" },
  "[typescript]":       { "editor.defaultFormatter": "oxc.oxc-vscode" },
  "[typescriptreact]":  { "editor.defaultFormatter": "oxc.oxc-vscode" },
  "[javascriptreact]":  { "editor.defaultFormatter": "oxc.oxc-vscode" },
  "[json]":             { "editor.defaultFormatter": "oxc.oxc-vscode" },
  "[jsonc]":            { "editor.defaultFormatter": "oxc.oxc-vscode" },
  "files.associations": { "*.css": "tailwindcss" }
}
```

- [ ] **Step 3: Commit**

```bash
git add .vscode/settings.json .vscode/extensions.json
git commit -m "chore(vscode): switch defaultFormatter to oxc-vscode"
```

---

## Task 8: Create per-package configs (apps)

**Files:**
- Create: `apps/architect-web/.oxlintrc.json`
- Create: `apps/documentation/.oxlintrc.json`
- Create: `apps/interviewer/.oxlintrc.json`
- Create: `apps/architect-desktop/.oxlintrc.json`

- [ ] **Step 1: Write `apps/architect-web/.oxlintrc.json`**

```json
{
  "extends": [
    "../../.oxlintrc.json",
    "../../tooling/oxlint/react.json",
    "../../tooling/oxlint/tailwind.json"
  ]
}
```

- [ ] **Step 2: Write `apps/documentation/.oxlintrc.json`**

```json
{
  "extends": [
    "../../.oxlintrc.json",
    "../../tooling/oxlint/react.json",
    "../../tooling/oxlint/tailwind.json"
  ],
  "plugins": ["nextjs"],
  "rules": { "nextjs/no-img-element": "off" }
}
```

- [ ] **Step 3: Write `apps/interviewer/.oxlintrc.json`**

```json
{
  "extends": [
    "../../.oxlintrc.json",
    "../../tooling/oxlint/react.json",
    "../../tooling/oxlint/tailwind.json"
  ],
  "rules": {
    "react-hooks/exhaustive-deps": "warn",
    "oxlint-tailwindcss/no-unknown-classes": "off"
  }
}
```

- [ ] **Step 4: Write `apps/architect-desktop/.oxlintrc.json`**

```json
{
  "extends": [
    "../../.oxlintrc.json",
    "../../tooling/oxlint/react.json"
  ],
  "rules": {
    "react-hooks/exhaustive-deps": "warn",
    "no-process-env": "off"
  }
}
```

- [ ] **Step 5: Verify the app configs load**

Run:
```bash
pnpm exec oxlint --print-config apps/architect-web 2>&1 | head -20
pnpm exec oxlint --print-config apps/documentation 2>&1 | head -20
pnpm exec oxlint --print-config apps/interviewer 2>&1 | head -20
pnpm exec oxlint --print-config apps/architect-desktop 2>&1 | head -20
```
Expected: each prints a merged config. If any plugin name (`nextjs`, `react`, `jsx-a11y`, `oxlint-tailwindcss`, `storybook`) is rejected, replace it with whatever oxlint reports as the canonical name OR move it into a `jsPlugins` array per oxlint's docs. Document the substitution in the commit message.

- [ ] **Step 6: Commit**

```bash
git add apps/architect-web/.oxlintrc.json apps/documentation/.oxlintrc.json \
        apps/interviewer/.oxlintrc.json apps/architect-desktop/.oxlintrc.json
git commit -m "chore(oxlint): add per-app configs"
```

---

## Task 9: Create per-package configs (packages + workers)

**Files:**
- Create: `packages/fresco-ui/.oxlintrc.json`
- Create: `packages/interview/.oxlintrc.json`
- Create: `packages/art/.oxlintrc.json`
- Create: `workers/posthog-proxy/.oxlintrc.json`
- Create: `workers/development-protocol/.oxlintrc.json`

- [ ] **Step 1: Write `packages/fresco-ui/.oxlintrc.json` and `packages/interview/.oxlintrc.json`**

Both files get the same content:
```json
{
  "extends": [
    "../../.oxlintrc.json",
    "../../tooling/oxlint/react.json",
    "../../tooling/oxlint/tailwind.json"
  ],
  "plugins": ["storybook"],
  "overrides": [
    {
      "files": ["**/*.stories.{ts,tsx}", ".storybook/**"],
      "rules": { "no-console": "off" }
    }
  ]
}
```

- [ ] **Step 2: Write `packages/art/.oxlintrc.json`**

```json
{
  "extends": [
    "../../.oxlintrc.json",
    "../../tooling/oxlint/react.json"
  ]
}
```

- [ ] **Step 3: Write `workers/posthog-proxy/.oxlintrc.json` and `workers/development-protocol/.oxlintrc.json`**

Both files get the same content:
```json
{
  "extends": ["../../.oxlintrc.json"],
  "env": { "worker": true, "node": false, "browser": false },
  "rules": { "no-console": "off" }
}
```

- [ ] **Step 4: Verify the package configs load**

Run:
```bash
pnpm exec oxlint --print-config packages/fresco-ui 2>&1 | head -20
pnpm exec oxlint --print-config packages/interview 2>&1 | head -20
pnpm exec oxlint --print-config packages/art 2>&1 | head -20
pnpm exec oxlint --print-config workers/posthog-proxy 2>&1 | head -20
```
Expected: each prints a merged config without config errors. Apply the same plugin-name fallback as in Task 8 if needed.

- [ ] **Step 5: Commit**

```bash
git add packages/fresco-ui/.oxlintrc.json packages/interview/.oxlintrc.json \
        packages/art/.oxlintrc.json \
        workers/posthog-proxy/.oxlintrc.json workers/development-protocol/.oxlintrc.json
git commit -m "chore(oxlint): add per-package and worker configs"
```

---

## Task 10: Delete all `biome.json` files

**Files (delete):**
- `biome.json`
- `tooling/tailwind/biome.json`
- `packages/art/biome.json`
- `packages/shared-consts/biome.json`
- `packages/interview/biome.json`
- `packages/fresco-ui/biome.json`
- `packages/protocol-validation/biome.json`
- `packages/network-query/biome.json`
- `workers/posthog-proxy/biome.json`
- `workers/development-protocol/biome.json`
- `apps/documentation/biome.json`
- `apps/architect-web/biome.json`
- `apps/architect-desktop/biome.json`
- `apps/interviewer/biome.json`

- [ ] **Step 1: Delete all 14 biome.json files**

```bash
rm biome.json \
   tooling/tailwind/biome.json \
   packages/art/biome.json \
   packages/shared-consts/biome.json \
   packages/interview/biome.json \
   packages/fresco-ui/biome.json \
   packages/protocol-validation/biome.json \
   packages/network-query/biome.json \
   workers/posthog-proxy/biome.json \
   workers/development-protocol/biome.json \
   apps/documentation/biome.json \
   apps/architect-web/biome.json \
   apps/architect-desktop/biome.json \
   apps/interviewer/biome.json
```

- [ ] **Step 2: Verify none remain**

```bash
find . -name biome.json -not -path '*/node_modules/*'
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove all biome.json files"
```

---

## Task 11: Apply oxlint auto-fixes repo-wide

**Files:**
- Modify: any file with auto-fixable issues

- [ ] **Step 1: Run oxlint --fix**

```bash
pnpm exec oxlint --fix .
```
Expected: oxlint reports a summary of fixed/remaining issues. Non-zero exit if unfixed errors remain — that's fine for this step.

- [ ] **Step 2: Commit auto-fixes**

```bash
git add -A
git commit -m "style: apply oxlint --fix repo-wide"
```

If there are no changes (the previous biome rules already prevented these issues), say so in a follow-up note but skip the commit — `git diff --cached --quiet` returns non-zero when there is something to commit.

---

## Task 12: Apply oxfmt repo-wide

**Files:**
- Modify: every formatted file (TS/JS/JSON/MD/CSS/YAML)

- [ ] **Step 1: Run oxfmt**

```bash
pnpm exec oxfmt .
```
Expected: reports a large number of files reformatted (this is the deliberate style change).

- [ ] **Step 2: Spot-check**

```bash
git diff --stat | tail -20
```
Verify the reformat touches every expected file type and no files in `node_modules`, `dist`, `.next`, etc.

- [ ] **Step 3: Commit the reformat as one commit**

```bash
git add -A
git commit -m "style: reformat repo with oxfmt (2sp / 80 / single-quote)"
```

---

## Task 13: Triage remaining lint errors

**Files:**
- Modify: source files with residual lint errors

- [ ] **Step 1: List remaining errors**

```bash
pnpm exec oxlint . 2>&1 | tee /tmp/oxlint-residual.log | tail -40
echo "---"
grep -c "error" /tmp/oxlint-residual.log || true
```

- [ ] **Step 2: Decide fix-vs-defer per error class**

For each distinct rule that errors:
- If it's small/local and obvious (≤10 occurrences, mechanical fix), fix inline.
- If it's a behavior change requiring real thought (e.g. `no-process-env` flagged a legitimate env access without a wrapper), open a follow-up issue and add the file to a tightly-scoped `overrides` entry in the appropriate per-package `.oxlintrc.json` to defer.

Do NOT mass-disable rules; do NOT add blanket `// oxlint-disable` comments. Each carve-out is a per-file glob in the per-package config.

- [ ] **Step 3: Re-run lint to confirm clean**

```bash
pnpm lint
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: resolve residual oxlint errors after migration"
```

If carve-outs were added, mention them in the commit body.

---

## Task 14: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Code Quality / Code Style sections**

Replace the Biome-specific lines:

Old:
```
- Biome config: tabs for indentation, 120 char line width, double quotes
- Pre-commit hooks automatically format staged files
```

New:
```
- Oxlint + oxfmt: 2-space indentation, 80 char line width, single quotes
- Pre-commit hooks automatically lint and format staged files
```

Old:
```
- Uses Biome for formatting and linting with tab indentation and 120-character line width
- Enforces unused import/variable removal
- Uses double quotes for strings
```

New:
```
- Uses oxlint for linting and oxfmt for formatting
- 2-space indentation, 80-character line width, single quotes
- Enforces unused import/variable removal
- Import sorting and Tailwind class sorting handled by oxfmt
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for oxlint/oxfmt migration"
```

---

## Task 15: Full repo verification

- [ ] **Step 1: Lint**

```bash
pnpm lint
```
Expected: exit 0.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```
Expected: exit 0. If typecheck regresses, the formatter may have moved type-import positions in a way that broke something; investigate before continuing.

- [ ] **Step 3: Tests**

```bash
pnpm test
```
Expected: exit 0.

- [ ] **Step 4: Build**

```bash
pnpm build
```
Expected: exit 0.

- [ ] **Step 5: Knip**

```bash
pnpm knip
```
Expected: no regressions vs the previous baseline (existing unused-export reports are unchanged).

- [ ] **Step 6: Final commit if anything needed adjusting**

If any of steps 1-5 surfaced fixes, commit them now with a descriptive message and re-run the full sequence.

---

## Self-review notes

- Tasks 2-5 and 7 are independent and can be dispatched in parallel after Task 1.
- Tasks 8-9 depend on Tasks 3-5 (root + shared profiles exist).
- Task 10 depends on Tasks 3-9 (don't delete biome.json until oxlint configs are in place).
- Tasks 11-12 depend on Task 10.
- Tasks 13-15 are sequential at the end.
- If oxlint rejects any plugin name or rule name during Tasks 3, 8, or 9, the fix is to substitute oxlint's canonical name (visible in `oxlint --rules`) or route through `jsPlugins`. Do not silently drop rules.
