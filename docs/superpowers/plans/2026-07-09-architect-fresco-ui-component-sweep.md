# Architect fresco-ui component sweep

**Date:** 2026-07-09
**Status:** Subagent-assisted audit synthesis
**Scope:** `apps/architect` UI only, with shared-component gaps in
`packages/fresco-ui` noted where they block replacement.

## Goal

Architect now compiles against the shared Tailwind theme, so it can render
`@codaco/fresco-ui` components correctly. The next step is not a blind import
swap: it is a systematic sweep for places where Architect still owns custom UI
that should be replaced by, adapted to, or promoted into fresco-ui.

This document records a distributed review of Architect by UI subsystem and
turns it into a migration workflow and recommendation backlog.

## Method

The audit was run with six read-only subagents, each instructed to:

- read `AGENTS.md` and `.agents/skills/developing-in-network-canvas/SKILL.md`;
- verify the current fresco-ui public surface from
  `packages/fresco-ui/package.json` `exports`;
- inspect relevant fresco-ui source/stories before recommending a replacement;
- inspect its assigned Architect slice under `apps/architect`;
- classify candidates as `drop-in`, `adapter`, `extend shared`, or
  `keep local`;
- report representative file paths, migration risks, and ordering.

### Subagent Slices

| Slice                               | Architect surface reviewed                                                                                                                                                                        | Primary fresco-ui surface                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Dialogs and overlays                | `NewComponents`, legacy dialogs, Redux dialogs, `DialogManager`, `ProjectNav/NavShell`, Home menus, AssetBrowser dialogs, Query dialogs, NewStageScreen, error dialogs                            | `dialogs/*`, `Modal`, `Popover`, `Tooltip`, `DropdownMenu`, `Tabs`, `PortalContainer`                           |
| Forms                               | `ValidatedField`, `redux-form` fields, `Form/Fields/*`, `DatePicker`, `RichText`, `NativeSelect`, `MultiSelect`, `BooleanChoice`, `VariablePicker`, geospatial fields, `BasicForm`, section forms | `Form`, `Field`, `UnconnectedField`, `FieldGroup`, `SubmitButton`, `form/fields/*`                              |
| Shell, navigation, actions          | `ProjectNav`, `StageEditor` nav/heading, Timeline, Codebook controls, Home actions, banners, `EditorLayout`, `InlineEditScreen`, links, buttons, scroll panes                                     | `Button`, `IconButton`, `ScrollArea`, `Surface`, `Heading`, `Paragraph`, `Alert`, `Skeleton`, `Spinner`         |
| Data display and lists              | `Assets`, `AssetBrowser`, Codebook lists, Options, OrderedList, EditableList, Validations, Query rules, thumbnails, badges/tags, alerts, spinner                                                  | `Table`, `DataTable`, `collection/*`, `Badge`, `Alert`, `Spinner`, `Skeleton`, `Node`, `ScrollArea`             |
| Legacy/raw primitives               | `legacy-ui`, raw controls, icons, manual keyboard/ARIA code, custom motion/theme patterns                                                                                                         | `Button`, `Icon`, `Modal`, `dialogs/*`, `form/fields/*`, `Spinner`, shared motion/tokens                        |
| ProtocolSummary and domain sections | `lib/ProtocolSummary`, `sections/*`, TypeEditor, Query, AssignAttributes, NewStageScreen, PreviewHost                                                                                             | `RenderMarkdown`, `RichTextRenderer`, `RichTextEditor`, `Node`, `Table`, `Badge`, `Pill`, typography, `Surface` |

## Reusable Sweep Workflow

### 1. Inventory fresco-ui

Run this at the beginning of each sweep because the shared surface changes:

```bash
node -e "const pkg=require('./packages/fresco-ui/package.json'); console.log(Object.keys(pkg.exports||{}).sort().join('\n'))"
```

Then inspect source and stories for candidate targets:

```bash
rg --files packages/fresco-ui/src | rg 'Button|Dialog|Modal|Popover|Tooltip|DropdownMenu|Tabs|Table|DataTable|Badge|collection|form/fields|typography|Surface|Spinner|Skeleton|RenderMarkdown|RichText'
```

### 2. Inventory Architect

Use subsystem-specific searches rather than only global grep:

