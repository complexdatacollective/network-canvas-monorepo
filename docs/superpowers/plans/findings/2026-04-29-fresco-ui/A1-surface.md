# A1 — Surface inventory of `components/ui/` in Fresco

Snapshot date: 2026-04-29
Source repo: `~/Projects/fresco-next` (branch `next`, read-only for this task)

## Step 1 — Total file count under `components/ui/`

`find components/ui -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \)` → **233** files.

Notes:

- No `.css` files were found under `components/ui/` — the count is entirely `.ts` / `.tsx`.
- The 233 figure includes `*.stories.tsx`, `__tests__/*.test.{ts,tsx}`, and other co-located test/setup files (e.g. `components/ui/dnd/__tests__/setup.ts`). They are part of the on-disk surface and the plan should decide later which of them ship with the package.

The full enumerated list lives at `/tmp/fresco-ui-files.txt` on the source machine; it is not duplicated here, but a structural breakdown:

- 11 top-level files directly under `components/ui/` (Alert, Button, CloseButton, Icon, IconButton, Label, Link, Pips, ProgressBar, RenderMarkdown, ResizableFlexPanel, RichTextRenderer, ScrollArea, SubmitButton, TimeAgo, Toast plus their `.stories.tsx`).
- Nested feature areas: `collection/` (45 files, ~12 of them tests), `dialogs/` (13 files), `dnd/` (15 files incl. tests + stories), `form/` (large — 95+ files including hooks, store, validation utils and tests), `layout/`, `Modal/`, `typography/`.
- Lower-case filenames `badge.tsx`, `dropdown-menu.tsx`, `popover.tsx`, `skeleton.tsx`, `table.tsx`, `tooltip.tsx`, `button-constants.ts` (shadcn-style); everything else is PascalCase. (Worth flagging only because the plan may want a uniform casing in the published package; not resolving here.)

## Step 2 — External `~/...` imports made by files inside `components/ui/`

`grep -rh "from '~/" components/ui | grep -v "from '~/components/ui" | sort -u` → **25 unique lines**.

Verbatim output (one entry is a multi-line import continuation — see "Surprises / flags"):

```text
} from '~/lib/interviewer/selectors/forms';
} from '~/styles/shared/controlVariants';
import { compose } from '~/utils/cva';
import { compose, cva, cx } from '~/utils/cva';
import { compose, cva, cx, type VariantProps } from '~/utils/cva';
import { compose, cva, type VariantProps } from '~/utils/cva';
import { composeEventHandlers } from '~/utils/composeEventHandlers';
import { cva, cx, type VariantProps } from '~/utils/cva';
import { cva, type VariantProps } from '~/utils/cva';
import { cx } from '~/utils/cva';
import { cx, type VariantProps } from '~/utils/cva';
import { dateOptions } from '~/fresco.config';
import { dropdownItemVariants } from '~/styles/shared/controlVariants';
import { generatePublicId } from '~/utils/generatePublicId';
import { nativeSelectVariants } from '~/styles/shared/controlVariants';
import { scrollParent } from '~/lib/interviewer/utils/scrollParent';
import { type Prettify } from '~/utils/prettify';
import { type VariantProps, cva, cx } from '~/utils/cva';
import { useNodeInteractions } from '~/hooks/useNodeInteractions';
import { useSafeAnimate } from '~/hooks/useSafeAnimate';
import { withNoSSRWrapper } from '~/utils/NoSSRWrapper';
import customIcons from '~/lib/interviewer/components/icons';
import preview from '~/.storybook/preview';
import usePrevious from '~/hooks/usePrevious';
import useResizablePanel from '~/hooks/useResizablePanel';
```

Deduplicated by *target* (collapsing the various `cva` import shapes), the components reach into these external roots:

- `~/utils/cva` — `compose`, `cva`, `cx`, `VariantProps`
- `~/utils/composeEventHandlers`
- `~/utils/generatePublicId`
- `~/utils/prettify` — `Prettify`
- `~/utils/NoSSRWrapper` — `withNoSSRWrapper`
- `~/styles/shared/controlVariants` — `dropdownItemVariants`, `nativeSelectVariants` (+ a multi-line export)
- `~/fresco.config` — `dateOptions`
- `~/hooks/useSafeAnimate`
- `~/hooks/useNodeInteractions`
- `~/hooks/usePrevious`
- `~/hooks/useResizablePanel`
- `~/lib/interviewer/components/icons` (default-exported `customIcons`)
- `~/lib/interviewer/utils/scrollParent` — `scrollParent`
- `~/lib/interviewer/selectors/forms` (multi-line import; concrete imported names not visible in this single line — see flags)
- `~/.storybook/preview` (story-only)

