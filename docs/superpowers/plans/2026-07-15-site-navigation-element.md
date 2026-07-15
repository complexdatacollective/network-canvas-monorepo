# Site Navigation Web Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the canonical `SiteNavigation` React header as a self-contained `<nc-site-navigation>` custom element (`@codaco/site-navigation-element`) that non-React hosts (the Discourse forum) load from a CDN, per `docs/superpowers/specs/2026-07-15-site-navigation-element-design.md`.

**Architecture:** Two small upstream fresco-ui changes (`site: 'external'`, portal containment via the existing `PortalContainerProvider`), then a new library package that compiles a scoped Tailwind CSS payload, splits it into shadow-root and document-level parts at build time, and bundles React + motion + Base UI + fresco-ui into a single minified ESM file with Shadow DOM isolation.

**Tech Stack:** React 19, Vite 8 (rolldown lib mode), Tailwind v4 (`@tailwindcss/cli` for the CSS pass, postcss for the split), vitest 4 browser mode (`@vitest/browser-playwright`, chromium), pnpm catalog + changesets.

## Global Constraints

- NO `any` types; no type assertions (`as`) to silence errors; no barrel files; never re-export "for convenience".
- Shared deps use `catalog:`; internal deps use `workspace:*`; single-consumer deps use regular semver (`@tailwindcss/cli: ^4.3.2`, `postcss: ^8.5.6`).
- Formatter runs via the lint-staged pre-commit hook — do not run root `lint:fix` (it rewrites the whole repo).
- Custom element tag: `nc-site-navigation`. Package: `@codaco/site-navigation-element`, initial `version: "0.0.0"` + a `major` changeset (changesets bumps it to 1.0.0 on release).
- Never mix an app and a library in one changeset; both changesets here are library-lane.
- Node scripts are ESM `.mjs`. Package `build` scripts are wrapped with `scripts/with-turbo.mjs`.
- Size budget for `dist/element.js` + inlined CSS: ~120–150 kB gzipped (soft budget; report the number, flag if > 160 kB).
- Verification economy: run each task's own focused test cycle, but defer repo-wide `typecheck`/`knip`/`lint` to the single final task.
- All commits: no Co-Authored-By/self-attribution; user's git credentials.
- Worktree: run everything from the current worktree root (`/Users/jmh629/Projects/network-canvas/.claude/worktrees/interview-interface-e2e-tests-e307d9`). Never use paths into the main repo checkout.

---

### Task 1: fresco-ui `site="external"`

**Files:**

- Modify: `packages/fresco-ui/src/navigation/SiteNavigation.tsx:92` (the `site` prop type)
- Modify: `packages/fresco-ui/src/navigation/SiteNavigation.stories.tsx`
- Test: `packages/fresco-ui/src/navigation/__tests__/SiteNavigation.test.tsx`

**Interfaces:**

- Consumes: existing `SiteNavigationProps`.
- Produces: `SiteNavigationProps['site']` = `'documentation' | 'external' | 'website'`. With `site="external"` every destination is absolute: brand → `https://networkcanvas.com/`, Docs → `https://documentation.networkcanvas.com/` (with `target="_blank"`), Get Started → `https://networkcanvas.com/download`. Task 5 relies on this.

- [ ] **Step 1: Write the failing test**

Append to the `describe('SiteNavigation', ...)` block in `packages/fresco-ui/src/navigation/__tests__/SiteNavigation.test.tsx`:

```tsx
  it('renders every destination absolutely for external hosts', () => {
    render(
      <SiteNavigation activeItemId="community" locale="en-US" site="external" />,
    );

    expect(
      screen.getByRole('link', { name: 'Network Canvas home' }),
    ).toHaveAttribute('href', 'https://networkcanvas.com/');
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute(
      'href',
      'https://documentation.networkcanvas.com/',
    );
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute(
      'target',
      '_blank',
    );
    expect(screen.getByRole('link', { name: 'Community' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute(
      'href',
      'https://networkcanvas.com/download',
    );
  });
```

- [ ] **Step 2: Verify it fails (at typecheck — the runtime logic already falls through correctly)**

Run: `pnpm --filter @codaco/fresco-ui typecheck`
Expected: FAIL — TS2322: `"external"` is not assignable to `'documentation' | 'website'`.