```bash
rg -n "@codaco/fresco-ui" apps/architect/src apps/architect/package.json
rg -n "components/NewComponents/(Dialog|Modal|Popover|Tooltip|Tabs|Switch)|NewComponents/(Dialog|Modal|Popover|Tooltip|Tabs|Switch)" apps/architect/src -g '*.tsx'
rg -n "~/lib/legacy-ui/components/(Button|Dialog|Dialogs|Modal|Icon)|legacy-ui/components/(Button|Dialog|Dialogs|Modal|Icon)" apps/architect/src -g '*.tsx'
rg -n "openDialog\(|ConfirmDialog|UserErrorDialog|canCancel|closeDialog" apps/architect/src -g '*.ts' -g '*.tsx'
rg -n "~/components/Form/Fields|../Form/Fields|../../Form/Fields|components/Form/Fields|ValidatedField|redux-form|FieldArray" apps/architect/src -g '*.tsx' -g '*.ts'
rg -n "<button\b|role=\"button\"|<input\b|<textarea\b|<select\b|aria-sort|tabIndex=\{0\}|onKeyDown" apps/architect/src -g '*.tsx'
```

### 3. Classify Candidates

| Label           | Meaning                                                                                           | Action                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `drop-in`       | Shared component covers API and behavior.                                                         | Replace directly with focused tests and visual checks.                   |
| `adapter`       | Shared component covers behavior, but Architect's current API or state shape differs.             | Add a small app adapter, migrate callers, then delete the local wrapper. |
| `extend shared` | Local behavior belongs in fresco-ui before app migration.                                         | Patch fresco-ui first with stories/tests, then migrate Architect.        |
| `keep local`    | Domain-specific workflow, protocol semantics, or print/report constraints make sharing low value. | Document why; still replace inner primitives when useful.                |

Score each candidate by reuse value, accessibility payoff, system leverage,
migration risk, shared-component gaps, and testability.

## Current Coverage Snapshot

The shared package currently exports 135 subpaths. Architect imports only a
small fraction directly: root providers/styles, `Alert`, `Node`, `CloseButton`,
`ModalPopup`, AppUpdate helpers, and a few utility/types. Most Architect UI is
still app-local.

| Surface                 | Findings                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overlays                | fresco-ui exports 14 relevant overlay/dialog subpaths. Architect mounts `PortalContainerProvider` and `DialogProvider`, but local overlay callers mostly use `NewComponents` or legacy dialogs.                                       |
| `NewComponents`         | Overlay layer has 6 wrapper files and 20 unique importing files; including `Switch`, there are 7 local Base UI wrappers. Exact overlay imports: `Dialog` 11 files, `Popover` 3, `Tooltip` 5, `Tabs` 1, `Modal` 1, `DialogBackdrop` 2. |
| Legacy UI               | `legacy-ui` still has 81 imports in 75 production files, 20 TS/TSX files, and 82 assets. Its `Button`, `Icon`, `Modal`, and dialog variants duplicate fresco-ui systems.                                                              |
| Redux dialogs           | Redux `openDialog`/`closeDialog` and `DialogManager` are active. The Redux dialog path is touched by 32 non-test files. Literal configs found in review: `Warning` 24, `Error` 11, `Notice` 7, `Confirm` 5, `UserError` 4.            |
| Forms                   | Architect remains a `redux-form` app. `ValidatedField` is the seam, while fresco-ui `Form` and `Field` use their own store. Direct form-store replacement is unsafe; leaf-control adapters are the right path.                        |
| Raw/ARIA patterns       | Review found 8 `role="button"` uses in 6 files, 12 `tabIndex` patterns, and around 30 keyboard-handler matches. Several are real accessibility targets rather than mechanical replacements.                                           |
| Data display            | Architect uses fresco-ui `Alert` and `Node`, but table/list/badge/spinner systems remain mostly local.                                                                                                                                |
| Motion/theme hardcoding | Legacy/raw review found 189 old palette class matches in 42 files, 24 shadow matches, and 196 timing/motion matches. Replacing primitives first will remove much of this indirectly.                                                  |

## Synthesis

### Highest-Leverage Systems