## Step 3 — Files in Fresco that import from `~/components/ui/...`

`grep -rln "from '~/components/ui" --include='*.ts' --include='*.tsx'` → **286** files.

A 30-row representative random sample (paths repo-relative to `fresco-next/`):

```text
app/(blobs)/(setup)/_components/Sidebar.tsx
app/(blobs)/(setup)/_components/SignUpForm.tsx
app/(blobs)/expired/page.tsx
app/(interview)/interview/_components/ErrorMessage.tsx
app/dashboard/interviews/_components/ExportOptionsView.tsx
app/dashboard/protocols/page.tsx
app/dashboard/settings/_components/ApiTokensSection.tsx
app/dashboard/settings/ReadOnlyEnvAlert.tsx
components/ActionError.tsx
components/settings/SettingsNavigation.tsx
components/ui/collection/components/CollectionSortSelect.tsx
components/ui/Colors.stories.tsx
components/ui/dialogs/ControlledDialog.stories.tsx
components/ui/dialogs/DialogTrigger.tsx
components/ui/dnd/stories/DragSource.stories.tsx
components/ui/form/components/Field/Field.tsx
components/ui/form/components/fields/Boolean.stories.tsx
components/ui/form/components/fields/RadioGroup.tsx
components/ui/form/components/fields/RichSelectGroup.tsx
components/ui/form/components/ProtocolSchemas.stories.tsx
components/ui/form/validation/helpers.tsx
components/ui/RichTextRenderer.stories.tsx
components/VersionSection.tsx
lib/interviewer/components/PassphrasePrompter.tsx
lib/interviewer/Interfaces/CategoricalBin/components/BinSummary.tsx
lib/interviewer/Interfaces/FamilyPedigree/components/quickStartWizard/AdditionalParentsStep.tsx
lib/interviewer/Interfaces/FamilyPedigree/components/quickStartWizard/ParentPartnershipsStep.tsx
lib/interviewer/Interfaces/FamilyPedigree/components/wizards/DefineParentsWizard.tsx
lib/interviewer/Interfaces/NameGenerator/components/ExternalNodeItem.tsx
lib/interviewer/Interfaces/NameGeneratorRoster/DropOverlay.tsx
```

Importer distribution (rough count by top-level directory, derived from `/tmp/importers.txt`):

- `app/` — Next.js routes, dashboard, interview, blobs (setup/auth) — many files.
- `components/` — sibling components and re-using siblings within `components/ui/` itself.
- `lib/interviewer/` — large consumer (Interfaces, components, panels).
- `lib/form/` — also imports several `~/components/ui/form/...` paths.
- `tests/`, `.storybook/` — story shells and a few test-specific consumers.

## Step 4 — Deduplicated public-API import inventory

`grep -rh "from '~/components/ui" --include='*.ts' --include='*.tsx' | sed -E "s|.*from '~/components/ui/([^']+)'.*|\\1|" | sort -u` → **85** distinct subpaths.

Saved verbatim to the sibling file `A1-public-imports.txt`. Embedded inline below for ease of review:

