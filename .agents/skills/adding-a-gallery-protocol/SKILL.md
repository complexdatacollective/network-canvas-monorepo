---
name: adding-a-gallery-protocol
description: 'Use when adding, updating, or removing a protocol in the networkcanvas.com Protocol Gallery — the .netcanvas and PDF assets, the content/protocol-gallery.csv row, and the derived columns the sync script owns. Keywords: protocol gallery, add a protocol, gallery CSV, protocol-gallery.csv, gallery:sync, sync-protocol-gallery, netcanvas asset, codebook summary, derived column is stale, Waves column, Stages Wave, Schema Version Wave, protocolgallery.networkcanvas.com, submit a protocol.'
---

# Adding a Protocol to the Gallery

The gallery lives in `apps/networkcanvas.com`. Every path below is relative to
that directory.

## The one rule everything else follows from

`content/protocol-gallery.csv` is the **only** source the Next build reads. The
build never opens a `.netcanvas`. Every fact the gallery shows about a
protocol's stages is a CSV cell, and those cells are written by a script:

- **Authored columns** — title, authors, citation, fields, asset filenames, … —
  are edited by hand.
- **Derived columns** — `Waves`, `Schema Version Wave N`, `Stage Count Wave N`,
  `Edge Stages Wave N`, `Stages Wave N` — are written **only** by
  `scripts/sync-protocol-gallery.ts`, which reads each `.netcanvas` once.

`lib/protocolGallery.ts` re-checks the derived cells against each other at build
time and fails with the row, the column, and the sync command when one is
missing, stale, or hand-edited. Never type into a derived column.

## Procedure

1. **Drop the assets in** `public/protocols/protocol-gallery/`: the
   `.netcanvas`, its codebook summary PDF, and any supplementary PDF. Existing
   names follow `<ACRONYM>_<MM-DD-YYYY>.netcanvas` with the PDF named as
   Architect exported it. Spaces in filenames are fine (paths are
   percent-encoded); subdirectories and `..` are rejected.

2. **Append a row to `content/protocol-gallery.csv`**, filling the authored
   columns only. Leave every derived column empty — the sync script fills them.
   For a multi-wave protocol use the paired
   `Protocol File (asset) Wave N` / `Codebook Summary (asset) Wave N` columns;
   to add a wave number the header does not have yet, add that pair to the
   header and the script discovers it from the header name.

3. **Run the sync:**

   ```sh
   pnpm --filter networkcanvas.com gallery:sync
   ```

   It rewrites the CSV in place, preserving authored cells byte for byte and
   re-appending the derived columns after them. Running it twice is a no-op.

4. **Verify:**

   ```sh
   pnpm --filter networkcanvas.com exec vitest run lib/__tests__/protocolGallery.test.ts lib/__tests__/protocolGallerySync.test.ts
   ```

   `protocolGallerySync` re-derives the whole dataset from the assets and
   asserts it equals the checked-in file, so a stale CSV fails here rather than
   in the Netlify build. Then `pnpm --filter networkcanvas.com dev` and open
   `/en-US/protocol-gallery/` and the new detail page (`en-US`, `en-GB` and
   `es` are the generated locales; there is no bare `en` route, and locally
   there is no edge function to negotiate one).

5. **Commit the CSV together with the assets.** A row whose asset is missing
   fails the build with `Missing gallery asset: <filename>`.

Re-run the sync whenever a `.netcanvas` is replaced — a new export of the same
study almost always changes the stage list.

## Authored columns