1. **Legacy UI retirement.** `legacy-ui` is the largest duplicate surface. Start
   with `Button`/`IconButton`, `Icon`, and dialog rendering.
2. **Overlay consolidation.** Architect already has the shared providers, but
   most callers still render local Base UI wrappers or legacy dialogs.
3. **Form leaf adapters.** The form store cannot be swapped wholesale. Build
   adapters around individual fresco-ui leaf controls while preserving
   `redux-form` semantics.
4. **Data/list accessibility.** AssetBrowser, Codebook tables, rule previews,
   validation rows, Timeline, and NewStageScreen have interactive row/card
   patterns that would benefit from shared primitives or shared a11y patterns.
5. **Domain boundaries.** ProtocolSummary print layout, TypeEditor business
   rules, Query grammar, geospatial workflows, VariablePicker, and rich-text
   markdown storage are not shared-component replacement targets as systems.
   Replace only their inner primitives where it is safe.

## Candidate Matrix

### Drop-in Or Near Drop-in

| Candidate                  | Current files                                                                                                           | Target                                                      | Recommendation                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Spinner                    | `apps/architect/src/components/Spinner.tsx`, used by `Home/ProtocolLoadingOverlay.tsx` and `Form/Dropzone/Dropzone.tsx` | `@codaco/fresco-ui/Spinner`; `Skeleton` for loading rows    | Replace early. Fresco spinner handles reduced motion; local spinner uses imperative animation.                       |
| Existing unused warnings   | `AssetBrowser/UnusedAssetsAlert.tsx`, `Codebook/UnusedVariablesAlert.tsx`                                               | Already `@codaco/fresco-ui/Alert`                           | Treat as precedent for future status messaging.                                                                      |
| Basic headings/paragraphs  | `ProjectNav/PageHeading.tsx`, Codebook headings, Home copy                                                              | `typography/Heading`, `typography/Paragraph`                | Low logic, but visual scale may shift. Avoid editable `StageHeading` input until a dedicated adapter exists.         |
| Simple button call sites   | `PreviewHost`, `AssignAttributes`, `Query/Rules`, NewStageScreen footer, some ProjectNav actions                        | named `Button`/`IconButton` from `@codaco/fresco-ui/Button` | Use after creating a legacy-API compatibility adapter or explicit color/size mapping.                                |
| Read-only markdown wrapper | `Form/Fields/Markdown.tsx`; used by ProtocolSummary and previews                                                        | `@codaco/fresco-ui/RenderMarkdown`                          | Good candidate, but preserve Architect's local angle-bracket escape behavior. Start outside print-critical surfaces. |

### Adapter Required

