# Interface Screenshot Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate screenshots of every interview interface programmatically from Storybook, process them into multiple aspect ratios and widths, and ship them as an internal package exporting React components that render responsive `<picture>` elements. Screenshots regenerate automatically when the interfaces change — directly or via `@codaco/fresco-ui`.

**Architecture:** Dedicated `capture` stories in `@codaco/interview` (one per interface, hand-tuned synthetic data, navigation hidden) are screenshotted by a Playwright runner at three viewports — one per aspect ratio (1:1, 4:3, 16:9) — so each ratio is a true responsive re-layout, not a crop. A sharp pipeline derives width variants as WebP into a new internal package, `@codaco/interface-images`, alongside a generated manifest. A hand-written `InterfacePicture` component renders `<picture>`/`srcset` from the manifest. Turbo's task graph (`generate` → `@codaco/interview#build-storybook` → `^build` → fresco-ui) makes staleness detectable by hash; a CI job running in the pinned Playwright Docker image regenerates on cache miss and fails if committed images are stale.

**Tech Stack:** Storybook 10 (react-vite), Playwright ^1.60 (catalog), sharp, Turbo, pnpm workspace.

**Decisions already made (requirements):**

- Deliverable is exported React components rendering `<picture>` elements for responsive display.
- Separate internal package, private and unversioned: `packages/interface-images` (`@codaco/interface-images`).
- Changes to interfaces (direct or via fresco-ui) must trigger regeneration.
- Screenshot configuration is decided case-by-case per interface, via a dedicated capture story.
- The interview Shell navigation bar must not appear in screenshots.
- Three aspect ratios: 1:1, 4:3, 16:9.

**Design decisions made by this plan (with rationale):**

1. **Capture stories live in `packages/interview`, colocated with each interface** (`src/interfaces/<Name>/<Name>.capture.stories.tsx`), tagged `['capture']` with a `parameters.capture` block. Rationale: per-interface config is exactly a story; builders (`SyntheticInterview` setup) already live there and are reusable; Storybook's `index.json` makes enumeration trivial; Chromatic also snapshots these stories for free, keeping them honest.
2. **Aspect ratios are captured at three live viewports** rather than cropping one master. The interfaces are responsive (the Shell switches layout on `max-aspect-ratio: 3/4`); a 1:1 crop of a 16:9 render would amputate UI. Capture viewports (CSS px, at `deviceScaleFactor: 2`): 16:9 → 1280×720, 4:3 → 1024×768, 1:1 → 960×960.
3. **Navigation is hidden via a new `hideNavigation` prop on `Shell`**, threaded through `StoryInterviewShell`. Rationale: a CSS-override decorator depends on unstable selectors; screenshot clipping is brittle across orientations. Hiding the nav also lets the stage area fill the full viewport, which is what we want pictured.
4. **Asset URLs in the manifest use `new URL('./x.webp', import.meta.url)`**, not bare image imports. Rationale: the package ships untranspiled TS consumed by two different bundlers — Vite (architect-web) returns strings from image imports while Next/webpack returns `StaticImageData` objects; `new URL(..., import.meta.url).href` yields a string in both, and Vite never inlines `new URL` assets as data URIs.
5. **Determinism via the pinned Playwright Docker image** (`mcr.microsoft.com/playwright:v1.60.0-noble`), mirroring `packages/interview/e2e/scripts/run.sh` — font rendering and AA are the dominant nondeterminism source and are eliminated by the container. Seeded `SyntheticInterview` data plus `prefers-reduced-motion` handles the rest.
6. **A perceptual-diff churn guard**: regenerated images only overwrite committed ones when the decoded pixel diff exceeds a small threshold. This keeps `git diff` clean when nothing visually changed, which is what makes the CI staleness gate viable.
7. **WebP only** as the delivery format (universally supported since 2020). AVIF can be added later as another encode profile in one config entry; PNG fallback is unnecessary.

**Shipped widths per ratio (descriptors for `srcset`):**

| Ratio | Capture master (px) | Shipped widths       |
| ----- | ------------------- | -------------------- |
| 16:9  | 2560×1440           | 480, 960, 1440, 1920 |
| 4:3   | 2048×1536           | 320, 640, 960, 1280  |
| 1:1   | 1920×1920           | 320, 640, 960        |