(`pnpm --filter @codaco/fresco-ui test` will PASS at runtime even before the fix — the existing href logic treats any non-`website`/non-`documentation` value as absolute. The type union is the actual gate; that's expected.)

- [ ] **Step 3: Widen the union**

In `packages/fresco-ui/src/navigation/SiteNavigation.tsx`, change the `site` prop type inside `SiteNavigationProps` (line 92):

```tsx
  site: 'documentation' | 'external' | 'website';
```

No logic changes are needed: `networkCanvasRootHref` (`site === 'website' ? '/' : destinations.networkCanvas`), `documentationRootHref` (`site === 'documentation' ? '/' : destinations.documentation`), and `getStartedHref` all already resolve `external` to absolute URLs.

- [ ] **Step 4: Verify test and typecheck pass**

Run: `pnpm --filter @codaco/fresco-ui test` then `pnpm --filter @codaco/fresco-ui typecheck`
Expected: both PASS.

- [ ] **Step 5: Update the story (repo convention: new prop variant → story same change)**

In `packages/fresco-ui/src/navigation/SiteNavigation.stories.tsx`:

1. Change the `StoryArgs` site union:

```tsx
  site: 'documentation' | 'external' | 'website';
```

2. Change the `site` argType options:

```tsx
    site: {
      control: 'radio',
      options: ['website', 'documentation', 'external'],
    },
```

3. Add after the `Spanish` story:

```tsx
export const ExternalHost: Story = {
  args: {
    activeItemId: 'community',
    site: 'external',
  },
};
```

4. Extend the docs description list item for **`site`** to mention the new value — replace the existing bullet with:

```
- **\`site\`** selects routing context only; menu items and destinations are
  not configurable. \`external\` is for non-Network-Canvas hosts (e.g. the
  community forum): every destination renders as an absolute URL.
```

- [ ] **Step 6: Commit**

```bash
git add packages/fresco-ui/src/navigation
git commit -m "feat(fresco-ui): support site=\"external\" in SiteNavigation"
```

---

### Task 2: fresco-ui portal containment

**Files:**

- Modify: `packages/fresco-ui/src/navigation/SiteNavigation.tsx` (imports; `ResourcesMenu`; `SoftwareMenu`)
- Test: `packages/fresco-ui/src/navigation/__tests__/SiteNavigation.test.tsx`

**Interfaces:**

- Consumes: `usePortalContainer` / `PortalContainerProvider` from `packages/fresco-ui/src/PortalContainer.tsx` (context returns `HTMLElement | null`; the provider renders a `fixed inset-0 z-3000` layer).
- Produces: when a `PortalContainerProvider` ancestor exists, both `NavigationMenu.Portal`s render into its container; with no provider, behavior is unchanged (portals to `document.body`). Task 5 relies on this to keep dropdowns inside the shadow root.

- [ ] **Step 1: Write the failing tests**

Append to `packages/fresco-ui/src/navigation/__tests__/SiteNavigation.test.tsx`. Add this import at the top of the file with the other imports:

```tsx
import { PortalContainerProvider } from '../../PortalContainer';
```

Append tests:

```tsx
  it('portals desktop menus into the app portal container when provided', () => {
    const { baseElement } = render(
      <PortalContainerProvider>
        <SiteNavigation locale="en-US" site="website" />
      </PortalContainerProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Software' }));
    const architectLink = screen.getByRole('link', { name: 'Architect' });
    const portalLayer = baseElement.querySelector('.z-3000');
    if (!portalLayer) throw new Error('Expected the portal container layer.');

    expect(portalLayer).toContainElement(architectLink);
  });

  it('keeps portaling to the document body without a provider', () => {
    render(<SiteNavigation locale="en-US" site="website" />);

    fireEvent.click(screen.getByRole('button', { name: 'Software' }));

    expect(screen.getByRole('link', { name: 'Architect' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Verify the first test fails**

Run: `pnpm --filter @codaco/fresco-ui test`
Expected: FAIL — `portalLayer` does not contain the Architect link (the popup portals to `document.body`, not the provider layer). The second test passes already.

- [ ] **Step 3: Implement**

In `packages/fresco-ui/src/navigation/SiteNavigation.tsx`:

1. Add to the fresco-ui-internal imports (after the `Spinner` import):

```tsx
import { usePortalContainer } from '../PortalContainer';
```

2. In `ResourcesMenu`, read the context at the top of the component body:

```tsx
  const portalContainer = usePortalContainer();
```

and change its portal opening tag to:

```tsx
      <NavigationMenu.Portal container={portalContainer ?? undefined}>
```

3. Make the identical two-line change in `SoftwareMenu`.

- [ ] **Step 4: Verify tests pass**

Run: `pnpm --filter @codaco/fresco-ui test` then `pnpm --filter @codaco/fresco-ui typecheck`
Expected: both PASS (all pre-existing SiteNavigation tests included).

- [ ] **Step 5: Commit**

```bash
git add packages/fresco-ui/src/navigation
git commit -m "feat(fresco-ui): contain SiteNavigation menus in the portal container context"
```

---

### Task 3: Scaffold `packages/site-navigation-element` + CSS pipeline

**Files:**

- Create: `packages/site-navigation-element/package.json`
- Create: `packages/site-navigation-element/tsconfig.json`
- Create: `packages/site-navigation-element/tsconfig.node.json`
- Create: `packages/site-navigation-element/.gitignore`
- Create: `packages/site-navigation-element/src/styles/shadow.css`
- Create: `packages/site-navigation-element/scripts/build.mjs`
- Modify: `turbo.json` (two package-scoped task overrides)
- Modify: `knip.json` (workspace entry)

**Interfaces:**

- Consumes: `@codaco/fresco-ui` dist (built by turbo `^build`), `@codaco/tailwind-config/fresco.css`, `@fontsource-variable/*` font files.
- Produces (relied on by Tasks 4–7): `node scripts/build.mjs --css-only` emits three gitignored files under `.generated/`: `shadow.css` (full compiled Tailwind payload, `:root` selectors rewritten to `:is(:root, :host)`, `@property` rules stripped), `document-properties.css` (the stripped `@property` rules), `document-fonts.css` (normal-style `@font-face` blocks whose `src` URLs use the placeholder `__NC_FONT_BASE__/<file>.woff2`). The same script copies the referenced woff2 files (`copyFonts`) into `public/fonts` (dev) or `dist/fonts` (build).

- [ ] **Step 1: Create `packages/site-navigation-element/package.json`**

```json
{
  "name": "@codaco/site-navigation-element",
  "version": "0.0.0",
  "description": "The canonical Network Canvas site header as a self-contained <nc-site-navigation> web component for non-React hosts",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/complexdatacollective/network-canvas-monorepo.git",
    "directory": "packages/site-navigation-element"
  },
  "type": "module",
  "files": ["dist"],
  "exports": {
    ".": "./dist/element.js"
  },
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "build": "node ../../scripts/with-turbo.mjs node scripts/build.mjs",
    "dev": "node ../../scripts/with-turbo.mjs --watch-deps node scripts/build.mjs --dev",
    "test": "node scripts/build.mjs --css-only && vitest run",
    "test:watch": "node scripts/build.mjs --css-only && vitest",
    "typecheck": "tsc --build --noEmit && tsc -p tsconfig.node.json --noEmit",
    "prepublishOnly": "pnpm build",
    "clean": "rm -rf .turbo node_modules dist .generated public/fonts"
  },
  "devDependencies": {
    "@base-ui/react": "catalog:",
    "@codaco/fresco-ui": "workspace:*",
    "@codaco/tailwind-config": "workspace:*",
    "@codaco/tsconfig": "workspace:*",
    "@fontsource-variable/inclusive-sans": "catalog:",
    "@fontsource-variable/nunito": "catalog:",
    "@tailwindcss/cli": "^4.3.2",
    "@types/node": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "@vitest/browser-playwright": "catalog:",
    "motion": "catalog:",
    "playwright": "catalog:",
    "postcss": "^8.5.6",
    "react": "catalog:",
    "react-dom": "catalog:",
    "tailwindcss": "catalog:",
    "typescript": "catalog:",
    "vite": "catalog:",
    "vitest": "catalog:"
  }
}
```

Notes: no `dependencies` on purpose — everything is inlined into the bundle, so nothing is needed at consumer install time. fresco-ui's remaining peers (`zod`, `zustand`, `@tanstack/react-table`, `@codaco/shared-consts`) are satisfied by the workspace's `autoInstallPeers: true` and are never imported by the nav's module graph, so they don't enter the bundle. `playwright` is declared to keep the repo's three playwright pins in lock-step (catalog).

- [ ] **Step 2: Create `packages/site-navigation-element/tsconfig.json`**

```json
{
  "extends": "@codaco/tsconfig/web.json",
  "compilerOptions": {
    "composite": true,
    "tsBuildInfoFile": "node_modules/.cache/tsbuildinfo.json",
    "types": ["vite/client"]
  },
  "include": ["src"],
  "exclude": ["node_modules", "src/__tests__"]
}
```

- [ ] **Step 3: Create `packages/site-navigation-element/tsconfig.node.json`**

```json
{
  "extends": "@codaco/tsconfig/dev.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node", "vite/client"]
  },
  "include": [
    "vite.config.ts",
    "vitest.config.ts",
    "src/__tests__/**/*.ts",
    "src/__tests__/**/*.tsx",
    "src/*.d.ts"
  ]
}
```

- [ ] **Step 4: Create `packages/site-navigation-element/.gitignore`**

```
.generated/
public/fonts/
```

- [ ] **Step 5: Create `packages/site-navigation-element/src/styles/shadow.css`**

This is the Tailwind entry. It pulls the full design-system foundation, then points the class scanner at exactly the fresco-ui dist modules `SiteNavigation` imports (scoping keeps the payload lean — do NOT import `@codaco/fresco-ui/styles.css`, which scans every component):

```css
/*
 * Tailwind entry for the <nc-site-navigation> shadow stylesheet.
 * Compiled by scripts/build.mjs via @tailwindcss/cli, then post-processed:
 * `:root` is rewritten to `:is(:root, :host)` and `@property` rules are
 * hoisted to a document-level stylesheet (neither applies inside a shadow
 * root as-authored).
 */
