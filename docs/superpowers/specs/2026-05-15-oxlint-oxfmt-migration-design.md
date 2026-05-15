# Oxlint + Oxfmt Migration Design

**Status:** Approved
**Date:** 2026-05-15
**Branch:** `feature/update-lint-formatting`

## Goal

Replace Biome (lint + format) with the Oxc toolchain (oxlint + oxfmt), while bringing in the linting rules from the Fresco project (`~/Projects/fresco-next`) where they make sense for this monorepo. The Tailwind v4 rules that Fresco runs via `eslint-plugin-better-tailwindcss` are replaced with the native `oxlint-tailwindcss` plugin.

## Non-goals

- Migrating the underlying TypeScript or React versions.
- Changing test framework, build tools, or CI shape beyond the lint/format step.
- Fixing every lint violation that the new rules surface. A follow-up may be needed for repository-wide cleanup; this design covers the tooling change itself.

## Constraints captured from brainstorming

- **Formatter style:** 2-space indent, 80 print width, single quotes (matches Fresco's Prettier config). Every formatted file in the repo will change.
- **Config layout:** Mirror the current Biome structure — one root config plus per-package configs that extend it. Composable: per-package configs extend the root **plus** one or more shared profiles.
- **Coverage:** Include the packages currently excluded from Biome (`apps/interviewer`, `apps/architect-desktop`, `packages/network-query`).
- **Tailwind plugin:** Use the native `oxlint-tailwindcss` plugin (22 rules for Tailwind v4), not the `eslint-plugin-better-tailwindcss` jsPlugins shim.
- **Class sorting:** Handled by oxfmt's built-in `sortTailwindcss`.
- **Rule strictness:** Baseline rules at root; React, Tailwind, and Storybook rules layered in via shared profiles only for the packages that need them.

## Architecture

### Tooling

| Concern    | Before                                | After                                                    |
| ---------- | ------------------------------------- | -------------------------------------------------------- |
| Lint       | `@biomejs/biome`                      | `oxlint` (native) + `oxlint-tailwindcss` (native plugin) |
| Format     | `@biomejs/biome`                      | `oxfmt`                                                  |
| Editor     | `biomejs.biome` VSCode extension      | `oxc.oxc-vscode`                                         |
| Pre-commit | husky + lint-staged → `pnpm lint:fix` | husky + lint-staged → `oxlint --fix` + `oxfmt`           |

### Config layout

```
.oxlintrc.json                    # Root baseline (TS, imports, suspicious, type-aware)
.oxfmtrc.json                     # Root formatter config (one file, applies everywhere)
tooling/oxlint/
  react.json                      # Shared React + react-hooks + jsx-a11y profile
  tailwind.json                   # Shared oxlint-tailwindcss profile
apps/architect-web/.oxlintrc.json # Extends root + react + tailwind
apps/documentation/.oxlintrc.json # Extends root + react + tailwind + Next.js plugin
apps/interviewer/.oxlintrc.json   # Extends root + react + tailwind; legacy carve-outs
apps/architect-desktop/.oxlintrc.json # Extends root + react; Electron tweaks
packages/fresco-ui/.oxlintrc.json # Extends root + react + tailwind + Storybook
packages/interview/.oxlintrc.json # Extends root + react + tailwind + Storybook
packages/art/.oxlintrc.json       # Extends root + react
workers/*/.oxlintrc.json          # Extends root; worker env + console allowed
```

Packages without a config file inherit root: `shared-consts`, `protocol-validation`, `network-exporters`, `network-query`, `development-protocol`, `tooling/typescript`, `tooling/tailwind`.

### Root formatter — `.oxfmtrc.json`

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

Notes:

- `sortTailwindcss` auto-detects each app's stylesheet (`globals.css` / `main.css` / `tailwind.css` containing `@import "tailwindcss"`). If auto-detection misses a package, that package adds a per-package `.oxfmtrc.json` that sets `stylesheet`.
- Style values mirror Fresco's `.prettierrc` plus `cn` and `clsx` (idiomatic in this repo).

### Root linter — `.oxlintrc.json`

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

Type-aware is root-only in oxlint; that's why `no-misused-promises` and `switch-exhaustiveness-check` live here and JS files turn it off via override.

### Shared profile — `tooling/oxlint/react.json`

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

### Shared profile — `tooling/oxlint/tailwind.json`

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

These rules map directly to what Fresco was running through `eslint-plugin-better-tailwindcss`:

| Fresco (better-tailwindcss)         | oxlint-tailwindcss                  |
| ----------------------------------- | ----------------------------------- |
| `enforce-canonical-classes` (warn)  | `enforce-canonical` (warn)          |
| `no-unnecessary-whitespace` (error) | `no-unnecessary-whitespace` (error) |
| `no-duplicate-classes` (error)      | `no-duplicate-classes` (error)      |
| `no-unknown-classes` (error)        | `no-unknown-classes` (error)        |
| `no-conflicting-classes` (warn)     | `no-conflicting-classes` (warn)     |

### Per-package configs

**`apps/architect-web/.oxlintrc.json`**

```json
{
  "extends": [
    "../../.oxlintrc.json",
    "../../tooling/oxlint/react.json",
    "../../tooling/oxlint/tailwind.json"
  ]
}
```

**`apps/documentation/.oxlintrc.json`**

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

**`apps/interviewer/.oxlintrc.json`**

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

**`apps/architect-desktop/.oxlintrc.json`**

```json
{
  "extends": ["../../.oxlintrc.json", "../../tooling/oxlint/react.json"],
  "rules": {
    "react-hooks/exhaustive-deps": "warn",
    "no-process-env": "off"
  }
}
```

**`packages/fresco-ui/.oxlintrc.json`** and **`packages/interview/.oxlintrc.json`**

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

**`packages/art/.oxlintrc.json`**

```json
{
  "extends": ["../../.oxlintrc.json", "../../tooling/oxlint/react.json"]
}
```

**`workers/posthog-proxy/.oxlintrc.json`** and **`workers/development-protocol/.oxlintrc.json`**

```json
{
  "extends": ["../../.oxlintrc.json"],
  "env": { "worker": true, "node": false, "browser": false },
  "rules": { "no-console": "off" }
}
```

### Root `package.json` changes

Remove:

- `"@biomejs/biome": "^2.4.15"`

Add (versions resolved at install):

- `"oxlint"`
- `"oxfmt"`
- `"oxlint-tailwindcss"`

Scripts:

```json
"lint": "oxlint && oxfmt --check .",
"lint:fix": "oxlint --fix && oxfmt .",
"format": "oxfmt .",
"format:check": "oxfmt --check ."
```

lint-staged (replaces the current blanket `*`):

```json
"lint-staged": {
  "*.{js,jsx,mjs,cjs,ts,tsx}": ["oxlint --fix", "oxfmt"],
  "*.{json,jsonc,md,css,html,yaml,yml}": ["oxfmt"]
}
```

### VSCode

**`.vscode/extensions.json`**

```json
{ "recommendations": ["oxc.oxc-vscode"] }
```

**`.vscode/settings.json`**

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
  "[javascript]": { "editor.defaultFormatter": "oxc.oxc-vscode" },
  "[typescript]": { "editor.defaultFormatter": "oxc.oxc-vscode" },
  "[typescriptreact]": { "editor.defaultFormatter": "oxc.oxc-vscode" },
  "[javascriptreact]": { "editor.defaultFormatter": "oxc.oxc-vscode" },
  "[json]": { "editor.defaultFormatter": "oxc.oxc-vscode" },
  "[jsonc]": { "editor.defaultFormatter": "oxc.oxc-vscode" },
  "files.associations": { "*.css": "tailwindcss" }
}
```

### Files removed

All 14 `biome.json` files:

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

### CLAUDE.md

Update the **Code Quality** and **Code Style** sections at `CLAUDE.md` to reflect the new toolchain (oxlint + oxfmt, 2-space / 80 / single quote), and update commands `pnpm lint` / `pnpm lint:fix` (no behavior change, just tool change).

## Risks and how we handle them

- **oxfmt is alpha** (December 2025 release). Some Prettier-equivalent options may not be fully wired or may have edge cases. Mitigation: keep oxfmt invocation behind `pnpm format` so a downgrade back to Prettier is mechanical if blockers appear; flag any formatter bugs to upstream rather than locally patching.
- **Plugin availability.** `storybook`, `nextjs`, and `jsx-a11y` may be native oxlint plugins or may require the `jsPlugins` compat layer. Resolved at implementation time (run `oxlint --rules` after install and adjust config). If a plugin can't be loaded, the affected per-package config falls back to `jsPlugins`.
- **Per-app Tailwind stylesheet auto-detection.** If oxfmt's auto-detection misses an app, that app gets a per-package `.oxfmtrc.json` setting `stylesheet`.
- **Repo-wide reformat.** Every formatted file changes. We do the reformat in a single commit separate from the configuration commit so reviewers and `git blame` can see them distinctly.
- **New lint errors.** `no-process-env`, `no-misused-promises`, `switch-exhaustiveness-check`, and the stricter Tailwind rules will surface real issues. We auto-fix what we can, then triage the remainder. If the residual list is large, we open follow-up tasks rather than blocking the migration PR.

## Migration steps (sketch — full sequencing handled in the implementation plan)

1. Install `oxlint`, `oxfmt`, `oxlint-tailwindcss`; remove `@biomejs/biome`.
2. Write the seven config files (`.oxlintrc.json`, `.oxfmtrc.json`, two shared profiles, per-package configs).
3. Update `package.json` scripts, lint-staged, husky, VSCode settings.
4. Delete the 14 `biome.json` files (listed under "Files removed").
5. Run `pnpm lint:fix` once to apply all auto-fixes (one commit).
6. Run `pnpm format` to reformat everything (one commit).
7. Triage remaining lint errors; auto-fix or open follow-up issues.
8. Update CLAUDE.md.
9. Verify: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass.

## Open implementation questions

These are knowable only after install, not blocking design:

- Exact published versions of `oxlint`, `oxfmt`, `oxlint-tailwindcss` (use latest stable at install time).
- Whether `storybook`/`nextjs`/`jsx-a11y` are native or jsPlugins in the installed oxlint version.
- Whether oxfmt's stylesheet auto-detection finds each app's Tailwind entry, or whether per-app `.oxfmtrc.json` files are needed.