| Candidate                   | Current files                                                                                                                                                            | Target                                                            | Adapter shape / risks                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy Button/IconButton    | `lib/legacy-ui/components/Button.tsx`; 44-plus app call sites                                                                                                            | `@codaco/fresco-ui/Button` named exports                          | Map legacy `content`, `small/large`, `filled/text`, color names, and string icons. There is no `@codaco/fresco-ui/IconButton` subpath; import named `IconButton` from `@codaco/fresco-ui/Button`. |
| Legacy Icon                 | `lib/legacy-ui/components/Icon.tsx`; 22-plus direct imports                                                                                                              | lucide icons or `@codaco/fresco-ui/Icon`                          | Replace generic icons with lucide; use fresco `Icon` for shared custom Network Canvas icons. Keep/publish NC-specific art deliberately.                                                           |
| Redux dialogs               | `ducks/modules/dialogs.ts`, `DialogManager.tsx`, `lib/legacy-ui/components/Dialogs.tsx`                                                                                  | `@codaco/fresco-ui/dialogs/Dialog`, `useDialog`, `DialogProvider` | Keep `openDialog().unwrap()` boolean semantics, stable IDs, programmatic close, `canCancel`, and thunk/middleware usage. Render with fresco first; migrate hook-capable callers later.            |
| Controlled local dialogs    | `NewProtocolDialog`, `AssetBrowserWindow`, `AssetBrowser/Preview`, `InlineEditScreen`, `EditableList`, `Query/EditRule`, `NewStageScreen`, `AppErrorBoundary`, `MapView` | `dialogs/Dialog` or `Modal`/`ModalPopup`                          | Local dialog API has `header`, `footer`, `onConfirm`, `onAnimationComplete`, motion props, and section-depth reset. Mapbox dialog waits for animation completion before map init.                 |
| Tooltips                    | `NewComponents/Tooltip.tsx`; ProjectNav, VariablePill, LibraryPanel                                                                                                      | fresco `Tooltip`                                                  | Current API is `content` plus `variant="error"` and wraps children in focusable spans. Use a small compatibility wrapper or extend shared tooltip docs/API.                                       |
| Tabs in Home library        | `Home/LibraryPanel.tsx`                                                                                                                                                  | likely `SegmentedSwitcher`, or extended horizontal `Tabs`         | Fresco `Tabs` is currently vertical rail/tab-array oriented. LibraryPanel needs compact horizontal tabs.                                                                                          |
| Scroll panes                | `ProjectLayout`, `StageEditor`, `Home`, `LibraryPanel`                                                                                                                   | `ScrollArea`                                                      | Preserve saved scroll restoration: consumers need viewport refs, not wrapper refs. Check sticky nav/action bars.                                                                                  |
| Banners                     | `InstallBanner`, `StorageUnavailableBanner`, `ProtocolOpenElsewhereBanner`                                                                                               | `Alert` now, or shared `Banner`/`Callout` later                   | `Alert` has surface/max-width defaults; top strips need full-width action layout. Avoid double live regions.                                                                                      |
| Badges/tags                 | `components/Badge.tsx`, `components/Tag.tsx`, `Codebook/Tag.tsx`, ProtocolSummary badges                                                                                 | `Badge`, `Pill`, or new `ColoredBadge`                            | Current code accepts Network Canvas palette names and protocol/entity semantics. Shared `Badge` variants are too narrow for direct replacement.                                                   |
| Tables                      | `Assets/Table.tsx`, Codebook `Variables.tsx`, static tables                                                                                                              | `Table`, `DataTable`                                              | `Table` is structural; `DataTable` is richer but needs Architect to declare `@tanstack/react-table` because fresco has it as a peer. Preserve sorting and dense layouts.                          |
| AssetBrowser grid           | `AssetBrowser/Assets.tsx`, `AssetBrowser/Asset.tsx`                                                                                                                      | `collection/components/Collection`, `GridLayout`, `ScrollArea`    | Current cards are clickable wrappers with hover-only toolbar. Collection would improve listbox roles, keyboard selection, filtering/sorting, and empty state.                                     |
| EditorLayout surface ladder | `EditorLayout/Section.tsx`, `Row`, `Subsection`                                                                                                                          | `layout/Surface` plus local adapter                               | Preserve sticky side headings, fieldset disabled overlays, responsive horizontal/vertical layout, `SectionDepthContext`, section issues, and toggle confirmation.                                 |
| Form leaves                 | `Text`, `TextArea`, `Search`, simple `Select`, `Toggle`, `Checkbox`, `CheckboxGroup`, `RadioGroup`, `LikertScale`, `VisualAnalogScale`, `Number`                         | `form/fields/*`                                                   | Keep `ValidatedField` and `redux-form`. Adapt `{ input, meta }` to fresco leaf props and keep labels/errors/IssueAnchor. Number needs explicit string-to-number parse/format tests.               |

### Extend fresco-ui Before Migrating