```text
Alert
badge
Button
CloseButton
collection/components/Collection
collection/components/CollectionFilterInput
collection/components/CollectionSortButton
collection/dnd/useDragAndDrop
collection/layout/InlineGridLayout
collection/layout/ListLayout
collection/sorting/types
collection/types
dialogs/Dialog
dialogs/DialogProvider
dialogs/useDialog
dialogs/useWizard
dnd
dnd/types
dnd/useAccessibilityAnnouncements
dnd/useDragSource
dnd/useDropTarget
dnd/utils
dropdown-menu
form/components/Field/Field
form/components/Field/types
form/components/Field/UnconnectedField
form/components/FieldGroup
form/components/FieldLabel
form/components/FieldNamespace
form/components/fields/ArrayField/ArrayField
form/components/fields/Boolean
form/components/fields/Checkbox
form/components/fields/CheckboxGroup
form/components/fields/Combobox/Combobox
form/components/fields/Combobox/shared
form/components/fields/DatePicker
form/components/fields/getPasswordStrength
form/components/fields/InputField
form/components/fields/PasswordField
form/components/fields/RadioGroup
form/components/fields/RichSelectGroup
form/components/fields/RichTextEditor
form/components/fields/SegmentedCodeField
form/components/fields/Select/Native
form/components/fields/Select/Styled
form/components/fields/TextArea
form/components/fields/ToggleField
form/components/fields/ToggleFieldSkeleton
form/components/Form
form/components/SubmitButton
form/hooks/useField
form/hooks/useFormState
form/hooks/useFormStore
form/hooks/useFormValue
form/hooks/useProtocolForm
form/store/formStoreProvider
form/store/types
form/utils/focusFirstError
form/utils/getInputState
Icon
Label
layout/ResponsiveContainer
layout/Surface
Link
Modal/Modal
Modal/ModalPopup
Node
Pips
popover
ProgressBar
RenderMarkdown
ResizableFlexPanel
RichTextRenderer
ScrollArea
skeleton
Spinner
SubmitButton
table
TimeAgo
Toast
tooltip
typography/Heading
typography/PageHeader
typography/Paragraph
typography/UnorderedList
```

## Surprises / flags

Recorded factually, no proposed solutions — later tasks will resolve.

1. **Multi-line import continuation in Step 2 output.** The line `} from '~/lib/interviewer/selectors/forms';` is the closing line of a multi-line `import { … }` statement (the `grep -h` only sees the line that matches `from '~/`). The originating file is `components/ui/form/hooks/useProtocolForm.tsx` (line 12). The full set of imported names from that selectors module is therefore not visible in the inventory above; resolving the package surface will require reading that file directly.
2. **Two `components/ui/...` files reach back into `~/lib/interviewer/...`** — a circular-feeling dependency that may complicate extraction:
   - `components/ui/Icon.tsx` and `components/ui/Icon.stories.tsx` both `import customIcons from '~/lib/interviewer/components/icons'`.
   - `components/ui/form/utils/focusFirstError.ts` imports `scrollParent` from `~/lib/interviewer/utils/scrollParent`.
   - `components/ui/form/hooks/useProtocolForm.tsx` imports from `~/lib/interviewer/selectors/forms` (see flag 1).
3. **App-specific config import.** `components/ui/TimeAgo.tsx` imports `dateOptions` from `~/fresco.config`. That config is Fresco-application-level, not generic UI.
4. **Storybook preview import inside the surface.** `components/ui/collection/stories/Collection.stories.tsx` imports the Fresco-specific `~/.storybook/preview`. (Story file only, but worth noting if stories ship with the package.)
5. **Custom hooks imported from outside the `ui` tree.** `useSafeAnimate`, `useNodeInteractions`, `usePrevious`, `useResizablePanel` all live in `~/hooks/...` and are pulled in by `Node.tsx`, `Modal/ModalPopup.tsx`, `ResizableFlexPanel.tsx`, and `collection/hooks/useStaggerAnimation.ts`.
6. **Co-located tests and stories inflate the file count.** Of the 233 files, a substantial fraction are `*.stories.tsx` and `__tests__/*.test.{ts,tsx}`. Whether they ship with the package is a packaging decision (out of scope here).
7. **Casing inconsistency.** Mixture of PascalCase (`Button.tsx`) and lowercase (`badge.tsx`, `dropdown-menu.tsx`, `popover.tsx`, `skeleton.tsx`, `table.tsx`, `tooltip.tsx`, `button-constants.ts`) — generally aligns with which components were generated from shadcn/ui vs. authored locally.
8. **Self-importers.** 17 of the 286 importing files live inside `components/ui/` itself (i.e., UI components importing from sibling UI subpaths). They are still counted in the importer total because they appear in the rg output.
9. **Importers in lower-cased `~/lib/form/`.** A handful of files in `lib/form/components/...` (separate from `components/ui/form/`) consume `~/components/ui/...`. That coexistence (a `lib/form/` and a `components/ui/form/`) may be worth a follow-up note in a later task.
