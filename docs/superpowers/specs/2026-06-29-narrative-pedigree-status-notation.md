# NarrativePedigree status notation + at-risk configurability

Finalized 2026-06-29 with the author (genetics domain expert), grounded in **Bennett RL, French KS, Resta RG, Austin J. "Practice resource-focused revision: Standardized pedigree nomenclature update centered on sex and gender inclusivity." J Genet Couns. 2022;31:1238–1248** (NSGC). This is the canonical reference for the glyphs.

## Principles

- **Shape = sex/gender** (already our node shape): square = male, circle = female, diamond = non-binary / unknown. The single-condition node-Sticker conforms to the person's shape. **Perimeter markers on `StickerNode` are always circles** (the node shape only drives their _position_).
- **Fill = status.** Glyphs are drawn in the **condition's colour** on a **white** symbol, except "affected" which is a solid fill of the condition colour.
- Display-only: the genetics **engine is unchanged** (still emits the 6 `Status` values + the `atRiskHomozygous` flag). We only change how each is drawn and add a config gate. Safe re: the research-team genetics sign-off.

## Glyphs (per `Status`), shape-conforming

| Engine status      | Plain meaning                             | Glyph                                                                     | Bennett basis                               |
| ------------------ | ----------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------- |
| `affected`         | Has the condition                         | **Fully shaded** symbol                                                   | Fig 2 "clinically affected"                 |
| `obligateAffected` | Will develop it (obligate/presymptomatic) | **Single vertical line** through the centre                               | Fig 2 "asymptomatic/presymptomatic carrier" |
| `obligateCarrier`  | Carrier                                   | **Horizontal line-fill** (hatch); the 2022 revision drops the central dot | §4.5                                        |
| `atRiskAffected`   | May develop it                            | `obligateAffected` glyph (vertical line) **+ centred "?"**                | app addition (no Bennett symbol)            |
| `atRiskCarrier`    | May be a carrier                          | `obligateCarrier` glyph (horizontal lines) **+ centred "?"**              | app addition                                |
| `unknown`          | Not known                                 | **Plain** white symbol, outline only                                      | —                                           |

Secondary flag (overrides the primary glyph when set, **only when at-risk display is on**):

| Flag               | Plain meaning                                              | Glyph                                                              |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `atRiskHomozygous` | May be affected (two copies; consanguinity / compound-het) | **Fully shaded + a centred WHITE "?"** (no white circle behind it) |

### The "?" treatment

- For `atRiskAffected` / `atRiskCarrier` (white-ish symbols), the "?" is **crimson/condition-colour, centred, on a small WHITE circular break** so it reads over the vertical line / hatch (a small top-bottom gap in the line).
- For `atRiskHomozygous` (solid fill), the "?" is **WHITE, centred, with NO circle behind it** (it reads directly on the shaded fill).

The `atRiskHomozygous` (+) homozygous glyph replaces the person's carrier-level glyph when it applies (it conveys the higher-severity "may be affected").

## At-risk configurability (Architect)

- **Schema** (`@codaco/protocol-validation`, NarrativePedigree stage, schema 8): add a field e.g. `showAtRiskStatuses: boolean`, **default `false`**. NarrativePedigree is new in this PR (unreleased), so no migration is required — add it with a `.default(false)` so existing fixtures stay valid.
- **Runtime** (`NarrativePedigreeView`): read the field. When **off** (default), the three at-risk glyphs (`atRiskAffected`, `atRiskCarrier`, `atRiskHomozygous`) are **not drawn** — those people render as their certain status if they have one, otherwise `unknown` (plain). When **on**, they render with the "?" glyphs above. The **key panel reflects the displayed set** (4 entries when off; 6 + homozygous when on).
- **Architect editor** (`apps/architect-web` StageEditor for NarrativePedigree): a clearly-labelled toggle, e.g. _"Show possible (at-risk) statuses"_, **defaulting off**, with a **detailed explanation** the researcher/clinician reads before enabling, covering:
  - **What is displayed:** the "may develop / may carry / may be affected" symbols (the certain glyph + a "?").
  - **How it is calculated:** derived inheritance _risk_ from the family structure and each condition's inheritance pattern (not observed/diagnosed status) — e.g. a child of an affected dominant parent is shown as _may develop_; a child of two carriers as _may carry_ / _may be affected_ (homozygous).
  - **Why it's off by default / caution:** a strong visual signal that can read as fact; intended for **clinician-directed use** where the result is interpreted in context. Standard pedigree nomenclature (Bennett 2022) intentionally does not encode probabilistic risk.

## Storybook coverage

- A glyph story showing **all statuses × all three shapes** (square/circle/diamond), incl. the homozygous glyph, so the notation is visually verifiable.
- NarrativePedigree stories with the at-risk toggle **off** (default) and **on**.

## Verify before done

Render the Storybook stories and check each glyph against this table in all three shapes (controller does the visual pass — jsdom can't).