**Interface coverage (17):** AlterEdgeForm, AlterForm, Anonymisation, CategoricalBin, DyadCensus, EgoForm, FamilyPedigree, Geospatial, Information, NameGenerator, NameGeneratorQuickAdd (interface exists at `src/interfaces/NameGenerator/NameGeneratorQuickAdd`; **no story today — one must be written**), NameGeneratorRoster, Narrative, OneToManyDyadCensus, OrdinalBin, Sociogram, TieStrengthCensus. Architect-web's `Default` placeholder is not an interface and stays a static asset owned by architect-web.

**Known risk — Geospatial:** requires a Mapbox token and live tile fetches at capture time. The capture config supports `env: ['VITE_MAPBOX_TOKEN']`; CI must provide the secret, and tile/style drift means its perceptual diff threshold should be more tolerant. If this proves flaky, mark it `skip: true` and keep a hand-curated image as a registered exception in the manifest generator.

---

### Task 1: `hideNavigation` prop on Shell

**Files:**

- Modify: `packages/interview/src/Shell.tsx`
- Modify: `packages/interview/.storybook/StoryInterviewShell.tsx`

- [ ] Add `hideNavigation?: boolean` (default `false`) to `ShellProps`, threaded into the internal `Interview` component; when set, skip rendering `<Navigation …/>` (Shell.tsx ~line 134). The toast viewport and providers are unaffected.
- [ ] Thread `hideNavigation` through `StoryInterviewShell` props to `Shell`.
- [ ] Verify in Storybook that an existing story with `hideNavigation` renders the stage full-bleed with no nav rail in either orientation.
- [ ] `pnpm typecheck`, `pnpm --filter @codaco/interview test`.

### Task 2: Capture story convention + first two capture stories

**Files:**

- Create: `packages/interview/src/interfaces/Sociogram/Sociogram.capture.stories.tsx`
- Create: `packages/interview/src/interfaces/NameGenerator/NameGeneratorQuickAdd.capture.stories.tsx`
- Create: `packages/interview/src/types/capture.ts` (the `parameters.capture` type, exported for the runner)

- [ ] Define the capture parameters contract:

```ts
export type CaptureParameters = {
  /** Manifest key; must match the interface type. */
  interface: string;
  /** Extra settle time after network idle, ms. Default 500. */
  delay?: number;
  /** Subset of ratios to capture. Default: all three. */
  ratios?: Array<'1:1' | '4:3' | '16:9'>;
  /** Env vars the story needs at storybook build time (documentation only). */
  env?: string[];
  /** Temporarily exclude from capture without deleting the story. */
  skip?: boolean;
};
```

- [ ] Write `Sociogram.capture.stories.tsx`: reuse `createSociogramInterview` with a hand-picked seed, `currentStep: 1`, `hideNavigation`, `tags: ['capture']`, `parameters: { layout: 'fullscreen', capture: { interface: 'Sociogram' } }`. Exactly one story export per capture file (`export const Capture`). This is the template every other interface copies.
- [ ] Write the NameGeneratorQuickAdd capture story (NameGenerator stage with `quickAdd` config — first story for this interface; seed data so several nodes are visible).
- [ ] Verify both render nav-free in Storybook and appear under tag `capture` in `storybook-static/index.json` after `pnpm --filter @codaco/interview build-storybook`.

### Task 3: Capture stories for the remaining 15 interfaces

**Files:** `packages/interview/src/interfaces/<Name>/<Name>.capture.stories.tsx` × 15

- [ ] One per interface, reusing each interface's existing story builders. **This is the case-by-case curation point**: choose seeds, node counts, names, and stage config so each screenshot presents well — these become the public face of each interface. Tune at all three ratios.
- [ ] Geospatial: wire the token from `import.meta.env.VITE_MAPBOX_TOKEN` into the apikey asset; set `capture: { interface: 'Geospatial', delay: 3000, env: ['VITE_MAPBOX_TOKEN'] }`.
- [ ] Checklist: AlterEdgeForm, AlterForm, Anonymisation, CategoricalBin, DyadCensus, EgoForm, FamilyPedigree, Geospatial, Information, NameGeneratorRoster, Narrative, OneToManyDyadCensus, OrdinalBin, TieStrengthCensus, NameGenerator (plain).

