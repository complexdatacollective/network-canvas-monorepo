# Protocol Builder Parity Defects

**Status:** Draft — being collected with Josh (2026-09-11). Not yet agreed.

**Tracking:** follow-up to epic #1483 (the `@codaco/protocol-builder` rework); the combined Architect adoption/removal PR #1850 (closes #1491, #1492) is approved in principle and merges independently of this document.

**Related:** the rework plan (`docs/superpowers/plans/2026-09-09-protocol-builder-rework.md`) — its "Decisions taken" section is authoritative wherever a difference from Architect was chosen deliberately; the family parity audits under the orchestrator's `research/parity/` directory, which feed this document.

## 1. Summary

The nineteen stage editors in `@codaco/protocol-builder` were rebuilt from the schema and from the salvaged tests of the extraction branches, not with the current Architect editors as the oracle. They pass their own tests and Architect's end-to-end suite, but in places they behave differently from the Architect editors researchers use today, and some of those differences are wrong. This document collects those defects one at a time, states for each what Architect does, what the package does, why the package is wrong, the required behaviour, and acceptance criteria a test can fail, so that a second implementation loop can resolve them without re-deciding anything.

## 2. Principles

- **Architect's current behaviour is the oracle** unless the rework plan's "Decisions taken" or a dated decision in the epic ledger chose the difference deliberately. A deliberate difference is not a defect; it is listed once, with its citation, and closed.
- **Every defect gets acceptance criteria a test can fail** — a unit test, a Storybook play, or an Architect end-to-end case — and the fix lands with that test.
- **Fixes land in the package at the seam the plan names** (contract, state layer, form, fields), never as a per-section patch. Where Fresco's form system is short of a primitive, the primitive lands in `@codaco/fresco-ui` with its own stories and tests.
- **Researcher copy goes through locale ids** (en and es), as everywhere in the package.
- **No new machinery beyond the defect.** A fix that would widen into a redesign is written up here as its own defect first.

## 3. Defects

### 3.1 Variable picker and creating variables

_Josh, 2026-09-11:_ "the variable picker in architect is a sophisticated component that renders a full screen modal with a search box and a keyboard navigable list. this should have been recreated as a Field component in the new implementation. It also allowed for new variables to be created."

_Research pending — filled in from `research/parity/defect-01-variable-picker.md` (what Architect does, what the package does, why it is wrong, required behaviour, acceptance criteria, seam and size)._

### 3.2 The in-editor section outline is removed

_Josh, 2026-09-11:_ "the section summary sidebar that has been added was not part of the original app, and should be removed."

Reading: the package's in-editor left column — `SectionOutline`, the "Stage sections" landmark listing each section with "Finished / Not finished / Has a problem" — which the extraction added (#1485, PR #1539) and every one of the nineteen editors renders inside `StageEditorShell`; not Studio's route-level "Protocol sections" list, which is Studio's own chrome.

_Research pending — filled in from `research/parity/defect-02-section-outline.md` (what Architect has, what the outline does and who depends on it — the e2e `expectNoIssues()` oracle, stories, Studio — what replaces its functions, acceptance criteria, seam and size, and whether Studio's design wants it as a host option rather than a deletion)._

### 3.3 Quick-add attribute validation is a nested, toggleable validation section

_Josh, 2026-09-11:_ "the quick add attribute validation should be a nested validation section that can be toggled on. the Alert that has been added is incorrect."

Reading: in Architect's name generator editor, the quick-add section edits the quick-add variable's validation rules in place through a nested section that the researcher toggles on (off = no validation); the package's quick-add section replaced that with an Alert. The Alert goes; the nested toggleable validation section returns.

_Research pending — filled in from `research/parity/defect-03-quick-add-validation.md` (what Architect does — the nested section, its toggle, which rules it offers for the quick-add variable's type, how it writes to the codebook; what the package shows instead and what its Alert says; required behaviour; acceptance criteria; seam and size)._

## 4. Sequence

_To be written once the collection is complete: which defects share a seam and land together, which need a fresco-ui primitive first, and the order that keeps every intermediate main state working._

## 5. Definition of done

_To be written with the sequence: every defect's acceptance criteria pass on `main`; the family parity audits list no remaining `incorrect` items; the closing report on #1483's follow-up records what changed._
