# @codaco/interface-images

Generated screenshots of every Network Canvas interview interface, shipped
with a React component for responsive display. Internal and unversioned —
not published. Consumed by `architect-web` (stage thumbnails) and the
`documentation` site (the hero image on each interface-documentation page).

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

Both `src/generated/assets/` (the WebP variants) and `src/generated/manifest.ts`
(a small file mapping each interface and ratio to its variant URLs and
dimensions) are **committed**. Consumers (`@codaco/architect-web`,
`@codaco/documentation`) build directly against the committed assets — nothing
regenerates them in CI. `manifest.ts` only changes when interfaces are
added/removed or the ratio config changes.

To change how an interface is pictured, edit its capture story. To add an
interface, add a capture story; to remove one, delete the story. Then
regenerate locally and commit the result (see below).

## When images regenerate

Generation is **manual only**. Capturing each interface requires building the
interview storybook and screenshotting it with Playwright/Chromium — far too
slow and flaky to run on every CI build — so the committed assets are the
source of truth and are refreshed deliberately, not automatically.

Between regenerations the committed images can lag the code. `@codaco/interview`'s
Chromatic build snapshots the `capture` stories, so a rendering change shows up
there as a visual diff — that is the prompt to regenerate. Treat Chromatic on
the capture stories as the signal that a regen is due, then run the command
below and commit the updated `assets/` + `manifest.ts`.

## Regenerating

```sh
pnpm generate:interface-images   # from the repo root; builds storybook + captures
```

Runs on the host — no Docker. Needs a Chromium browser
(`pnpm exec playwright install chromium`) and, for the Geospatial map,
`STORYBOOK_MAPBOX_TOKEN` set (baked in at storybook build time) — without it
the Geospatial capture renders no map tiles. Commit the regenerated
`src/generated/assets/` and `src/generated/manifest.ts` together.
