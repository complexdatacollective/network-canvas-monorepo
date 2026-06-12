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
a `parameters.capture` block). The `generate` task screenshots each story
with Playwright at one live viewport per aspect ratio (so each ratio is a
true responsive re-layout, not a crop), then derives WebP width variants
with sharp into `src/generated/`, which is committed.

To change how an interface is pictured, edit its capture story. To add an
interface, add a capture story; to remove one, delete the story — stale
assets are pruned on the next generation.

## Regenerating

```sh
# Canonical, committable output (pinned Playwright Docker image):
pnpm generate:interface-images   # from the repo root

# Local iteration only — host fonts make output non-canonical:
pnpm exec turbo run generate --filter=@codaco/interface-images
```

Regeneration is wired into turbo's task graph: `generate` depends on
`@codaco/interview#build-storybook`, which depends on `^build` (including
`@codaco/fresco-ui`). Any change to an interface, a capture story, or
fresco-ui invalidates the task; CI regenerates in the pinned container and
fails if the committed images are stale. A perceptual-diff churn guard
(see `scripts/config.mts`) keeps visually-identical regenerations from
dirtying git.

`STORYBOOK_MAPBOX_TOKEN` must be set for the Geospatial story to render a map
(it is baked in at storybook build time).