| Column                                                             | Rule                                                                                                                                                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Slug`                                                             | lowercase, digits, single hyphens; unique. It **is** the URL — changing it breaks inbound links.                                                                                                |
| `Protocol Authors`                                                 | required                                                                                                                                                                                        |
| `Study Title`                                                      | required; the long title on the card and detail page                                                                                                                                            |
| `Study PI`                                                         | required                                                                                                                                                                                        |
| `Protocol Contact`                                                 | required; name and email                                                                                                                                                                        |
| `Protocol Title [StudyAcronym_DatePublishedtoPG]`                  | required. Trailing `_` is stripped and remaining `_` become spaces to make the short name (`UK-JCOIN-I_` → `UK-JCOIN-I`; `SNAAPS_v1.0` → `SNAAPS v1.0`), which is what title sorting orders on. |
| `Cite Publication`                                                 | required, plain text                                                                                                                                                                            |
| `Cite Publication (HTML)`                                          | required; same citation with `<em>`/`<a>` markup                                                                                                                                                |
| `Publication URL`                                                  | required, must be `https://`                                                                                                                                                                    |
| `Grant Number`                                                     | required; use `n/a` when there is none                                                                                                                                                          |
| `Clinical Trials Registration`                                     | required; use `n/a` when there is none                                                                                                                                                          |
| `Field(s)`                                                         | required; comma-separated. Becomes a filter facet.                                                                                                                                              |
| `Population`                                                       | required                                                                                                                                                                                        |
| `Edge Generation Methodology`                                      | required; comma-separated. Becomes a filter facet.                                                                                                                                              |
| `Uses Rosters`                                                     | exactly `yes` or `no`                                                                                                                                                                           |
| `Qualitative Summary`                                              | required; the paragraph on the detail page                                                                                                                                                      |
| `Descriptive Sentence`                                             | required; the one-liner on the card                                                                                                                                                             |
| `Protocol File (original)`                                         | required; the name the author supplied, before renaming for the site                                                                                                                            |
| `Codebook Summary (original)`                                      | required; likewise                                                                                                                                                                              |
| `Protocol File (asset)`                                            | required; bare filename ending `.netcanvas`                                                                                                                                                     |
| `Codebook Summary (asset)`                                         | required; bare filename ending `.pdf`                                                                                                                                                           |
| `Fresco`                                                           | empty, or an `https://` sandbox URL — presence is what renders the "open in Fresco" action                                                                                                      |
| `Featured`                                                         | exactly `yes` or `no`; featured rows sort first under every sort option                                                                                                                         |
| `Protocol File (asset) Wave N` / `Codebook Summary (asset) Wave N` | optional, but must be filled or empty **as a pair**                                                                                                                                             |
| `Date Added`                                                       | `Mon. D,YYYY` — an English three-letter month, optional period, then day, comma, year (`Oct. 22,2025`). Drives the newest/oldest sort.                                                          |
| `Supplementary Material Label` / `Supplementary Material (asset)`  | optional, but must be filled or empty **as a pair**; the asset must be a `.pdf`                                                                                                                 |

Facet values are matched as exact strings, so a new spelling silently creates a
second facet beside the one it meant to join. Reuse an existing value verbatim —
both `Field(s)` and `Edge Generation Methodology` values are Sentence case.
Enumerate what is already in use before writing the row:

```sh
cd apps/networkcanvas.com && node -e "
const fs=require('fs'),csv=require('csvtojson');
csv().fromString(fs.readFileSync('content/protocol-gallery.csv','utf8')).then(rows=>{
  const u=c=>[...new Set(rows.flatMap(r=>r[c].split(',').map(s=>s.trim()).filter(Boolean)))].sort();
  console.log('Field(s):', u('Field(s)'));
  console.log('Edge Generation Methodology:', u('Edge Generation Methodology'));
});"
```

## What you do _not_ have to touch

- **Routes.** The detail page's `generateStaticParams` enumerates the CSV, so a
  new slug becomes a static route on its own (`dynamicParams = false` — the page
  exists only if the row does).
- **Filters and sorting.** Facet options and their counts are computed from the
  loaded rows in `lib/galleryFacets.ts`.
- **Translations**, for the row itself: authored cells are rendered as written
  and are not translated. The one exception is stage-type names, which come from
  `ProtocolGallery.stageTypes.<StageType>` in `messages/en.json` and
  `messages/es.json`. Every stage type the current schema defines has an entry
  today; if a protocol introduces one that does not, add it to both catalogs —
  the message-parity test requires English and Spanish keys to match.
- **`developing-network-canvas-ui`.** Adding a row changes no component code.
  Invoke that skill only if the addition forces a component or copy change, and
  then before the first such edit.

## When something fails

| Message                                                          | Cause                                                                                                                               |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `<column>: … ; run pnpm --filter networkcanvas.com gallery:sync` | A derived cell was hand-edited, left empty, or an asset was replaced without re-syncing. Run the sync; do not "fix" the cell.       |
| `Waves column missing; run …`                                    | The header lost its derived block. Run the sync.                                                                                    |
| `Missing gallery asset: <filename>`                              | The row names a file that is not in `public/protocols/protocol-gallery/`.                                                           |
| `Wave N: protocol and codebook must be paired`                   | One half of a wave pair is filled.                                                                                                  |
| `<column>: unrecognized column`                                  | A header cell that is neither an authored column nor a recognized wave column — usually a typo or a stray trailing comma.           |
| `row N: <file>: protocol.json: …` (from the sync script)         | The `.netcanvas` is unreadable or its `protocol.json` has no stages / an unknown stage type. Re-export it from a current Architect. |
| `Slug: duplicate slug`                                           | Two rows share a slug.                                                                                                              |

Row numbers in these messages are 1-based over the file, header included, so
"row 5" is the fourth protocol.

## Releasing

The gallery ships with networkcanvas.com, which is a **separately gated release
lane**. A published protocol is consumer-visible content, so the change needs a
Website changeset, and that changeset may not name any package outside the
Website lane. See `creating-a-changeset`.

The gallery is also served from `protocolgallery.networkcanvas.com`, a Netlify
domain alias of the same deploy (`lib/protocolGalleryHosting.ts`,
`netlify/edge-functions/locale.ts`). That is a hosting concern only — it changes
nothing about adding a row.