| Gap                           | Why it blocks direct migration                                                                                              | Candidate shared work                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Popover `asChild` composition | Architect's local `PopoverTrigger` composes child and internal handlers/refs more defensively than shared `PopoverTrigger`. | Port/test handler/ref composition in fresco-ui, then remove local wrapper.                                                  |
| Simple tooltip recipe         | Architect uses `<Tooltip content variant>` while fresco exposes compound parts.                                             | Add a documented convenience wrapper or recipe; support warning/error styling if this is broadly useful.                    |
| Compact horizontal tabs       | LibraryPanel's tabs are horizontal and compact; fresco `Tabs` is panel/rail-oriented.                                       | Add horizontal/compact option or use/create a dedicated route/filter tabs component.                                        |
| Dialog slots for Architect    | Local `Dialog` has header/footer slots, `onConfirm`, sizing, animation completion, and section-depth reset.                 | Add needed slots or provide a local adapter around fresco `Dialog`; avoid bloating shared API with Architect-only behavior. |
| Standalone Switch             | fresco exports `form/fields/ToggleField`, not a general non-form switch primitive.                                          | Extract/export a standalone switch if multiple app surfaces need it outside fresco form store.                              |
| ColoredBadge/Tag              | Architect uses arbitrary token colors, swatches, and entity/status encoding.                                                | Add `dynamic`/token-driven shared badge/pill variant or keep protocol-color wrappers local.                                 |
| Banner/Callout                | Top app banners are actionable full-width strips, not exactly `Alert`.                                                      | Add shared `Banner`/`Callout` if this pattern appears outside Architect.                                                    |
| Sortable field row            | `MultiSelect`, `Options`, `OrderedList`, and Timeline repeat motion reorder patterns and lack shared live announcements.    | Consider a `SortableFieldArray`/`RemovableFieldRow` or adapt collection DnD with live-region support.                       |
| Compact/rotated table         | ProtocolSummary `MiniTable` and options tables need print density and rotated cells.                                        | Add a compact key-value table variant only if another app needs it; otherwise keep local.                                   |

### Keep Local For Now

| Surface                                                                | Reason                                                                                                                                                                                    |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `redux-form` store and section forms                                   | Architect depends on `formValueSelector`, `change`, `FieldArray`, nested forms, issue anchors, and codebook side effects. A fresco `Form` store swap is a separate product-scale project. |
| `RichText` editor                                                      | Architect stores markdown strings via Slate/remark-slate. fresco `RichTextEditor` uses TipTap `JSONContent`. Replace read-only markdown first; editor parity is a separate migration.     |
| `DatePicker`                                                           | Architect has full/month/year panels, Luxon range logic, incomplete-state clearing, parent scroll behavior, and blur commit semantics. Not a drop-in fresco date picker.                  |
| `NativeSelect` create flow                                             | Includes create-option state, reserved-name validation, redux-form `untouch`, sorting, and placeholder semantics. Compose inner select only after tests pin these behaviors.              |
| `MultiSelect`, `VariablePicker`, geospatial fields                     | These encode FieldArray behavior, codebook lookup/creation, spotlight search, asset browser flows, API key creation, and Mapbox lifecycle.                                                |
| ProtocolSummary report structure                                       | Print CSS, page sections, break avoidance, compact tables, cover/content pages, and protocol semantics are domain-specific. Replace inner markdown/table/badge primitives cautiously.     |
| Entity/variable displays                                               | `EntityIcon`, `EntityBadge`, `VariablePill`, `VariablePicker`, and Query preview text encode protocol codebook semantics even when they delegate to fresco `Node`.                        |
| TypeEditor, Query grammar, AssignAttributes, StageEditor orchestration | Business rules stay local; target their controls, row actions, markdown, typography, and accessibility affordances.                                                                       |
| `VariableSpotlight`                                                    | Command-palette-like modal with forced render, custom keyboard selection, and creation behavior. Keep until a shared command palette exists.                                              |

## Accessibility And Bug Findings To Track

These are not merely component swaps; they should be explicit tasks if touched:

- `Codebook/Variables.tsx` sorts by mutating the incoming `variables` array
  (`list.sort(...)`). Fix this when migrating the table or sorting logic.
- `Screens/NewStageScreen/Interface.tsx` renders selectable cards as clickable
  `motion.div`s. Use semantic button/list-option behavior or a collection row.
- `Query/Rules/PreviewRule.tsx` uses a `div role="button"` row with a nested raw
  delete button lacking an accessible label. This needs a row-action pattern,
  not a naive nested `Button` swap.
- `Validations/Validation.tsx` uses role/button keyboard wiring for deletion.
  Convert to a real button/icon button.
- Timeline reorder/delete controls need keyboard affordances and live
  announcements. Keep the visual timeline local, but use shared DnD/a11y
  patterns where possible.
- AssetBrowser cards have hover-only toolbars. A collection/listbox model would
  improve keyboard access and empty/filter states.
- The local spinner ignores reduced motion; fresco `Spinner` already handles it.

## Recommended Migration Backlog

### Phase 0 - Confirm Shared Gaps

