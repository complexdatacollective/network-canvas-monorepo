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

**What Architect does.** `VariablePicker` (`apps/architect/src/components/Form/Fields/VariablePicker/`) is a trigger button — "Select attribute" while empty, "Change attribute" while a value is held — that shows the held attribute as a typed pill (name, type colour, type icon) or the line "No attribute selected". The trigger opens `VariableSpotlight`: a modal dialog with an autofocused search box ("Find or create an attribute") that filters the subject's attributes by case-insensitive substring of the name over one alphabetical, ungrouped `role="listbox"` of typed pills. ArrowDown/ArrowUp hand focus from the search box into the list; Enter selects the focused row, or the sole remaining match; Escape closes through the dialog's own dismissal. Focus returns to the trigger on dismissal but not after a pick, because new content mounts below. With creation allowed (17 of about 20 call sites; four pass `disallowCreation`) and a term that matches nothing, the first row reads "Create new attribute called "X"."; a name already used for that subject, or one outside `/^[a-zA-Z0-9._\-:]+$/`, disables the row and states the reason. The picker hands the name to the section, which creates the attribute: simple types directly (the quick-add section creates a `text` attribute), types that need a value set (ordinal, categorical) through the new-variable dialog seeded with the name; the new id is then written into the field. Three empty states: nothing to offer and may create (with the attribute-naming docs link); nothing to offer and may not; filtered to nothing. Architect's e2e helper `createVariableViaSpotlight` and six specs drive this surface. Citations: `research/parity/defect-01-variable-picker.md`.

**What the package does.** `VariablePickerField` (`packages/protocol-builder/src/fields/VariablePickerField.tsx`) is a native `<select>` (`role="combobox"`, as its own story asserts) with a plain-text type token beside it: no trigger, no modal, no search, no list, no keyboard model, no create row. Creation lives outside the control in two shapes: an always-visible "Create a new attribute" name box under the select at two call sites (quick-add; the form-fields attribute row), and a sibling `CreateVariableButton` opening a `VariableEditor` dialog at eight sections. Every other section offers no creation. The option pool (`useVariableChoices`: subject, type list, writer class, interface-owned exclusions, held value kept and explained) is correct and stays; the package's handling of a held id that is missing or unusable (kept, shown, explained) is better than Architect's and stays.

**Why it is wrong.** The rework plan singles this control out and rules out what was built: "a variable is picked from a codebook with its type visible and a create affordance" (plan lines 271-276) and "variable picker and other protocol-specific pickers in the package; none of them rendered as select fields" (Decisions taken, lines 465-467). Against Architect the losses are search over codebooks that run to dozens of attributes per type, keyboard navigation, creation from the search term validated live, type colour and icon, and creation being offered at all in most sections. The write path (`useCodebookSectionWrite`, immediate commit under the codebook section lock, not undone by cancelling the stage edit) is right and is kept.

**Required behaviour.**

