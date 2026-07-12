---
name: creating-a-network-canvas-interface
description: 'Use when adding a NEW Network Canvas interface — a participant-facing interview stage type that does not exist yet (a new sociogram-like, name/edge generator, census, narrative, or informational screen). NOT for changing an existing interface. Keywords: new interface, new stage type, add interface, add a stage type, interview screen, interview stage, stage schema, interfaces/index, getInterface, INTERFACE_TYPES, INTERFACE_CONFIGS, capture story, interface documentation, schema version.'
---

# Creating a Network Canvas interface

## Overview

A Network Canvas "interface" is the fundamental data-collection unit in a Network Canvas interview. It is participant facing when administered via an interview client, and researcher facing when configured via a protocol builder. It is **one contract — a single stage-type string — realised across four surfaces that must ship together**: the protocol schema (contract), Architect (configuration builder), the interview runtime (instrument), and the documentation site. A new interface wired into only some of them is broken, not a smaller deliverable.

**Core principle:** confirm the schema target _before_ writing anything, build the same stage-type across all four surfaces in sync, reuse existing interface patterns, and prefer researcher configuration for participant-visible text — hardcode only where essential or generic boilerplate.

## When to use

- A researcher wants an interview screen / stage type that does not already exist.
- NOT for editing an existing interface, or for a non-stage feature — use `developing-in-network-canvas` for those.

## Before you write any code (in order)

1. **Invoke `developing-in-network-canvas` (REQUIRED).** Reuse-first, accessibility, internationalisation, and participant tone are not optional add-ons here — they are the body of the work. This skill assumes you are already following it.
2. **Brainstorm the interface first.** A new stage type is a new feature; agree the interaction, the data it writes, and the configuration surface before touching files. Use Codex planning or a concise implementation plan when the request leaves behavior or schema shape ambiguous.
3. **Confirm the schema version with the user. Do not assume.** Ask explicitly: does this target the **current** schema version as a purely additive stage type (no migration), or does it require a **new** schema version (and therefore a migration)? "It's obviously additive" is exactly the assumption to surface to the user, not to make silently. **Determine the current version by reading `CURRENT_SCHEMA_VERSION`** (exported from `packages/protocol-validation/src/schemas/index.ts`) — never hardcode a version number. New stage files live under `src/schemas/<current>/stages/`, where `<current>` is that value. A version bump additionally means a new `schemas/<n>/` directory, a `migration.ts`, and an entry in `SchemaVersionSchema`.

## The four surfaces — all must ship together

The stage-type string (e.g. `'TimelineSorter'`) is the single contract. It is wired by hand in each surface; **the change is incomplete until all four agree.** Read the cited exemplar in each before writing. Below, `<current>` is the value of `CURRENT_SCHEMA_VERSION` (see step 3) — read it, don't assume a number.

| Surface                 | Where                          | What to do                                                                                                                                                                                                                           | Register / anchor at                                                                                                                                                                                                                               | Exemplar                               |
| ----------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Contract** (schema)   | `packages/protocol-validation` | Create `src/schemas/<current>/stages/<name>.ts` extending `baseStageSchema` with `type: z.literal('<Name>')`; tag every variable reference with `entityAttributeReference(...)`; add tests under `src/schemas/<current>/__tests__/`. | Import + re-export + add to the discriminated-union array in `src/schemas/<current>/stages/index.ts`.                                                                                                                                              | `stages/network-composer.ts`           |
| **Builder** (configure) | `apps/architect`               | Add the picker entry; build the editor sections researchers use; give it a default name.                                                                                                                                             | `NewStageScreen/interfaceOptions.ts` (`INTERFACE_TYPES`), `StageEditor/Interfaces.tsx` (`INTERFACE_CONFIGS`), new `components/sections/<Name>/*` exported from `components/sections/index.tsx`, `StageEditor/autoStageName/generateStageLabel.ts`. | `components/sections/FamilyPedigree/*` |
| **Instrument** (run)    | `packages/interview`           | Create `src/interfaces/<Name>/<Name>.tsx`; consume the shared `Prompts` component; add a Capture story and regenerate images.                                                                                                        | `case '<Name>'` in `getInterface` (`src/interfaces/index.tsx`); `<Name>.capture.stories.tsx` → then `pnpm generate:interface-images`.                                                                                                              | any dir under `src/interfaces/`        |
| **Documentation**       | `apps/documentation`           | Write the per-interface doc page; the sidebar auto-generates from the filesystem + frontmatter.                                                                                                                                      | `docs/desktop/interface-documentation/<name>.en.mdx` with `title:` frontmatter.                                                                                                                                                                    | `sociogram.en.md`, `geospatial.en.mdx` |

**Easy-to-miss sync points** (a stage-type that compiles can still be half-wired):