@import '@codaco/tailwind-config/fresco.css';

@source '../../node_modules/@codaco/fresco-ui/dist/navigation/SiteNavigation.js';
@source '../../node_modules/@codaco/fresco-ui/dist/navigation/SiteNavigation.messages.js';
@source '../../node_modules/@codaco/fresco-ui/dist/Button.js';
@source '../../node_modules/@codaco/fresco-ui/dist/Spinner.js';
@source '../../node_modules/@codaco/fresco-ui/dist/PortalContainer.js';
@source '../../node_modules/@codaco/fresco-ui/dist/typography/Heading.js';
@source '../../node_modules/@codaco/fresco-ui/dist/typography/Paragraph.js';
@source '../../node_modules/@codaco/fresco-ui/dist/utils/cva.js';
@source '../*.tsx';
```

- [ ] **Step 6: Create `packages/site-navigation-element/scripts/build.mjs`**

```js
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postcss from 'postcss';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generated = join(pkgRoot, '.generated');
const require = createRequire(import.meta.url);

const mode = process.argv.includes('--css-only')
  ? 'css-only'
  : process.argv.includes('--dev')
    ? 'dev'
    : 'build';

function run(command, args) {
  const result = spawnSync(command, args, { cwd: pkgRoot, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// The Tailwind @source directives scan fresco-ui's dist; fail early with a
// clear message instead of silently emitting a stylesheet with no utilities.
const frescoDist = dirname(
  require.resolve('@codaco/fresco-ui/navigation/SiteNavigation'),
);
if (!existsSync(join(frescoDist, 'SiteNavigation.js'))) {
  console.error(
    '@codaco/fresco-ui dist is missing. Build it first (turbo does this ' +
      'automatically: `pnpm build`/`pnpm test` from the repo root, or ' +
      '`pnpm --filter @codaco/fresco-ui build`).',
  );
  process.exit(1);
}

mkdirSync(generated, { recursive: true });

// 1) Compile the Tailwind entry.
run('pnpm', [
  'exec',
  'tailwindcss',
  '-i',
  'src/styles/shadow.css',
  '-o',
  join(generated, 'tailwind.css'),
]);

// 2) Split the compiled CSS for shadow-DOM use. `:root` and `@property`
// don't apply inside shadow roots as-authored: token blocks must also match
// `:host`, and `@property` registrations move to a document-level style tag.
const compiled = postcss.parse(
  readFileSync(join(generated, 'tailwind.css'), 'utf8'),
);
const documentProperties = [];
compiled.walkAtRules('property', (atRule) => {
  documentProperties.push(atRule.toString());
  atRule.remove();
});
compiled.walkRules((rule) => {
  if (rule.selector.includes(':root')) {
    rule.selectors = rule.selectors.map((selector) =>
      selector.replaceAll(':root', ':is(:root, :host)'),
    );
  }
});
writeFileSync(join(generated, 'shadow.css'), compiled.toString());
writeFileSync(
  join(generated, 'document-properties.css'),
  documentProperties.join('\n\n'),
);

// 3) Derive @font-face CSS from the canonical tailwind-config font files
// (single source of truth), keeping only normal-style faces (the nav sets
// no italic text) and rewriting fontsource URLs to a runtime placeholder.
const fontSources = [
  require.resolve('@codaco/tailwind-config/fonts/nunito.css'),
  require.resolve('@codaco/tailwind-config/fonts/inclusive-sans.css'),
];
const fontFiles = new Set();
const fontFaces = [];
for (const source of fontSources) {
  postcss.parse(readFileSync(source, 'utf8')).walkAtRules('font-face', (face) => {
    let style = 'normal';
    let file = null;
    face.walkDecls('font-style', (decl) => {
      style = decl.value;
    });
    face.walkDecls('src', (decl) => {
      const match = decl.value.match(
        /url\('@fontsource-variable\/[^/]+\/files\/([^']+)'\)/,
      );
      if (!match) return;
      file = match[1];
      decl.value = decl.value.replace(
        /url\('[^']+'\)/,
        `url('__NC_FONT_BASE__/${match[1]}')`,
      );
    });
    if (style !== 'normal' || !file) return;
    fontFiles.add(file);
    fontFaces.push(face.toString());
  });
}
writeFileSync(join(generated, 'document-fonts.css'), fontFaces.join('\n\n'));

function copyFonts(targetDir) {
  mkdirSync(targetDir, { recursive: true });
  for (const file of fontFiles) {
    const pkg = file.startsWith('nunito')
      ? '@fontsource-variable/nunito'
      : '@fontsource-variable/inclusive-sans';
    cpSync(require.resolve(`${pkg}/files/${file}`), join(targetDir, file));
  }
}

if (mode === 'css-only') process.exit(0);

if (mode === 'dev') {
  copyFonts(join(pkgRoot, 'public', 'fonts'));
  run('pnpm', ['exec', 'vite', '--open']);
} else {
  run('pnpm', ['exec', 'vite', 'build']);
  copyFonts(join(pkgRoot, 'dist', 'fonts'));
}
```

- [ ] **Step 7: Add package-scoped turbo overrides**

In root `turbo.json`, alongside the other `<pkg>#task` overrides, add (the generic `build`/`test` inputs don't include `scripts/**`, which would make caching stale):

```json
"@codaco/site-navigation-element#build": {
  "dependsOn": ["^build"],
  "inputs": [
    "src/**",
    "scripts/**",
    "tsconfig*.json",
    "vite.config.*",
    "package.json"
  ],
  "env": ["NODE_ENV"],
  "outputs": ["dist/**", ".generated/**"]
},
"@codaco/site-navigation-element#test": {
  "dependsOn": ["^build"],
  "inputs": [
    "src/**",
    "scripts/**",
    "vitest.config.*",
    "vite.config.*",
    "tsconfig*.json",
    "package.json"
  ],
  "outputs": []
}
```

- [ ] **Step 8: Add the knip workspace entry**

In root `knip.json`, add to `"workspaces"` (fonts are consumed via `require.resolve` file paths, the Tailwind CLI via a spawned binary, playwright via the vitest provider — knip can't see any of them):

```json
"packages/site-navigation-element": {
  "entry": ["src/element.tsx", "scripts/build.mjs"],
  "ignoreDependencies": [
    "@fontsource-variable/inclusive-sans",
    "@fontsource-variable/nunito",
    "@tailwindcss/cli",
    "playwright"
  ]
}
```

- [ ] **Step 9: Install and verify the CSS pipeline end-to-end**

```bash
pnpm install
pnpm --filter @codaco/fresco-ui build
pnpm --filter @codaco/site-navigation-element exec node scripts/build.mjs --css-only
```

Expected: exit 0; `.generated/` contains `tailwind.css`, `shadow.css`, `document-properties.css`, `document-fonts.css`.

Verify the transforms:

```bash
grep -c ':is(:root, :host)' packages/site-navigation-element/.generated/shadow.css   # >= 1
grep -c '@property' packages/site-navigation-element/.generated/shadow.css            # 0
grep -c '@property' packages/site-navigation-element/.generated/document-properties.css  # >= 1
grep -c '__NC_FONT_BASE__' packages/site-navigation-element/.generated/document-fonts.css # >= 1
grep -c 'neon-coral' packages/site-navigation-element/.generated/shadow.css           # >= 1 (utilities were scanned)
grep -c 'data-theme' packages/site-navigation-element/.generated/shadow.css           # >= 1 (dark token block present; quoting may be normalized)
```

- [ ] **Step 10: Commit**

```bash
git add packages/site-navigation-element turbo.json knip.json pnpm-lock.yaml
git commit -m "feat(site-navigation-element): scaffold package and shadow-DOM CSS pipeline"
```

---

### Task 4: Document-level style injection + vitest browser harness

**Files:**

- Create: `packages/site-navigation-element/src/css-modules.d.ts`
- Create: `packages/site-navigation-element/src/documentStyles.ts`
- Create: `packages/site-navigation-element/vitest.config.ts`
- Create: `packages/site-navigation-element/vite.config.ts` (minimal now; Task 7 extends it)
- Test: `packages/site-navigation-element/src/__tests__/documentStyles.test.ts`

**Interfaces:**

- Consumes: `.generated/document-fonts.css`, `.generated/document-properties.css` (Task 3).
- Produces: `ensureDocumentStyles(): void` — idempotently appends one `<style data-nc-site-navigation>` tag to `document.head` containing the `@font-face` rules (font URLs resolved at runtime) and the `@property` rules. Task 5 calls this from `connectedCallback`.

- [ ] **Step 1: Create `packages/site-navigation-element/src/css-modules.d.ts`**

```ts
declare module '*.css?inline' {
  const css: string;
  export default css;
}
```

- [ ] **Step 2: Create `packages/site-navigation-element/vite.config.ts`** (shared by vitest and the Task 7 build)

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic' },
  },
});
```

- [ ] **Step 3: Create `packages/site-navigation-element/vitest.config.ts`**

First plain (non-Storybook) browser-mode vitest project in the repo — modeled on fresco-ui's storybook project minus the storybook plugin:

```ts
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    name: 'browser',
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    testTimeout: 20_000,
    browser: {
      provider: playwright(),
      enabled: true,
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
  },
});
```

- [ ] **Step 4: Write the failing test**

Create `packages/site-navigation-element/src/__tests__/documentStyles.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { ensureDocumentStyles } from '../documentStyles';