1. Add/verify fresco-ui `PopoverTrigger asChild` handler/ref composition.
2. Decide whether Tooltip gets a convenience wrapper in fresco-ui or an
   Architect-local compatibility adapter.
3. Decide whether LibraryPanel uses `SegmentedSwitcher`, extended horizontal
   `Tabs`, or stays local for now.
4. Decide whether a standalone shared Switch is needed before replacing app
   switches.

### Phase 1 - Low-Risk Wins

1. Replace Architect `Spinner` with `@codaco/fresco-ui/Spinner`; use `Skeleton`
   for LibraryPanel loading rows if it improves layout stability.
2. Add a small Architect button adapter over `Button`/named `IconButton`; migrate
   one toolbar cluster and one non-toolbar action cluster.
3. Add a markdown read-only wrapper over `RenderMarkdown`, preserving
   angle-bracket escaping; pilot outside print-critical ProtocolSummary pages.
4. Convert simple delete/action affordances to real buttons where the row
   interaction model is already clear.

### Phase 2 - Overlay Consolidation

1. Migrate ProjectNav tooltips, `Issues`, and StageEditor preview-options popover
   after the Popover/Tooltip decisions.
2. Replace Home LibraryPanel row action popover with `DropdownMenu`; preserve row
   click propagation, close behavior, and disabled download state.
3. Normalize easy modals/portals: NavShell drawer, ProtocolLoadingOverlay, and
   MapSelection.
4. Replace `DialogManager` rendering with a Redux-to-fresco adapter while
   preserving IDs, programmatic close, `unwrap()` booleans, and `canCancel`.
5. Migrate controlled dialogs one by one: NewProtocolDialog, AssetBrowser
   dialogs/previews, InlineEditScreen, EditableList, Query/EditRule,
   NewStageScreen, AppErrorBoundary, then MapView with animation-complete tests.

### Phase 3 - Form Leaf Adapters

1. Add adapter tests for `redux-form { input, meta } -> fresco leaf props`.
2. Migrate `Text`, `TextArea`, `Search`, and `Toggle/Switch`.
3. Migrate simple `Select`, preserving `onBlur` on close.
4. Migrate `CheckboxGroup` and `RadioGroup`, pinning typed option values and
   markdown-label behavior.
5. Migrate `Number` only with explicit parse/format tests.
6. Consider `NativeSelect` inner-control composition after tests cover
   create-option, reserved-name validation, placeholder select, and `untouch`.

Leave DatePicker, RichText editor, MultiSelect, BooleanChoice, VariablePicker,
and geospatial controls for dedicated parity projects.

### Phase 4 - Data Display And Collections

1. Migrate static/non-print tables to `Table` primitives first.
2. Evaluate `DataTable` for `Assets/Table.tsx` and Codebook variable tables.
   Add Architect's explicit `@tanstack/react-table` dependency if using it.
3. Consider AssetBrowser `Collection` + `GridLayout` once selection, toolbar,
   filtering/sorting, and empty states are specified.
4. Build/adapt `ColoredBadge`/`Tag` for protocol-color usage.
5. Keep ProtocolSummary print structure local; only migrate inner markdown or
   simple table pieces after visual print checks.

## Verification Per Migration

Every migration PR should include:

- focused component/unit tests for touched behavior;
- `CI=true pnpm --filter @codaco/architect typecheck`;
- `CI=true pnpm --filter @codaco/architect lint`;
- visual checks for Home, the relevant editor surface, and at least one overlay
  if overlays were touched;
- keyboard checks for Tab, Shift+Tab, Enter/Space activation, Escape dismissal,
  focus return, arrow-key movement for composite widgets, and screen-reader
  announcements for reorder/async/state changes where relevant.

Additional targeted tests:

- Redux dialog adapter: stable IDs, programmatic close, `canCancel: false`,
  nested dialogs, and `openDialog().unwrap()` boolean return.
- Form adapters: value/meta mapping, `onBlur`, touched/invalid/error wiring,
  disabled/read-only state, and existing section form tests.
- DataTable/collection migrations: sorting stability, no prop mutation,
  selection keyboard behavior, row action labels, and empty/filter states.
- ProtocolSummary changes: print-media screenshot and page-break inspection.

Changesets are app-only unless the PR modifies `packages/fresco-ui` or
`tooling/tailwind`.