- **`protocol-utilities` switches on stage type** in `generateNetwork.ts` and `SyntheticInterview.ts` for synthetic-network generation — add a case if the new stage produces, clears, or shapes alter data. (`StageType` is sourced from `@codaco/protocol-validation`, so the type tracks the schema automatically; only the per-stage behaviour needs wiring.)
- **The Capture story is mandatory, not optional.** Every interface needs a `Capture/` storybook story so timeline/preview images generate. Seed every attribute explicitly in the fixture (`getNetwork()` randomises unset attributes).
- **Architect variable-usage detection** keys off hand-maintained reference paths. If the stage references variables at non-standard locations, mirror the schema's cross-reference keys or the variables get falsely flagged "unused".

## Essential interface design principles

**Reuse existing interface patterns before inventing new ones.** Most new interfaces are recombinations of patterns that already exist — walk the reuse ladder from `developing-in-network-canvas` at the _interface_ level, not just the component level.

- **Multiple tasks within one stage → the `prompts` concept.** Do not invent a per-stage list of tasks/questions. Use prompts end to end: a `prompts` array in the schema, the shared prompt-list editor in Architect (reuse `EditableList` + `PromptText`, mirror `NameGeneratorPrompts`), and the runtime `Prompts` component (`packages/interview/src/components/Prompts/Prompts.tsx`) which already handles rotation, animation, and screen-reader announcement.
- **Placement / drag / roster / selection/ and forms** are solved — build on the existing canvas, node, form, field, and collection primitives rather than net-new interaction code.

**Minimise hardcoded participant text; prefer researcher configuration.** Hardcoded participant copy is sometimes unavoidable, but it is **strongly discouraged** unless the text is essential or generic boilerplate. The test before typing a string literal: _would a researcher plausibly want to change this wording for their study?_ If yes — prompt text, instructions, study-specific labels, meaningful empty states — it is a **researcher-authored configuration field**: define it in the stage schema, expose it in the Architect editor, store it in the protocol, and render it from props. Hardcoding is acceptable for **generic UI chrome and boilerplate** (button labels like "Continue", structural/navigational text with no study-specific meaning) and where externalising it genuinely adds no value — and even then prefer the existing shared components, which already carry the right copy and tone.

## Definition of done

- [ ] Schema version confirmed with the user (additive vs. new version + migration).
- [ ] **Contract:** schema file created, registered in `stages/index.ts`, variable refs tagged, tests pass.
- [ ] **Builder:** picker entry, editor sections, default name — researcher can fully configure it in Architect.
- [ ] **Instrument:** runtime component registered in `getInterface`, renders from config, consumes `Prompts`.
- [ ] **Documentation:** `<name>.en.mdx` page written in `apps/documentation`.
- [ ] Sync points: `protocol-utilities` behaviour (`generateNetwork`/`SyntheticInterview` case if it shapes data); Capture story added and `pnpm generate:interface-images` run.
- [ ] Participant copy a researcher would want to control is configuration, not hardcoded (generic/boilerplate chrome excepted).
- [ ] One stage-type string is identical everywhere it is referenced.

## Common mistakes

| Mistake                                                    | Do instead                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Assuming "schema 8, additive, no migration" without asking | Confirm the target schema version with the user before any layer.                                                               |
| Wiring schema + runtime, forgetting Architect and/or docs  | Treat all four surfaces as one deliverable; use the Definition of done.                                                         |
| Skipping the documentation page because "code works"       | The `apps/documentation` page is a required surface, not a follow-up.                                                           |
| Baking study-specific participant copy into the component  | If a researcher would want to change the wording, make it a config field; hardcode only essential/boilerplate chrome.           |
| Inventing a bespoke per-stage task list                    | Use the `prompts` concept across schema, editor, and runtime.                                                                   |
| Adding the stage type only where it's declared             | Also wire its runtime behaviour — e.g. a `generateNetwork`/`SyntheticInterview` case in `protocol-utilities` if it shapes data. |
| Forgetting the Capture story                               | Add `<Name>.capture.stories.tsx`, then `pnpm generate:interface-images`.                                                        |

## Quick reference

- **Schema stages + registry:** `packages/protocol-validation/src/schemas/<current>/stages/` (`index.ts` is the union); read `CURRENT_SCHEMA_VERSION` from `schemas/index.ts` for `<current>`.
- **Architect editor registry:** `apps/architect/src/components/StageEditor/Interfaces.tsx`; picker in `NewStageScreen/interfaceOptions.ts`; sections in `components/sections/`.
- **Runtime registry:** `packages/interview/src/interfaces/index.tsx` (`getInterface`); prompts at `src/components/Prompts/Prompts.tsx`.
- **Docs:** `apps/documentation/docs/desktop/interface-documentation/<name>.en.mdx`.
- **Sync points:** `packages/protocol-utilities/src/SyntheticInterview.ts` / `generateNetwork.ts` (per-stage behaviour); images via `pnpm generate:interface-images`.