1. `VariablePickerField` renders a trigger button ("Select attribute" / "Change attribute", carrying the focus target for the first-error scroll), never a select. The held value renders as a typed pill; empty shows "No attribute selected".
2. The trigger opens a `role="dialog"` with an accessible name (Architect's has none; the rebuild fixes that). The dialog autofocuses a labelled `role="searchbox"`; the filter is a case-insensitive substring of the name, no debounce, over a `localeCompare`-sorted list; the term resets on close.
3. Results are one flat `role="listbox"` with `aria-activedescendant`; each row shows name, type colour and type icon. ArrowDown/ArrowUp from the search box move focus into the list; the list's roving focus (including Home/End) works within it; Enter selects the focused row; Enter in the search box with exactly one result selects it; Escape closes through the dialog's dismissal path.
4. Selection is single and transient: choosing writes the option id and closes. Focus returns to the trigger on dismissal and not after a pick. Focus entering the portalled dialog does not blur or validate the owning field; a completed pick does.
5. The section keeps passing `options` from `useVariableChoices`; the picker takes `disallowCreation` and the entity/type subject it needs for the uniqueness check.
6. Creation lives inside the dialog. With a non-empty term, no exact match and creation allowed, the first row is "Create new attribute called "X"."; a duplicate name for the subject or a character outside `[a-zA-Z0-9._\-:]` disables the row with the reason; Enter takes an enabled create row.
7. Creation matches Architect's two paths: types that need no value set create directly through the package's create verb; ordinal, categorical and locked-option slots open the `VariableEditor` dialog seeded with the typed name (and the locked options). Both write under the codebook section lock, commit immediately, survive cancelling the stage edit, and resolve the existing `CreateOptionOutcome` (`created` selects the new id; `unassigned` says so and selects nothing; `refused` keeps the term for correction).
8. Every section that offers creation offers it through the picker. The sibling `CreateVariableButton` is removed from the eight sections; its `VariableEditor` dialog becomes the picker's escalation path. The two inline name boxes go.
9. Architect's three empty states, with the docs link on the first.
10. Copy through locale ids (en and es).

**Acceptance criteria** (each fails against the current select):

1. The field resolves by `getByRole('button', { name: 'Select attribute' })` and contains no `combobox`.
2. Clicking it opens a `dialog` that `toHaveAccessibleName()`, whose `searchbox` has focus.
3. Typing a substring reduces the `option` count to the matching rows in `localeCompare` order; clearing restores the full list; re-opening shows an empty search box.
4. Each row's accessible name is the attribute name and it carries the codebook type (for example `data-attribute-type`).
5. ArrowDown from the search box moves focus into the listbox; a second ArrowDown advances `aria-activedescendant`; Enter selects the focused row, closes the dialog, and the form value equals that option's id. With exactly one result, Enter in the search box selects it.
6. Escape closes the dialog with focus on the trigger; after a selection focus is not on the trigger.
7. With creation allowed and a term matching nothing, the first row's name is `Create new attribute called "<term>".`; a duplicate or disallowed term gives that row `aria-disabled="true"` with the reason, and Enter creates nothing; with `disallowCreation` no create row appears for any term.
8. A `created` outcome closes the dialog, sets the value to the returned id, and the trigger reads "Change attribute"; `unassigned` leaves the value unchanged and announces it in a `role="status"` region; `refused` leaves the dialog open with the term in the search box.
9. For an ordinal or categorical (or locked-option) slot, the create row opens the `VariableEditor` dialog with the name pre-filled, and saving it selects the new id.
10. A unit test proves the write goes through `useCodebookSectionWrite` under the section lock and that the created attribute survives cancelling the stage edit.
11. Focus moving from the trigger into the dialog does not mark the owning field blurred and raises no required error; a completed pick does mark it blurred (port `VariablePicker.test.tsx:234-266`).
12. No section renders a `CreateVariableButton` beside a picker (a test over the all-nineteen editors story or a knip-visible deletion).
13. A Storybook interaction test covers open, type, arrow, Enter, pill; and open, type a new name, create row, pill.
14. An Architect e2e spec drives both journeys against the package editor, shaped like `e2e/pageobjects/editor-sections/variables.ts:38-99`.

**Seam and size.** Package only, at the fields seam: `fields/VariablePickerField.tsx` rewritten (trigger, pill, dialog); new `fields/VariableSpotlight.tsx` (dialog, search, list, create row); a typed attribute pill ported from Architect's `VariablePill` with the type colours and icons (into fresco-ui only if the colours are theme tokens usable elsewhere); `sections/create-variable/CreateVariableButton.tsx` refactored so its dialog is reached from the create row, and the eight adopting sections drop the button; `useVariableChoices` unchanged; stories and the create-path tests move with the control. No new fresco-ui primitive: Architect's spotlight is built from parts fresco-ui already exports (`Modal`, `ModalPopup`, `Collection`, `ListLayout`, `InputField`). A generic spotlight dialog is promoted to fresco-ui only when a second picker adopts it. Size **L** (about 1,300 added, 350 removed); §4 may land it as two PRs — the picker with creation wired where it exists today, then the removal of the eight sibling buttons.

**Decisions taken (orchestrator, 2026-09-11, reversible; Josh can overrule here):** the create path keeps Architect's two shapes rather than always opening the editor (item 7); the dialog is named by the field's label through `aria-labelledby`, falling back to a locale string "Select an attribute"; `CreateVariableButton` does not survive as a sibling control anywhere, because the plan's "invent an attribute from a row" and the picker's create row are the same act at every site, and locked-option slots are served by the escalation path.

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