### Task 4: `@codaco/interface-images` package skeleton

**Files:**

- Create: `packages/interface-images/package.json` (`"private": true`, no version churn — internal and unversioned)
- Create: `packages/interface-images/tsconfig.json` (extends `@codaco/tsconfig`)
- Create: `packages/interface-images/src/InterfacePicture.tsx`
- Create: `packages/interface-images/src/types.ts`
- Create: `packages/interface-images/scripts/` (runner lives here)

```jsonc
{
  "name": "@codaco/interface-images",
  "private": true,
  "type": "module",
  "exports": {
    "./InterfacePicture": "./src/InterfacePicture.tsx",
    "./manifest": "./src/generated/manifest.ts",
  },
  "scripts": {
    "generate": "node scripts/generate.mts",
    "typecheck": "tsc --noEmit",
  },
  "devDependencies": {
    "playwright": "catalog:",
    "sharp": "<latest>",
    "@codaco/tsconfig": "workspace:*",
  },
  "peerDependencies": { "react": "catalog:" },
}
```

- [ ] Package ships **untranspiled TSX** (like a source-shipping internal package): architect-web's Vite consumes it directly; documentation adds `transpilePackages: ['@codaco/interface-images']` in `next.config.ts`.
- [ ] `InterfacePicture` component API:

```tsx
type InterfacePictureProps = {
  type: InterfaceType; // keyof generated manifest
  ratio?: Ratio; // default '16:9'
  sizes?: string; // default '100vw'
  alt: string;
  loading?: 'lazy' | 'eager'; // default 'lazy'
  fetchPriority?: 'high' | 'auto';
  className?: string;
  /** Optional art direction: earlier entries win via <source media>. */
  artDirection?: Array<{ media: string; ratio: Ratio }>;
};
```

Renders `<picture>` with one `<source type="image/webp" media? srcSet sizes>` per art-direction entry (plus the base ratio), and an `<img>` fallback using the base ratio's largest variant with explicit `width`/`height` so space is always reserved (no layout shift — same fix as architect-web's timeline).

- [ ] Unit-test the rendered markup with Vitest + testing-library (srcset string, width/height presence, art-direction source order).

### Task 5: Capture runner + sharp pipeline

**Files:**

- Create: `packages/interface-images/scripts/generate.mts` (orchestrator)
- Create: `packages/interface-images/scripts/capture.mts`
- Create: `packages/interface-images/scripts/process.mts`
- Create: `packages/interface-images/scripts/config.mts` (ratios, viewports, widths, quality, diff threshold)
- Output (committed): `packages/interface-images/src/generated/assets/<Interface>.<ratio>.<width>.webp`, `packages/interface-images/src/generated/manifest.ts`

- [ ] **capture.mts**: statically serve `packages/interview/storybook-static`; read `index.json`; select stories tagged `capture` (error on duplicate `parameters.capture.interface`, warn on interfaces with no capture story); for each story × ratio: launch chromium with the ratio's viewport, `deviceScaleFactor: 2`, `reducedMotion: 'reduce'`, `timezoneId`/`locale` pinned; `goto iframe.html?id=<storyId>&viewMode=story`; wait for network idle + `capture.delay`; full-viewport PNG to a temp dir (masters are not committed).
- [ ] **process.mts**: for each master, sharp-resize to the ratio's shipped widths, encode WebP (quality 82). **Churn guard**: decode the freshly-encoded variant and the committed variant, pixel-diff (e.g. `pixelmatch`); overwrite only if >0.1% of pixels differ (Geospatial: 2%). Delete committed variants whose story/ratio no longer exists.
- [ ] **manifest generation**: emit `src/generated/manifest.ts` — per interface, per ratio: `{ width, height, srcSet: [{ w, url: new URL('./assets/….webp', import.meta.url).href }] }`, plus a derived `InterfaceType` union. The file carries a "generated — do not edit" header. (Single-module manifest is acceptable: consumers like the architect-web timeline need the full map anyway, and unreferenced emitted assets are static files that are never downloaded unless used.)
- [ ] Add generated paths to oxlint/oxfmt ignores and configure knip so generated manifest + assets aren't flagged.

