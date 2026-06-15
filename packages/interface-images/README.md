# @codaco/interface-images

Generated screenshots of every Network Canvas interview interface, shipped
with a React component for responsive display. Internal and unversioned —
not published.

## Consuming

```tsx
import InterfacePicture from '@codaco/interface-images/InterfacePicture';

<InterfacePicture
  type="Sociogram"
  ratio="4:3"
  sizes="(min-width: 64rem) 50vw, 100vw"
  alt="The Sociogram interface"
/>;
```

`InterfacePicture` renders a `<picture>` element with a WebP `srcset` of
width variants for the chosen aspect ratio (`1:1`, `4:3`, `16:9`), and an
`<img>` fallback carrying explicit `width`/`height` so space is reserved
before the image loads (no layout shift). Pass `artDirection` to serve
different ratios at different breakpoints. The raw manifest (per-interface
URLs and dimensions) is available from `@codaco/interface-images/manifest`.

The package ships untranspiled TSX. Vite apps consume it directly; Next.js
apps must add it to `transpilePackages`. Asset URLs use
`new URL(..., import.meta.url)` so both bundlers resolve them to strings.

## How images are generated

Each interface has a hand-tuned capture story in `@codaco/interview`
(`src/interfaces/<Name>/<Name>.capture.stories.tsx`, tagged `capture`, with
a `parameters.capture` block). The `generate` task builds the interview
storybook, screenshots each story with Playwright at one live viewport per
aspect ratio (so each ratio is a true responsive re-layout, not a crop),
then derives WebP width variants with sharp into `src/generated/assets/`.

`src/generated/assets/` is **turbo-cached, not committed** (it is gitignored).
Only `src/generated/manifest.ts` — a small generated file mapping each
interface and ratio to its variant URLs and dimensions — is committed, so
typechecking and tooling work without running a capture. `manifest.ts` only
changes when interfaces are added/removed or the ratio config changes.

To change how an interface is pictured, edit its capture story. To add an
interface, add a capture story; to remove one, delete the story.

## When images regenerate

The `generate` cache is keyed on the **`@codaco/interview` release version**
— the version in its `package.json`, or the pending version when a changeset
bumps it — passed in as `INTERVIEW_RELEASE_VERSION`. It is **not** keyed on
interview or fresco-ui source content. So images regenerate only when you
deliberately version the interview package, not on every code change.

This trade-off is intentional: between versions the cached images can lag the
code. `@codaco/interview`'s Chromatic build snapshots the `capture` stories,
so a rendering change shows up there as a visual diff — that is the prompt to
add an interview changeset, which moves the version and regenerates the
images. Treat Chromatic on the capture stories as the signal that a regen is
due.

`@codaco/architect-web` and `@codaco/documentation` builds depend on
`generate`, so versioning interview flows fresh images into their next build
and deploy.

## Regenerating

```sh
pnpm generate:interface-images   # from the repo root; builds storybook + captures
```

Runs on the host — no Docker, because the output is cached rather than diffed
against a committed reference, so cross-environment rendering differences do
not matter. Needs a Chromium browser
(`pnpm exec playwright install chromium`) and, for the Geospatial map,
`STORYBOOK_MAPBOX_TOKEN` set (baked in at storybook build time). Because the
assets are not committed, run this once to populate images for local
development of architect-web or the documentation site.