describe('ensureDocumentStyles', () => {
  beforeEach(() => {
    document
      .querySelectorAll('style[data-nc-site-navigation]')
      .forEach((tag) => tag.remove());
  });

  it('appends a single document-level style tag, idempotently', () => {
    ensureDocumentStyles();
    ensureDocumentStyles();

    const tags = document.querySelectorAll('style[data-nc-site-navigation]');
    expect(tags).toHaveLength(1);
  });

  it('registers the fonts and property rules at document level', () => {
    ensureDocumentStyles();

    const css =
      document.querySelector('style[data-nc-site-navigation]')?.textContent ??
      '';
    expect(css).toContain("font-family: 'Nunito Variable'");
    expect(css).toContain("font-family: 'Inclusive Sans Variable'");
    expect(css).toContain('@property');
    expect(css).not.toContain('__NC_FONT_BASE__');
    expect(css).toContain('/fonts/nunito-latin-wght-normal.woff2');
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter @codaco/site-navigation-element test`
Expected: FAIL — cannot resolve `../documentStyles`. (The script's `--css-only` step runs first and must succeed; if it errors about fresco-ui dist, run `pnpm --filter @codaco/fresco-ui build`.)

- [ ] **Step 6: Create `packages/site-navigation-element/src/documentStyles.ts`**

```ts
import documentFontsCss from '../.generated/document-fonts.css?inline';
import documentPropertiesCss from '../.generated/document-properties.css?inline';

const MARKER_ATTRIBUTE = 'data-nc-site-navigation';

/**
 * `@font-face` and `@property` rules only take effect at document level, so
 * they can't ship inside the element's shadow stylesheet. In production the
 * woff2 files sit next to the bundle (dist/fonts/) and resolve via
 * import.meta.url; the Vite dev server and vitest serve them from
 * public/fonts instead, where import.meta.url would point into /src.
 */
const fontBase = import.meta.env.DEV
  ? '/fonts'
  : new URL('./fonts', import.meta.url).href;

export function ensureDocumentStyles(): void {
  if (document.head.querySelector(`style[${MARKER_ATTRIBUTE}]`)) return;

  const style = document.createElement('style');
  style.setAttribute(MARKER_ATTRIBUTE, '');
  style.textContent = `${documentFontsCss.replaceAll(
    '__NC_FONT_BASE__',
    fontBase,
  )}\n\n${documentPropertiesCss}`;
  document.head.append(style);
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @codaco/site-navigation-element test`
Expected: PASS (2 tests). This also proves the browser harness works — chromium may download on first run.

- [ ] **Step 8: Commit**

```bash
git add packages/site-navigation-element
git commit -m "feat(site-navigation-element): document-level style injection and browser test harness"
```

---

### Task 5: The `<nc-site-navigation>` element

**Files:**

- Create: `packages/site-navigation-element/src/element.tsx`
- Test: `packages/site-navigation-element/src/__tests__/element.test.tsx`

**Interfaces:**

- Consumes: `SiteNavigation` (`site="external"` from Task 1), `PortalContainerProvider` (Task 2 makes it effective), `ensureDocumentStyles` (Task 4), `.generated/shadow.css` (Task 3).
- Produces: side-effect module registering `nc-site-navigation` with attributes `active-item` (`SiteNavigationItemId`), `locale` (`'en-US' | 'en-GB' | 'es'`, default `'en-US'`), `theme` (`'light' | 'dark' | 'auto'`, default `'auto'`). Shadow root contains a `div.nc-root[data-theme]` wrapper. Tasks 6–7 rely on the tag and this DOM shape.

- [ ] **Step 1: Write the failing tests**

Create `packages/site-navigation-element/src/__tests__/element.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';

import '../element';

function mount(attributes: Record<string, string> = {}, width = 1280) {
  const frame = document.createElement('div');
  frame.style.width = `${width}px`;
  const host = document.createElement('nc-site-navigation');
  for (const [name, value] of Object.entries(attributes)) {
    host.setAttribute(name, value);
  }
  frame.append(host);
  document.body.append(frame);
  return host;
}

function shadowLink(host: HTMLElement, href: string) {
  return host.shadowRoot?.querySelector(`a[href="${href}"]`) ?? null;
}

function themeWrapper(host: HTMLElement) {
  const wrapper = host.shadowRoot?.querySelector<HTMLElement>('.nc-root');
  if (!wrapper) throw new Error('Expected the nc-root wrapper.');
  return wrapper;
}

async function rendered(host: HTMLElement) {
  await expect
    .poll(() => host.shadowRoot?.querySelectorAll('a').length ?? 0)
    .toBeGreaterThan(0);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('<nc-site-navigation>', () => {
  it('registers and renders the canonical link set inside its shadow root', async () => {
    const host = mount();
    await rendered(host);

    expect(customElements.get('nc-site-navigation')).toBeDefined();
    expect(shadowLink(host, 'https://networkcanvas.com/')).not.toBeNull();
    expect(
      shadowLink(host, 'https://community.networkcanvas.com/'),
    ).not.toBeNull();
    expect(
      shadowLink(host, 'https://documentation.networkcanvas.com/'),
    ).not.toBeNull();
    expect(
      shadowLink(host, 'https://protocolgallery.networkcanvas.com/'),
    ).not.toBeNull();
    expect(
      shadowLink(host, 'https://networkcanvas.com/download'),
    ).not.toBeNull();
    // Nothing rendered into the light DOM.
    expect(host.querySelector('a')).toBeNull();
  });

  it('marks the active item with aria-current', async () => {
    const host = mount({ 'active-item': 'community' });
    await rendered(host);

    expect(
      shadowLink(host, 'https://community.networkcanvas.com/')?.getAttribute(
        'aria-current',
      ),
    ).toBe('page');
  });

  it('selects translated copy from the locale attribute', async () => {
    const host = mount({ locale: 'es' });
    await rendered(host);

    expect(
      host.shadowRoot?.querySelector('nav[aria-label="Navegación principal"]'),
    ).not.toBeNull();
  });

  it('resolves explicit themes and re-renders on attribute change', async () => {
    const host = mount({ theme: 'dark' });
    await rendered(host);

    expect(themeWrapper(host).getAttribute('data-theme')).toBe('dark');
    const darkBackground = getComputedStyle(
      themeWrapper(host),
    ).backgroundColor;

    host.setAttribute('theme', 'light');
    await expect
      .poll(() => themeWrapper(host).getAttribute('data-theme'))
      .toBe('light');
    expect(getComputedStyle(themeWrapper(host)).backgroundColor).not.toBe(
      darkBackground,
    );
  });

  it('follows prefers-color-scheme when theme is auto', async () => {
    const host = mount();
    await rendered(host);

    const expected = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
    expect(themeWrapper(host).getAttribute('data-theme')).toBe(expected);
  });

  it('warns and falls back on invalid attribute values', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const host = mount({ 'theme': 'banana', 'active-item': 'nonsense' });
    await rendered(host);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('banana'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('nonsense'));
    const expected = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
    expect(themeWrapper(host).getAttribute('data-theme')).toBe(expected);
    warn.mockRestore();
  });

  it('injects the document-level styles exactly once across instances', async () => {
    const first = mount();
    const second = mount();
    await rendered(first);
    await rendered(second);

    expect(
      document.querySelectorAll('style[data-nc-site-navigation]'),
    ).toHaveLength(1);
  });
});
```

Note: `@testing-library/jest-dom` matchers are deliberately not used — this package has no jsdom setup file, so assertions stay on plain DOM APIs (`getAttribute`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @codaco/site-navigation-element test`
Expected: FAIL — cannot resolve `../element`.

- [ ] **Step 3: Create `packages/site-navigation-element/src/element.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { PortalContainerProvider } from '@codaco/fresco-ui/PortalContainer';
import SiteNavigation, {
  type SiteNavigationItemId,
  type SiteNavigationLocale,
} from '@codaco/fresco-ui/navigation/SiteNavigation';

import shadowCss from '../.generated/shadow.css?inline';
import { ensureDocumentStyles } from './documentStyles';

const TAG_NAME = 'nc-site-navigation';

const ACTIVE_ITEMS: readonly SiteNavigationItemId[] = [
  'home',
  'community',
  'documentation',
  'protocolGallery',
  'resources',
  'software',
  'getStarted',
];
const LOCALES: readonly SiteNavigationLocale[] = ['en-US', 'en-GB', 'es'];
const THEMES = ['light', 'dark', 'auto'] as const;
type Theme = (typeof THEMES)[number];

// Preflight's html/body rules can't reach into the shadow tree, so the
// wrapper re-establishes the base typography itself.
const HOST_CSS = `
:host { display: block; }
.nc-root { font-family: var(--body-font); }
`;

let sharedSheet: CSSStyleSheet | null = null;
function shadowStyles(): CSSStyleSheet {
  if (!sharedSheet) {
    sharedSheet = new CSSStyleSheet();
    sharedSheet.replaceSync(`${shadowCss}\n${HOST_CSS}`);
  }
  return sharedSheet;
}

function parseAttribute<T extends string>(
  host: HTMLElement,
  name: string,
  allowed: readonly T[],
  fallback: T | undefined,
): T | undefined {
  const value = host.getAttribute(name);
  if (value === null) return fallback;
  const match = allowed.find((candidate) => candidate === value);
  if (match !== undefined) return match;
  console.warn(
    `<${TAG_NAME}>: ignoring invalid ${name}="${value}" (expected one of: ${allowed.join(', ')})`,
  );
  return fallback;
}

class NcSiteNavigation extends HTMLElement {
  static observedAttributes = ['active-item', 'locale', 'theme'];

  #reactRoot: Root | null = null;
  #colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
  #handleSchemeChange = () => {
    if (parseAttribute(this, 'theme', THEMES, 'auto') === 'auto') {
      this.#render();
    }
  };

  connectedCallback() {
    ensureDocumentStyles();
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    shadow.adoptedStyleSheets = [shadowStyles()];
    this.#reactRoot ??= createRoot(shadow);
    this.#colorScheme.addEventListener('change', this.#handleSchemeChange);
    this.#render();
  }

  disconnectedCallback() {
    this.#colorScheme.removeEventListener('change', this.#handleSchemeChange);
    this.#reactRoot?.unmount();
    this.#reactRoot = null;
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#render();
  }

  #render() {
    if (!this.#reactRoot) return;
    const activeItemId = parseAttribute(
      this,
      'active-item',
      ACTIVE_ITEMS,
      undefined,
    );
    const locale = parseAttribute(this, 'locale', LOCALES, 'en-US') ?? 'en-US';
    const theme: Theme = parseAttribute(this, 'theme', THEMES, 'auto') ?? 'auto';
    const resolvedTheme =
      theme === 'auto'
        ? this.#colorScheme.matches
          ? 'dark'
          : 'light'
        : theme;

    this.#reactRoot.render(
      <StrictMode>
        <div
          className="nc-root bg-background text-text"
          data-theme={resolvedTheme}
        >
          <PortalContainerProvider>
            <SiteNavigation
              activeItemId={activeItemId}
              locale={locale}
              site="external"
            />
          </PortalContainerProvider>
        </div>
      </StrictMode>,
    );
  }
}

if (!customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, NcSiteNavigation);
}
```

Implementation notes:

- `createRoot(shadow)` is valid — a `ShadowRoot` is a `DocumentFragment`, which React 19 accepts as a container.
- `adoptedStyleSheets` needs no fallback: every browser Discourse supports (and chromium in tests) implements constructable stylesheets.
- The `PortalContainerProvider` sits **inside** the `data-theme` wrapper so portaled popups inherit the theme tokens and stay inside the shadow root (Task 2).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @codaco/site-navigation-element test`
Expected: PASS (Task 4's 2 tests + this task's 7).

- [ ] **Step 5: Typecheck the package**

Run: `pnpm --filter @codaco/site-navigation-element typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/site-navigation-element/src
git commit -m "feat(site-navigation-element): implement the nc-site-navigation custom element"
```

---

### Task 6: Interaction tests (dropdowns in shadow, mobile drawer)

**Files:**

- Test: `packages/site-navigation-element/src/__tests__/interactions.test.tsx`

**Interfaces:**

- Consumes: the element from Task 5 (its `mount` DOM shape) and the portal containment from Task 2.
- Produces: regression coverage only; no exports.

- [ ] **Step 1: Write the tests**

Create `packages/site-navigation-element/src/__tests__/interactions.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from 'vitest';

import '../element';

function mount(width: number) {
  const frame = document.createElement('div');
  frame.style.width = `${width}px`;
  const host = document.createElement('nc-site-navigation');
  frame.append(host);
  document.body.append(frame);
  return host;
}

function shadowButton(host: HTMLElement, label: string) {
  const buttons = host.shadowRoot?.querySelectorAll('button') ?? [];
  for (const button of buttons) {
    if (
      button.textContent?.includes(label) ||
      button.getAttribute('aria-label') === label
    ) {
      return button;
    }
  }
  return null;
}

async function rendered(host: HTMLElement) {
  await expect
    .poll(() => host.shadowRoot?.querySelectorAll('a').length ?? 0)
    .toBeGreaterThan(0);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('<nc-site-navigation> interactions', () => {
  it('opens the Software menu with its popup inside the shadow root', async () => {
    const host = mount(1280);
    await rendered(host);

    const trigger = shadowButton(host, 'Software');
    expect(trigger).not.toBeNull();
    trigger?.click();

    await expect
      .poll(() =>
        host.shadowRoot?.querySelector('a[aria-label="Architect"]'),
      )
      .not.toBeNull();
    const architect = host.shadowRoot?.querySelector(
      'a[aria-label="Architect"]',
    );
    expect(architect?.getRootNode()).toBe(host.shadowRoot);
  });

  it('opens and closes the compact drawer, restoring trigger focus on Escape', async () => {
    const host = mount(400);
    await rendered(host);

    const menuButton = shadowButton(host, 'Open site navigation');
    expect(menuButton).not.toBeNull();
    menuButton?.click();

    await expect
      .poll(() => menuButton?.getAttribute('aria-expanded'))
      .toBe('true');

    // The drawer is the second <nav>; the desktop menu's <nav> renders first
    // (hidden below the container breakpoint but still in the DOM).
    const navs = host.shadowRoot?.querySelectorAll('nav') ?? [];
    const drawer = navs[1];
    if (!drawer) throw new Error('Expected the compact drawer navigation.');
    const firstLink = drawer.querySelector<HTMLElement>('a');
    if (!firstLink) throw new Error('Expected a drawer link.');
    firstLink.focus();
    firstLink.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        composed: true,
      }),
    );

    await expect
      .poll(() => menuButton?.getAttribute('aria-expanded'))
      .toBe('false');
    expect(host.shadowRoot?.activeElement).toBe(menuButton);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm --filter @codaco/site-navigation-element test`
Expected: PASS. If the Software-menu test flakes on popup timing, raise the poll via `await expect.poll(..., { timeout: 5000 })` rather than adding sleeps. If Escape handling genuinely fails (shadow retargeting), that is a real bug to fix in the element (e.g. event listener placement), not in the test — investigate before touching assertions.

- [ ] **Step 3: Commit**

```bash
git add packages/site-navigation-element/src/__tests__
git commit -m "test(site-navigation-element): cover dropdown containment and compact drawer interactions"
```

---

### Task 7: Production bundle + demo page

**Files:**

- Modify: `packages/site-navigation-element/vite.config.ts`
- Create: `packages/site-navigation-element/index.html` (demo; excluded from npm by `files: ["dist"]`)

**Interfaces:**

- Consumes: element module (Task 5), `scripts/build.mjs` orchestration (Task 3).
- Produces: `dist/element.js` — single minified self-contained ESM file — plus `dist/fonts/*.woff2` and `dist/element.js.map`. The npm entry the CDN serves.

- [ ] **Step 1: Extend `packages/site-navigation-element/vite.config.ts`**

Replace the file contents with:

```ts
import { resolve } from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  define:
    command === 'build'
      ? { 'process.env.NODE_ENV': JSON.stringify('production') }
      : undefined,
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/element.tsx'),
      formats: ['es'],
      fileName: () => 'element.js',
    },
    minify: true,
    sourcemap: true,
    emptyOutDir: true,
  },
}));
```

(The `define` guarantees React's production build is selected when everything is inlined; ESM output keeps `import.meta.url` — which `documentStyles.ts` uses for font URLs — valid when served from the CDN.)

- [ ] **Step 2: Create the demo page `packages/site-navigation-element/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>nc-site-navigation demo</title>
    <style>
      /* Deliberately hostile host styles — the shadow root must ignore them. */
      body {
        margin: 0;
        font-family: 'Comic Sans MS', cursive;
        background: #e8e4da;
      }
      a {
        color: red !important;
        text-decoration: underline wavy !important;
      }
      .controls {
        padding: 1rem;
        display: flex;
        gap: 0.5rem;
      }
    </style>
    <script type="module" src="/src/element.tsx"></script>
  </head>
  <body>
    <nc-site-navigation
      active-item="community"
      theme="auto"
    ></nc-site-navigation>
    <div class="controls">
      <button data-theme-value="light">Light</button>
      <button data-theme-value="dark">Dark</button>
      <button data-theme-value="auto">Auto</button>
    </div>
    <p style="padding: 1rem">
      Host-page content. The header above is rendered by
      <code>&lt;nc-site-navigation&gt;</code> inside a shadow root.
    </p>
    <script type="module">
      const nav = document.querySelector('nc-site-navigation');
      for (const button of document.querySelectorAll('[data-theme-value]')) {
        button.addEventListener('click', () => {
          nav.setAttribute('theme', button.dataset.themeValue);
        });
      }
    </script>
  </body>
</html>
```

- [ ] **Step 3: Build and inspect the artifact**

```bash
pnpm --filter @codaco/site-navigation-element build
ls packages/site-navigation-element/dist
```

Expected: `element.js`, `element.js.map`, `fonts/` with 8 woff2 files (5 nunito + 3 inclusive-sans normal-style subsets).

Verify self-containment and size:

```bash
head -c 1000 packages/site-navigation-element/dist/element.js | grep -o 'import[^;]*from[^;]*;' || echo "self-contained (no import statements)"
gzip -c packages/site-navigation-element/dist/element.js | wc -c
```

Expected: `self-contained (no import statements)` — ESM static imports are hoisted to the top of the chunk, so their absence in the first kilobyte means everything was inlined. Gzipped size printed — record it, expect roughly 120,000–160,000 bytes. If over 160 kB, check the CSS payload first (`@source` scope creep) before blaming JS.

- [ ] **Step 4: Verify the demo in a real browser**

Run: `pnpm --filter @codaco/site-navigation-element dev` (starts the Vite dev server after regenerating CSS and copying fonts to `public/fonts`).

Then verify in the app's browser pane (per the repo's visual-verification convention: confirm against the rendered page, not just tests):

- Header renders with correct branding, fonts (Nunito headings — not Comic Sans), and colors on light and dark.
- Resources/Software dropdowns open styled and positioned under their triggers.
- Host page links are red/wavy; nav links are not (isolation works).
- Narrow the window below ~1024 px of element width: hamburger + drawer work.
- Take screenshots of light + dark and share them with the user for visual sign-off.

- [ ] **Step 5: Commit**

```bash
git add packages/site-navigation-element
git commit -m "feat(site-navigation-element): production single-file bundle and demo page"
```

---

### Task 8: Release wiring + full-repo verification

**Files:**

- Create: `.changeset/site-navigation-element-initial.md`
- Create: `.changeset/fresco-ui-external-site-portals.md`
- Modify: `docs/superpowers/specs/2026-07-15-site-navigation-element-design.md` (locale default correction)

**Interfaces:**

- Consumes: everything above.
- Produces: release-ready branch; both packages queued for the library changeset lane.

- [ ] **Step 1: Write the changesets (two files — never mix packages with different lanes; these are both libraries but keep one concern per file)**

Create `.changeset/fresco-ui-external-site-portals.md`:

```md
---
'@codaco/fresco-ui': minor
---

SiteNavigation accepts `site="external"` for non-Network-Canvas hosts (every destination renders as an absolute URL) and portals its desktop menus into the `PortalContainerProvider` container when one is present, so embedders can keep popups inside their own DOM scope (e.g. a shadow root).
```

Create `.changeset/site-navigation-element-initial.md`:

```md
---
'@codaco/site-navigation-element': major
---

Initial release: the canonical Network Canvas site header packaged as a self-contained `<nc-site-navigation>` web component for non-React hosts. Loads from a CDN with a single script tag; Shadow DOM isolation; `active-item`, `locale`, and `theme` (light/dark/auto) attributes.
```

- [ ] **Step 2: Correct the spec's locale default**

In `docs/superpowers/specs/2026-07-15-site-navigation-element-design.md`, the element-contract table lists the `locale` default as `en`; the real `SiteLocale` union is `en-US | en-GB | es`. Change that table row's default from `` `en` `` to `` `en-US` ``.

- [ ] **Step 3: Full-repo verification (single pass, per repo convention)**

```bash
pnpm typecheck
pnpm knip
pnpm lint
pnpm --filter @codaco/fresco-ui test
pnpm --filter @codaco/site-navigation-element test
```

Expected: all PASS. Known traps if they fail:

- `typecheck` cache can mask cross-package breakage — if suspicious, rerun with `--force`.
- `knip` failures about the new package usually mean the `knip.json` entry from Task 3 needs adjusting (entry files or `ignoreDependencies`).
- Do NOT run root `lint:fix`.

- [ ] **Step 4: Commit**

```bash
git add .changeset docs/superpowers/specs/2026-07-15-site-navigation-element-design.md
git commit -m "chore: changesets for fresco-ui external site + site-navigation-element initial release"
```

- [ ] **Step 5: Ship**

Invoke the repo's `shipping-a-pull-request` skill to open the PR from this branch against `main` and watch CI. PR summary should link the spec and note: two fresco-ui behavior changes (type widening + opt-in portal containment), new published package, first plain browser-mode vitest project in the repo, and the recorded bundle size from Task 7.
