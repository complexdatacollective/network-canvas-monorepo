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

**What Architect has.** A single column (`apps/architect/src/components/StageEditor/StageEditor.tsx:710-761`): heading, then the sections, no sidebar, no per-section navigation or status. Problems surface two ways: each field's own message and `aria-invalid`, and the toolbar Issues popover (`components/Issues.tsx`), which lists the failed fields after a refused save and focuses the control on click. A live stage-level validity signal (`isStageInvalid`, from a debounced `validateProtocol` over the working protocol) disables Preview; it survives on #1850 in `StageEditorChrome`. The e2e helper `expectNoIssues()` asserted zero `issue` rows, which is vacuous before a save, and all 21 call sites run it before `save()`. Citations: `research/parity/defect-02-section-outline.md`.

**What the package adds.** `form/SectionOutline.tsx` (252 lines), `form/outlineStore.ts` (533), `form/useOutlineSection.ts` (50): a `nav` landmark "Stage sections" with one button per section and a status ("Finished", "Not finished", "Has a problem", "Switched off", "Not available yet"), kept current by a `MutationObserver` on the form (including the #1849 `aria-invalid` filter), mounted by `StageEditorShell.tsx:453-454` as the left track of a two-column grid. Seven `protocolBuilder.outline.*` locale ids. Every card section and the stage-name section register with it, and use the returned id as their DOM id so the outline can focus them; fresco-ui `Section`'s `tabIndex={-1}` exists only for that. Consumers: two package test files (603 lines) plus the shared harness's `outline()` at 132 call sites across 47 test files; two stories; and PR #1850, which re-pointed Architect's `expectNoIssues()` at the landmark and patched the outline twice for layout damage in a scrolling host panel. Studio renders it through the package editor but nothing under `apps/studio` reads it; Studio's own affordances are its route-level "Protocol sections" list and its validation button. No documentation slug lives in it.

**Why it is wrong.** It is a design idea from the extraction plan (`2026-08-27-protocol-builder-extraction.md:162-173`, "a sticky section outline on wide screens and a compact jump control on smaller screens"), landed with the form shell in #1485 / PR #1539, and never mentioned by the rework plan. Architect never had it. Josh: not part of the original app; remove it. This supersedes the epic ledger's 2026-09-10 05:00Z line that the outline "is part of the editor Architect adopts".

**Required behaviour.**

1. `SectionOutline`, the outline store, `useOutlineSection`, their tests, the seven locale ids and the second grid track are deleted. The editor renders one column, Architect's shape. Section ids fall back to `useId()`; the `tabIndex={-1}` focus target in fresco-ui `Section` goes with its only consumer.
2. Nothing replaces section navigation: Architect never had any.
3. Schema issues anchored at a path, which today reach the researcher only through the outline (`StageEditorShell.tsx:304-311` splits them off), are re-homed: every schema issue renders in the existing top-of-form error list as its `schemaProblemSentence` naming the field. `schemaProblems.ts` and its two tests stay. The "absent and the field is required" suppression is kept by asking the form store for the field at that path rather than scraping the DOM. The refused-save message stops saying "The sections below say what is missing."
4. No stage-level "has a problem" signal is added: Architect derives its own, the beacon carries no validity, Studio has its validation button.
5. Architect's `expectNoIssues()` keeps its name and its 21 call sites but asserts something that can fail without the outline: before a save, that Preview is enabled (disabled exactly while `validateProtocol` refuses the working protocol); after a save, zero `issue` rows.
6. The test harness's `outline()` is re-implemented over the sections' `region` roles (fresco-ui `Section` renders `<section aria-labelledby>`), keeping the title enumerations and the translated-name check; the status assertions are deleted or converted to field-level ones. The story host's "everything is disabled" sweep drops its outline exclusion.
7. Every stage-editor Storybook snapshot moves with the layout; the baseline is regenerated in CI, never locally.

**Acceptance criteria** (each fails today):

1. `getByRole('navigation', { name: 'Stage sections' })` finds nothing in any stage editor, in Architect and in Studio.
2. Nothing under `packages/protocol-builder/src` imports or exports `SectionOutline`, the outline store, `sectionOutlineStatus` or `useOutlineSection`; the seven `protocolBuilder.outline.*` ids are gone from every catalog (the catalogs test enforces the pair).
3. A schema refusal no control can explain (a dangling resource reference; a subject naming a deleted type) still puts a sentence naming the field on screen after a refused save; a converted `outlineValidation` test, mutation-tested.
4. Nothing between the editor root and the `<form>` establishes a second grid track, and no section carries a `tabIndex="-1"` that nothing focuses.
5. Architect e2e `expectNoIssues()` fails on a deliberately invalid stage and passes on every interface spec.

**Seam and size.** `StageEditorShell` (the mount and the `stageProblems` split) and the two registration sites; the rest is test and locale fallout. Size **L**: five files deleted (about 1,440 lines), about eight source files edited (about 120 lines), 47 test files, two locale catalogs, two story files, one Architect e2e page object, one CI baseline pass. The test conversion is the bulk.

**Decisions taken (orchestrator, 2026-09-11, reversible; Josh can overrule here):** it is a deletion, not a host option, because Studio's app-shell design (`2026-09-01-studio-app-shell-design.md:401-403`) specifies only #1272's route-level protocol outline and nothing under `apps/studio` reads the in-editor one; anchored schema issues are re-homed in the top-of-form error list rather than dropped; this lands after #1850 merges, so the parity PR owns the `expectNoIssues()` rewrite.

### 3.3 Quick-add attribute validation is a nested, toggleable validation section

_Josh, 2026-09-11:_ "the quick add attribute validation should be a nested validation section that can be toggled on. the Alert that has been added is incorrect."

Reading: in Architect's name generator editor, the quick-add section edits the quick-add variable's validation rules in place through a nested section that the researcher toggles on (off = no validation); the package's quick-add section replaced that with an Alert. The Alert goes; the nested toggleable validation section returns.

**What Architect does.** The quick-add section (`apps/architect/src/components/sections/QuickAdd/QuickAdd.tsx:109-116`) renders, once an attribute is held, a nested toggleable `Section` titled "Validation" (summary "Enable to add validation rules to the attribute."; fresco-ui exposes the toggle as a `role="switch"` named "Validation") through `CodebookVariableValidationSection` → `ValidationSection`. It opens by default when the attribute already carries a rule. It offers the schema's rules for the attribute's type — quick add is always `text`, so `required`, `minLength`, `maxLength`, `unique` (dropped for ego), `differentFrom`, `sameAs`, grouped Requirements / Limits / Compare to another attribute. Each committable change is written straight to the codebook variable (`updateVariableAsync`, `replaceProperties: ['validation']`); an incomplete or contradictory map is not written and the row states its problem. Toggling the section off writes `{}` and the key leaves the codebook entry, silently. Writes are immediate and outside the stage draft: Save and Cancel neither commit nor revert them. NetworkComposer mounts the identical section for its own quick-add attribute. The e2e helper `createQuickAddVariable(..., { clearRequiredValidation: true })` asserts the switch is checked (the created attribute is born `required`) and clicks it off. Citations: `research/parity/defect-03-quick-add-validation.md`.

**What the package does.** `editors/name-generator-quick-add/sections/QuickAddSection.tsx:313-464` renders, where that section should be, a warning Alert "This attribute can be left empty" with a one-way "Require an answer" button that writes `{ required: true }` over the authoritative rules and then disappears. One of six rules is reachable, in one direction; `required` cannot be turned off and the other five cannot be reached from this editor at all. Six tests assert the Alert; the story does not touch validation.

**Why it is wrong.** Neither plan mentions quick add and "Decisions taken" says nothing about it; the Alert is the implementing commit's own choice, explained in a code comment (`QuickAddSection.tsx:305-311`). Defect, not a superseded decision. The #1852 change to `VariableValidationEditor`'s alert stand-down is unrelated.

**The package already has the parts.** `codebook/validation/VariableValidationEditor.tsx` (the controlled rule-map editor, already mounted inline in a stage section by anonymisation's `PassphraseRulesControl.tsx`), the rule catalogue in `codebook/variableValidation.ts` (same schema mask as Architect), the write seam `useCodebookSectionWrite` + `documentWithUpdatedVariable(..., replaceProperties: ['validation'])` that the quick-add section already uses for `{ required: true }`, and fresco-ui `Section`'s `toggleable`. Missing is only the inline adapter; the package's nearest thing is the dialog-shaped, deferred-commit "Set rules for this answer" in `AttributeCodebookControls`.

**Required behaviour.**

1. A shared `codebook/validation/CodebookVariableValidationSection` — a nested toggleable `Section` titled "Validation" whose description says the toggle adds rules to the attribute — mounted inside the quick-add section while `quickAdd` holds an attribute, where the Alert sits now, and under NetworkComposer's quick-add attribute as in Architect.
2. Open when the attribute already carries any rule, closed when it carries none, read from the codebook.
3. Rules offered are the schema's for the attribute's type and entity through `getGroupedValidationsForVariableType`, rendered by `VariableValidationEditor`; comparison rows with no compatible target stay shown and explained, as the editor already does.
4. Reads the attribute's committed rules from the protocol context; writes each committable change through `useCodebookSectionWrite` + `documentWithUpdatedVariable(..., replaceProperties: ['validation'])` over the authoritative document; an incomplete or contradictory map is not written and the row states it.
5. Toggling off writes `validation: {}` so the key leaves the codebook entry, silently, as Architect does.
6. Commits immediately, outside the stage draft: cancelling the stage edit does not undo a rule change; saving the stage submits no `validation`.
7. A write refused because a colleague holds the codebook section is reported inside the section in the notice register; the quick-add field's own required check stays a save refusal on the picker.
8. An attribute created here is still born `{ required: true }`, so the section mounts open with that rule on.
9. The Alert, its button and the five locale ids (`canBeEmptyTitle`, `canBeEmptyDescription`, `requireAnswer`, `nowRequired`, `nowRequiredElsewhere`) are removed; the section's copy goes through new locale ids (en and es).

**Acceptance criteria** (each fails against the Alert):

1. With a quick-add attribute held, `getByRole('switch', { name: 'Validation' })` resolves inside the quick-add section; nothing reads "This attribute can be left empty" and no button is named "Require an answer".
2. For a `text` attribute on a node type, switching the section on exposes rule controls for `required`, `minLength`, `maxLength`, `unique`, `differentFrom`, `sameAs` under three group headings; for an ego subject `unique` is absent.
3. Switching `required` on records one codebook write for the attribute with `validation: { required: true }` and `replaceProperties: ['validation']`; switching it off records a write without `required`.
4. Setting `minLength` to 2 writes it merged over the attribute's existing rules; `minLength` switched on with an empty value writes nothing while the row states the problem.
5. Turning the section off writes `validation: {}` and the attribute has no rules afterwards, with no confirmation dialog.
6. A stage whose quick-add attribute carries `maxLength` mounts the section open; one whose attribute carries no rule mounts it closed.
7. A rule change survives cancelling the stage edit and saving the stage submits no `validation`.
8. A write refused for a held codebook section is reported inside the section in the notice register and the switch stays where the researcher left it.
9. Saving with no attribute chosen is still refused at the `quickAdd` field.
10. NetworkComposer's quick-add attribute mounts the same section.
11. Storybook: a play switches the section on, turns on `minLength` and reads the recorded host request; a Spanish play finds the section by its translated title.
12. Architect e2e: the existing `createQuickAddVariable(..., { clearRequiredValidation: true })` helper passes unchanged against the package editor.

**Seam and size.** New shared `codebook/validation/CodebookVariableValidationSection.tsx` (about 180 lines; local rule-map state, no nested form store); `QuickAddSection.tsx` loses `QuickAddAnswerRequirement` and `useRequireCodebookAnswer` and mounts the section; NetworkComposer mounts it; locale ids swapped; the six Alert tests become section tests plus tests for the shared section; stories. No fresco-ui change. Size **M**, about 550 added and 320 removed across seven files.

**Decisions taken (orchestrator, 2026-09-11, reversible; Josh can overrule here):** toggling off clears silently as Architect does, not behind the package's capability-close confirmation, so the e2e helper's single click stands; comparison rows without a compatible target stay shown and explained; the "Set rules for this answer" dialog on form-field rows is untouched by this defect (it is a different surface; any change to it is its own entry).

## 4. Sequence

_To be written once the collection is complete: which defects share a seam and land together, which need a fresco-ui primitive first, and the order that keeps every intermediate main state working._

## 5. Definition of done

_To be written with the sequence: every defect's acceptance criteria pass on `main`; the family parity audits list no remaining `incorrect` items; the closing report on #1483's follow-up records what changed._