### Task 6: Turbo wiring + Docker wrapper

**Files:**

- Modify: `turbo.json`
- Create: `packages/interface-images/scripts/run-docker.sh` (mirrors `packages/interview/e2e/scripts/run.sh`: pinned `mcr.microsoft.com/playwright:v1.60.0-noble`, named node_modules volume, runs the turbo task inside)
- Modify: root `package.json` (`"generate:interface-images": "packages/interface-images/scripts/run-docker.sh"`)

- [ ] turbo task:

```jsonc
"@codaco/interface-images#generate": {
  "dependsOn": ["@codaco/interview#build-storybook"],
  "inputs": ["scripts/**", "package.json"],
  "env": ["VITE_MAPBOX_TOKEN"],
  "outputs": ["src/generated/**"]
}
```

This is the regeneration trigger chain: `generate` → `@codaco/interview#build-storybook` (inputs: `src/**`, `.storybook/**`) → `^build` → `@codaco/fresco-ui#build`. **Any change to an interface, a capture story, or fresco-ui changes the hash and invalidates `generate`**; an unchanged tree is a cache hit / no-op.

- [ ] Document in the package README: regeneration must run via the Docker wrapper for committable output; bare `pnpm --filter @codaco/interface-images generate` is for local iteration only (host fonts make output non-canonical).

### Task 7: CI staleness gate

**Files:**

- Create/modify: GitHub Actions workflow (e.g. `.github/workflows/interface-images.yml`)

- [ ] Job runs on PRs touching `packages/interview/**`, `packages/fresco-ui/**`, or `packages/interface-images/**`; container `mcr.microsoft.com/playwright:v1.60.0-noble`; `VITE_MAPBOX_TOKEN` from secrets; steps: pnpm install → `turbo run generate --filter=@codaco/interface-images` → `git diff --exit-code packages/interface-images/src/generated`.
- [ ] On failure: upload the regenerated images as a workflow artifact and print "images are stale — run `pnpm generate:interface-images` and commit". (Fail-the-check is chosen over auto-commit so a human approves visual changes; revisit if it becomes friction.)
- [ ] Turbo remote cache makes the green path cheap: unchanged inputs → cache hit → diff is trivially clean.

### Task 8: Consumer migration

**Files:**

- Modify: `apps/architect-web/src/components/Timeline/Timeline.tsx`, `StageEditor/StageHeading.tsx`, `Screens/NewStageScreen/Interface.tsx`, `lib/ProtocolSummary/components/Stage/Stage.tsx`
- Delete: `apps/architect-web/src/images/timeline/stage--*.webp` and the image map in `index.ts` (keep `Default`, `filter-icon.svg`, `skip-logic-icon.svg`)
- Modify: `apps/documentation/next.config.ts` (+ MDX/components where interface screenshots appear)

- [ ] architect-web: add `@codaco/interface-images` (workspace:\*); timeline renders `<InterfacePicture type={stage.type} ratio="4:3" sizes="14rem" …/>` with a `Default` fallback for unknown types; preload helper switches to the manifest's smallest 4:3 variants. Width/height handling moves into the component (supersedes the hand-maintained dimension table from the previous change).
- [ ] documentation: `transpilePackages: ['@codaco/interface-images']`; replace the per-interface hero screenshots under `public/assets/img/interface-documentation/*/` with `InterfacePicture` (art-directed: 1:1 below `40rem`, 16:9 above). Step-by-step UI screenshots (e.g. `upload-api-key.png`) are out of scope — they show workflows, not interfaces.
- [ ] Full gate: `pnpm lint:fix && pnpm typecheck && pnpm test && pnpm knip`, plus production builds of architect-web and documentation.

---

**Sequencing:** Tasks 1→2 unblock everything; 4→5→6 can proceed in parallel with 3 (the runner is testable with just the two template stories); 7 after 6; 8 last. Task 3 is the long tail and is intentionally curation-heavy.
