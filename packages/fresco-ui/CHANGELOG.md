# @codaco/fresco-ui

## 4.1.1

### Patch Changes

- 677a449: Make app update controls wait for service-worker activation, reload reliably, show progress or retry feedback, and improve the update dialogs' version, release-note, and action hierarchy.
- e61f5ad: Improve table headers by removing default vertical padding and alignment, with an example for wrapping long labels.
- ae8d7e1: The `menu-sociogram` icon now honours the `--icon-tone-primary` and `--icon-tone-secondary` custom properties, so consumers can recolour it. It previously hardcoded platinum fills, which silently ignored any tone override. The default appearance is unchanged.

## 4.1.0

### Minor Changes

- 1172a44: Add a reusable, accessible colour-theme switcher for public-site navigation.
  Hosts can provide their own theme persistence and translated labels while using
  the same light, dark, and system-mode picker.

### Patch Changes

- a6d037a: Add a shared storage-risk banner that maps high, medium, and low data-loss risk
  to matching alert and action intents, plus a white-background inverted button
  variant for actions on intent-colored surfaces.
- fc7e279: Show a numeric keyboard on iOS and Android when InputField uses type="number".

## 4.0.0

### Major Changes

- 179952e: Add canonical localized site navigation and footer components, a shared animated link treatment for anchors, footer links, and link-style buttons, a canonical default text color, plus a shared public-site locale definition for edge routing and translation coverage.

### Minor Changes

- 7ca17f5: Extend ArrayField with item indexes, item limits, stable controlled identities, interaction guards, and an accessible keyboard reorder handle.
- 9b57c1d: Add an `appearance` prop (`solid` | `soft`) and an `accent` variant to `Alert`. `solid` (the default, unchanged) fills the alert with its intent colour; `soft` renders a low tint over the surface with surface text and an intent-coloured link, for quieter content-adjacent notices, and drops the pressed-in inset shadow so it reads flat. Role, aria-live, screen-reader label and icon are identical across appearances. The new `accent` variant is a non-semantic brand highlight for note/key-concept style callouts.
- 436e04c: SiteNavigation accepts `site="external"` for non-Network-Canvas hosts (every destination renders as an absolute URL) and portals its desktop menus into the `PortalContainerProvider` container when one is present, so embedders can keep popups inside their own DOM scope (e.g. a shadow root).
- c236b20: Add semantic dialog sizes with responsive container-based layout, readable descriptions, and a className escape hatch for exceptional sizing.
- 807f0d4: Enhance Alert with illustrated default intent icons, viewport attention motion, and a compact density for banner layouts.
- 452549c: Add a compound `Tabs` component (Base UI-backed vertical tabs: import `Tabs` and `TabsPanel`; the rail is driven by a `tabs` array and renders its own active indicator).

  Add a reusable "glass" control treatment — a new `control-glass` utility and `--control-border-width` token in the Tailwind config — exposed as a Button `glass` variant and a `SegmentedSwitcher` `variant` prop (`'outline'` default, `'glass'` opt-in). `SegmentedSwitcher` now defaults to an outline-button treatment, gains an `xl` size, and has its outer height and active-pill radius harmonised with Button.

  `BaseField`'s inline layout is now driven by a container query rather than a viewport breakpoint, and `Table`'s `bodyScroll` region suppresses overscroll chaining (no rubber-band).

  `InputField` now applies the caller's `className` to the field wrapper only, not to the inner `<input>` — so a background/backdrop passed to the field no longer double-applies onto the input.

- 2280a15: Add a `Pill` component and an `AppUpdateIndicator` (with the `useAppUpdate` hook) for surfacing app version and update state with a changelog dialog.
- 2100c9c: Allow dialogs to receive inline styles for shared-layout animation geometry.
- 5e1d565: Add a `component` segment type to `SegmentedToolbar` for rendering composite controls such as `SplitButton` inside the toolbar surface.
- ed95edc: Add Architect Classic and Interviewer Classic to the shared site navigation and arrange the software destinations in a two-row grid that distinguishes Classic apps.
- 36ba214: Add a `SplitButton` component with a Button-compatible main action API, a required split segment, and nested popover content props.
- 9b925e9: Add theme color support to Badge via a typed `color` prop.

### Patch Changes

- 4d9658b: Fix `BooleanField` so its two options stack vertically instead of overflowing when the container is too narrow to show them side by side.
- e5fcd5e: Use full intent colors for elevated alerts instead of pastel background tints.
- 2b12bdc: Boolean fields now lay their options out side by side whenever they fit, wrapping to a stacked layout only when the container is genuinely too narrow for them. This fixes the Dyad Census interface stacking its Yes/No choices vertically even when there was room to show them side by side.
- be60ee0: Restore proportional Lucide icon sizing for shared controls so interview navigation and map controls match established visual snapshots.
- ef1c4b4: Fix invalid Tailwind utility classes that silently rendered nothing: the Spinner's
  backface-visibility (now `backface-hidden`), and the encrypted background's 3D
  transform (`transform-3d`) and monospace font (`font-monospace`).
- 2c112ba: Improve Popover, DropdownMenu, and Tooltip arrow positioning so overlay borders remain continuous around rounded corners.
- 5c269b3: Alert: the icon in `compact`-density alerts is now vertically centred against the
  message text instead of top-aligned, so single-paragraph banners read correctly
  when their text wraps. Default-density alerts keep their top alignment.
- c6f2ad4: ArrayField now exposes each item's committed index (its position in the last committed value) to item renderers alongside the live preview index, so adapters that bind index-based field paths to a form store can keep those paths attached to the right item while a pointer reorder is only previewed. Keyboard reordering also retains focus on the drag handle after a move commits, so repeated arrow-key presses keep working instead of dropping focus to the document body. The "add item" button is now a primary button so it reads consistently across every list editor.

  InputField's number variant no longer lets its +/- steppers shrink, and its middle padding scales down at `size="sm"`, so a narrow number field (e.g. a compact threshold input) keeps its value visible instead of collapsing to zero width.

  The Field system (`Field`, `UnconnectedField`, and the underlying `BaseField`) gains an opt-in `labelHidden` prop that visually hides a field's label while keeping it as the control's accessible name — for use when a surrounding heading already names the field, so the redundant visible label is dropped without stripping the screen-reader name.

- 1d19a1b: The rich text editor no longer drops characters when you type quickly.

  The native `SelectField` now shows a placeholder option when the value matches no option, so picking the first option fires a change event.

  The `DataTable` sort arrow stays visible on the active column header, and `ArrayFieldDragHandle` accepts an optional `size` prop.

- c1cf1fa: Ensure `Heading` margin variants reset native and app-level heading margins so marginless dialog titles do not inherit top spacing.
- 617c1b9: Allow native scroll chaining through `ScrollArea` and `Collection` at scroll boundaries by removing forced overscroll containment.
- 628c018: Give SegmentedToolbar a balanced effect shadow so floating toolbars read with clear, restrained elevation. Allow dialogs to expand to fit wider content within the viewport, and let RichTextEditor toolbars contribute their full width so editing fields do not visually overflow their dialog surface.
- ce9b549: Add a header-end slot to Tabs so top-aligned tab rails can share a row with supplementary controls or metadata, and use a compact default gap between top tabs and their panel content.
- 486f928: Fix two Collection bugs surfaced by the interview e2e suite. `useSelectionState`
  now clears `disabledKeys` when the prop changes to an empty or undefined set, so
  cards re-enable once a consumer stops gating them (previously the stale disabled
  set persisted forever). `useMeasureItems` now re-measures after a completed
  measurement is invalidated by a collection/layout identity change that lands in
  the same commit as the recovery pass — the reset path bumps the measurement
  version so the effect re-runs, preventing the virtualized list from wedging at
  zero rows (`totalHeight: 0`) after a burst of store updates.
- e4c3d5f: Forward the redux-form field name onto the field wrapper as a `data-field-name` attribute (for reliable end-to-end targeting). The name continues to be passed to the inner field component, so no existing behaviour changes.
- 9336312: Updated the Tiptap React and nanoid dependencies used by Fresco UI components.
- ef02898: Add data-testid hooks to SegmentedCodeField (`segmented-code-${name}` on the fieldset) and Toast.Viewport (`toast-viewport`) to support locators in the Interviewer end-to-end test suite. No user-facing behaviour change.
- 5e2efc3: Fix a form-store race where a field's in-flight async validation, superseded by a sibling field's value change, was silently dropped and never rescheduled. The field (and therefore the whole form) stayed invalid with no visible error until the next full form validation. `setFieldValue` now revalidates superseded sibling validations against the updated form values, while stale results from the pre-change snapshot are still discarded.
- 6a3f5db: Add a shared app-start helper for applying a waiting service-worker update before the app mounts, with timeout fallbacks so offline launches continue.
- fd46cd0: Allow Heading and Paragraph to render without creating client component boundaries, support custom option and selected-value rendering in Combobox, and add an extensible shared site navigation shell.
- 2872951: Make the Links icon honor icon tone variables so consumers can apply protocol colors.
- 3a8689f: Keep controlled number inputs in sync when they are stepped with the ArrowUp and ArrowDown keys, while leaving step-any inputs unstepped.
- 31eacf4: Harden form fields and ArrayField operations with typed values, stable async validation, complete error state, accessible required descriptions, and metadata-safe semantic array mutations.
- a37d0a2: Give soft alerts correctly tinted elevation shadows, replace the default success symbol with an illustrated Fresco check badge, and prevent delayed dialog cleanup after the provider unmounts.
- bfc4303: Keep filled segmented-toolbar actions in their supplied color when hovered.
- 9d71015: Fix shared rich text editor link controls, toolbar affordances, and input-mode content updates.
- b467615: Add forward skip destinations to schema 8, shared skip evaluation, synthetic
  network generation, and the interview runtime. Hidden stages can now continue
  at a later stage or route to the interview finish screen, with live route
  recalculation, safe Back navigation, and confirmed one-screen overrides for
  unavailable stages.

  Also keep shared Select fields correctly labelled and contained when option
  labels are long. The bundled sample protocol now ends the interview when a
  participant declines consent.

- ebdd094: Derive default surface colors from the page background and align table headers to the bottom.
- Updated dependencies [83dddd8]
- Updated dependencies [452549c]
- Updated dependencies [c16a1d9]
- Updated dependencies [179952e]
- Updated dependencies [a37d0a2]
- Updated dependencies [5c269b3]
- Updated dependencies [ebdd094]
  - @codaco/tailwind-config@1.1.0
  - @codaco/shared-consts@5.5.0

## 3.0.1

### Patch Changes

- b3da854: Add `closeAllDialogs()` to the `DialogProvider` context. It dismisses every open dialog at once, resolving each pending promise with `null` (the cancel value) — for dismissing dialogs on a global state change such as an auth lock, so a destructive confirm can't survive it.

## 3.0.0

### Major Changes

- 735fb6e: Surface now derives its visual level from nesting instead of taking a manual `level` prop.

  Breaking changes:

  - The `level` prop is removed from `Surface`/`MotionSurface`. Each Surface renders one step above the Surface it is mounted inside (via React context, so portalled overlays keep their component-tree position). Depths beyond the token scale clamp to level 3 and warn in development. Remove `level={0..3}` from call sites; if the derived result looks wrong, restructure the layout rather than overriding.
  - The `'popover'` level is replaced by a new orthogonal `floating` prop, which applies the popover surface treatment at any depth and restarts the depth ladder for children. Replace `level="popover"` with `floating`.
  - `surfaceVariants`' color axis is now `{ depth, floating }`; `depth` is supplied internally by the Surface component and there is no default, so class-level consumers only use `floating`.
  - `DataTable` no longer accepts `surfaceLevel`; its table surface derives from context.
  - A new `SurfaceDepthReset` export restarts the ladder for floating chrome styled via classes rather than a rendered `<Surface floating>` (used by `DialogPopup`).
  - Surface exposes its derived depth to descendants as the `--surface-depth` CSS variable.

### Minor Changes

- 38de563: Allow a `Dialog` / wizard-step `title` to be any `ReactNode`, not just a string.
  This lets a wizard step render a live title — for example one that reflects a
  choice made in an earlier step. Existing string titles are unaffected.
- 5869464: `ListLayout` now accepts an `orientation` option. `'horizontal'` lays items out
  in a single row and navigates with Left/Right (via a new `RowKeyboardDelegate`);
  `'vertical'` (the default) is unchanged. Intended for short, non-virtualized
  collections such as a horizontal timeline/filmstrip.

  `Collection`'s `filterFuseOptions` now accepts `includeScore`. Setting it to
  `false` keeps filtered results in their original collection order instead of
  re-sorting them by match relevance.

  Fixed keyboard focus after filtering: when the focused item is filtered out,
  focus (and `aria-activedescendant`) now moves to the first remaining result
  instead of pointing at a hidden row, so filtered results can be reached and
  selected with the keyboard.

- 0f577dd: Add the **Network Composer** stage type — a free-form, single-screen, promptless
  canvas for building a whole personal network in one place (create nodes, draw
  multiple edge types, capture node and edge attributes, group nodes into convex
  hulls, reposition, and delete, with undo/redo and lasso selection).

  - `@codaco/protocol-validation`: a new additive schema-8 `NetworkComposer` stage
    (no version bump, no migration) with cross-reference validation of its
    `quickAdd` / `layoutVariable` / `nodeForm` / per-edge-type form references, and
    a `superRefine` check rejecting duplicate edge subject types (edge types and
    node attributes are both optional). Automatic layout uses the shared flat
    `behaviours.automaticLayout` boolean (as the Sociogram and Narrative do); for
    NetworkComposer it is only the starting default. An optional
    `convexHullVariable` names a single categorical node variable whose values are
    drawn as convex-hull groups.
  - `@codaco/interview`: the `NetworkComposer` runtime interface, reusing the shared
    canvas, edge layer, and force-directed auto-layout engine. Nodes are added by
    name from a field in the tool palette and laid out on a grid; in edge mode the
    first node tapped enters a linking state and the edge tool adopts that edge
    type's colour. Selecting a node or edge opens a resizable, backdrop-less
    right-hand drawer that leaves the canvas interactive; it edits the entity's
    attribute form (saving valid edits automatically, with no Save button) or shows
    an empty state when there is nothing to edit. When a `convexHullVariable` is
    configured its hulls are always drawn (reusing the Narrative hull layer), and
    group membership feeds the layout's group-cohesion force so same-group nodes
    cluster under automatic layout. Nodes are grouped with the Groups tool (pick a
    group in its popover, tap nodes to toggle membership) or by lasso-selecting in
    select mode and choosing which group to add the selection to. Automatic layout
    is an interview-time toggle whose live value is persisted in stage metadata, so
    the participant's choice sticks across navigation; Architect only sets its
    default.
  - `@codaco/shared-consts`: a `NetworkComposer` stage-metadata shape storing the
    participant's automatic-layout choice.
  - `@codaco/fresco-ui`: the `SegmentedToolbar` gains a `menu` segment (a button
    that opens a single-select menu) and a `popover` segment (a pressed-able button
    that anchors arbitrary popover content), and a vertical toolbar now opens its
    tooltips, menus, and popovers to the right (into the canvas); `Popover` accepts
    a `side` prop.
  - `@codaco/interview`: the NetworkComposer tool palette is built from the shared
    `SegmentedToolbar` — a Select tool, an Add-node button whose popover holds the
    name field, an edge tool that opens a menu of edge types, an automatic-layout
    toggle, and undo/redo.

- 8439757: Add a `suppressPasswordManager` prop to `PasswordField`. When set, the masked
  value renders as a text input using `-webkit-text-security` instead of
  `type="password"`, so browser password managers never treat it as a website
  credential — no save prompts, no username association, no autofill. Intended
  for app-internal secrets (device PINs, vault passphrases). Falls back to a
  real password input where the CSS property is unsupported (e.g. Firefox).
- ebaa737: Add a `reverse` prop to `ResizableFlexPanel`. When set, the resized (first) pane
  is pinned to the end of the axis (right for horizontal, bottom for vertical) and
  the drag direction is inverted to match, so a size-constrained panel can sit on
  the right/bottom edge while the second pane fills — and scrolls — the remaining
  space. Combine with `minSizePx` to give that edge panel a hard minimum size.
- 617a920: Make `VisualAnalogScale` and `LikertScale` labels responsive so they stay
  readable and on-screen when space is tight. Likert labels now follow a measured
  three-tier ladder — wrap (never clipping), then clockwise-rotated labels centred
  on each tick, then end anchors only — escalating as far as the available width
  and vertical budget require. Both fields gain a transient value popover that
  rides the thumb during adjustment (the current option label for Likert, the
  value for VAS). Adds an optional `maxLabelHeight` prop to `LikertScale` to
  override the viewport-derived vertical budget.
- f551a2e: Add `SegmentedSwitcher`: an exclusive single-select segmented control built on Base UI `ToggleGroup`, with an animated sliding active-indicator, a `size` prop (`sm`/`md`/`lg`), and a per-segment `render` escape hatch (e.g. to render a segment as a link).
- 79ccead: Add `SegmentedToolbar`: a config-driven, accessible (`Surface`-backed) toolbar of button / toggle / exclusive-group / separator segments, built on the shared `Button` component. Each segment supports an icon, text, or both, and an optional `className` (e.g. for named theme colours like `bg-tomato text-white`). A button segment can also be hosted inside a caller-supplied element (`render`) — e.g. a Popover or Menu trigger — so its overlay wiring composes with the toolbar button and its roving focus. The toolbar offers enter/exit animation, horizontal or vertical orientation, and an optional draggable handle (with keyboard repositioning).

### Patch Changes

- 97b0ef4: Fix the empty DatePicker's hint text rendering with a greenish tint in
  Safari on dark backgrounds: WebKit repaints the empty day/month/year
  sub-fields with its own contrast-adjusted color unless
  `-webkit-text-fill-color` pins them. Blink already honoured the `color`
  property, so Chrome is unchanged.
- 5b06420: Fix `ResizableFlexPanel` so the first pane honours its flex-basis even when its
  content has a larger intrinsic size. Without a `0` main-axis minimum, wide (or
  tall) content set `min-width/height: auto` and overrode the basis, which also
  capped how far the resize handle could grow the other pane.
- 65b55f9: Fix the styled Select trigger so a long selected value truncates with an
  ellipsis instead of overflowing its container. The value already used
  `truncate`, but without `min-w-0` the flex item could not shrink below its
  content width, so long labels spilled past narrow triggers.

## 2.14.0

### Minor Changes

- 4821edc: Make a form field a single unit of focus.

  - **Container-scoped validation**: validate-on-blur now fires when focus leaves the whole field, not the inner `<input>`. Moving focus to an in-field control (a prefix/suffix button, a number stepper, a sibling radio…) no longer counts as leaving the field, so it no longer leaves a stale validation error (e.g. a "Generate identifier" button populating a field that still showed "cannot be empty"). Single-control fields behave identically; multi-control fields (RadioGroup, Combobox, DatePicker…) get strictly better behaviour.
  - **Focus indication**: slot controls stay real tab stops and render their own design-system focus ring (`Button`/`IconButton` already do); the field shows one ring per focused element rather than double-ringing the wrapper around an already-focused control. The `InputField` wrapper also un-clips (`overflow-visible`) while a slot control is focus-visible, so the control's offset focus ring isn't clipped by the rounded container.
  - **Slot field controller**: `InputField`'s `prefixComponent`/`suffixComponent` now also accept a render function `(field) => ReactNode` that receives a `FieldSlotController` (`{ name, value, setValue, validate, focusInput }`), so a slot control can set and validate the value without importing the form store. Delivered via the new `useFieldController` hook / `FieldController` context. The plain `ReactNode` form is unchanged.
  - **Escape hatch**: `validateOnControlBlur` on `Field` restores validation when focus moves to an in-field control.

  Slot controls remain real tab stops with native button semantics.

### Patch Changes

- dd13556: Fix form-field schema-conformance bugs found in a release audit:

  - Render VisualAnalogScale on the normalized 0–1 scale (matching the contract) instead of 0–100.
  - Preserve typed (number/boolean) RadioGroup option values instead of stringifying them.
  - Respect configured month/year `min`/`max` bounds in DatePicker (accept partial `YYYY` / `YYYY-MM` resolutions).
  - Short-circuit optional `minValue`/`minLength`/`minSelected` validators on empty fields (so `required` owns emptiness) and treat a `0` max bound as a real bound.
  - Source cross-variable comparison validators (`greaterThanVariable`/`sameAs`/etc.) from persisted entity attributes when the referenced variable is not a field on the current form.

  Further fixes from the medium/low conformance audit:

  - `unique` validation compares categorical/ordinal selections as order-insensitive multisets, so the same options chosen in a different order are correctly treated as duplicates.
  - The Collection sorter gains `hierarchy` (ordinal) and `categorical` sort modes that order by codebook option index; the `sortRules` prop now seeds the initial sort in uncontrolled mode, and `CollectionSortButton` / `CollectionSortSelect` carry the ranked option order so button-driven sorts rank correctly too.

- d3481c5: Fix diamond-shaped nodes rendering with an offset visual center. The diamond's `rotate`/`scale` was applied to the Node's root element, where it composed with inline `transform` positioning (sociogram centering) and motion layout projection — shifting edge endpoints away from the node center, making dragged nodes jump under the cursor, and breaking layout animations (OneToManyDyadCensus, NodeDrawer). The shape transform now lives on an inner background layer, keeping the root element transform-free.
- 164c2dc: Fix `RichSelectGroup` option cards not filling the container width when a `horizontal` group wraps onto multiple lines. Wrapped cards now `grow` to the full width of their line, so every option reaches the container edge regardless of how long its description is. Cards that share a line in a content-sized group are unaffected.
- d0ca1be: Fix two NameGeneratorRoster bugs and remove a dead schema field.
  - **Roster cards no longer show a raw UID.** When the name heuristic could not
    resolve a label for an external-roster node (e.g. the asset came from a
    preview interview export whose attribute keys are variable UUIDs absent from
    the running codebook, or the subject has no populated text variable), the
    card title fell back to the node's content-hash `_uid` — an opaque "random
    ID". The new `resolveRosterNodeLabel` falls back to the first usable
    attribute value, then to a stable `Unnamed {subject} {n}` placeholder.
  - **DataCards shrink to fit narrow panels.** `GridLayout`'s
    `repeat(auto-fill, minmax(Npx, 1fr))` forced columns to at least `minItemWidth`
    even in a narrower container, so a single roster card overflowed its panel at
    the default resizable width (observed on iPad), breaking drag-and-drop. The
    column floor is now `min(Npx, 100%)` so a lone column shrinks to fit.
  - **The roster panel can't be resized narrower than a card.** `ResizableFlexPanel`
    gains an optional `minSizePx` (a hard pixel floor for the first panel, enforced
    by the resize hook and a CSS backstop). NameGeneratorRoster sets it to the card
    width plus chrome, so the resize handle stops before a card would overflow.
  - **Removed the unused `cardOptions.displayLabel`.** It was introduced in the v8
    schema but was never read by any application (legacy or current) and cannot be
    set in Architect. Dropped from the schema, the `protocol-utilities` types, and
    the `SyntheticInterview` builder.

## 2.13.0

### Minor Changes

- 1a6d441: Add `warning` intent variant to dialogs. Warning dialogs use an amber accent
  and auto-focus the cancel button (same as `destructive`), making them suitable
  for discouraged-but-not-destructive actions. The `confirmCancel` option on
  `WizardDialog` now accepts an optional `intent` field (defaults to `default`).

## 2.12.2

### Patch Changes

- 02c4314: Fix `focusFirstError` stealing focus after a failed form submission. The 800ms
  scroll fallback was never cancelled when `scrollend` fired (focusing the field
  twice), and the deferred focus ran unconditionally — yanking focus back to the
  first errored field even when the user had since clicked into another control.
  The fallback timer is now cancelled by the `scrollend` path, and the deferred
  focus is skipped when focus has moved since invocation.

## 2.12.1

### Patch Changes

- `RadioMatrixField`: untouched rows that have neither an answer nor a configured `defaultOption` are now omitted from the emitted value instead of being serialized with an empty-string value.

## 2.12.0

### Minor Changes

- New `RadioMatrixField` at `./form/fields/RadioMatrixField`: a form field that asks the same single-choice question across many rows, laid out as a matrix (rows × shared option columns). Each row is an independent radio group; the field value is an array of `{ id, value }` entries, with an optional `defaultOption` pre-selected for unanswered rows. It uses the standard input-control container and collapses to stacked per-row groups on narrow containers. `RadioItem` gains optional `className` / `labelClassName` props so callers can place a bare radio in a grid cell.

  Field rendering tweaks:

  - `BaseField` now uses a uniform `not-last:mb-8` bottom margin between fields instead of ramping the gap up on larger screens (`tablet-landscape:not-last:mb-8`, `desktop:not-last:mb-10`), giving form fields a consistent vertical rhythm across all breakpoints.
  - `Label` no longer carries the heading `label` variant's default bottom margin (`margin: 'none'`), so field labels sit tighter to their control.
  - `InputField` number steppers now use a subtle contrast-tinted hover (`hover:bg-input-contrast/10`) instead of switching to the accent color.

  `DropdownMenuContent` now renders the same pointer arrow as `Popover`. It gained a `showArrow` prop (defaulting to `true`) that draws the shared `ArrowSvg` with per-side rotation, and its default `sideOffset` increased from `4` to `10` so the arrow clears the trigger.

### Patch Changes

- `useField`: a field with an `initialValue` can now be cleared. The value passed to the field component was computed as `fieldState?.value ?? initialValue`, which re-applied the `initialValue` whenever the stored value was `undefined` — so calling `setFieldValue(name, undefined)` (or otherwise clearing the field) left the component still showing the initial value. The fallback to `initialValue` now applies only before the field is registered; once registered, the stored value (including an explicit `undefined`) is honoured.

- `RadioGroupField`: respect a per-option `disabled` flag even when the field itself is not disabled. The per-option disabled state was computed with `disabled ?? option.disabled`, which discarded `option.disabled` whenever the field passed an explicit `disabled={false}` (the normal case via `useField`), so individual options could never be disabled.

## 2.11.0

### Minor Changes

- New `DataTable` component family at `./DataTable`: `DataTable`, `ColumnHeader`, `DataTableFacetedFilter`, `DataTableFloatingBar`, `DataTablePagination`, `DataTableSkeleton`, `DataTableToolbar`, `SelectAllHeader`, plus filter helpers. Built on `@tanstack/react-table` with built-in pagination, sorting, faceted filters, row selection, and a floating bulk-action bar. Ports the prior `interviewer-v7` DataView implementation up into the shared component library.

- `WizardDialog` accepts an optional `cancelLabel` prop so consumers can override the default cancel-button copy (used by `interviewer-v7`'s setup wizard for "Continue without security").

- `Dialog` accepts a `dismissible` prop (default `true`) that controls whether the close button renders and whether outside-clicks/Esc dismiss the dialog. `Modal` no longer passes the prop through — gating happens locally inside `Dialog`. Used by `interviewer-v7`'s `LockScreen` to require explicit unlock before the dialog can close.

- `SegmentedCodeField` gains a `sensitive` prop that masks character display (suitable for PIN entry).

- `SegmentedCodeField` forwards `autoFocus` to its first segment using the shared `focusable` utility, so wizard steps can autofocus into PIN entry.

### Patch Changes

- `openDialog` defers its internal `flushSync` to a microtask so callers can invoke `openDialog` from inside `useEffect` (previously threw the "flushSync cannot be called from inside a lifecycle method" error).

- `Alert` icon alignment refined and the alert region announces correctly to assistive tech via a proper live-region role.

- `FormErrors` now renders via the `Alert` component for visual and semantic consistency with the rest of the form layer.

- `Combobox` list spacing fix; empty-state color switched to a neutral foreground token.

- Zod `GlobalMeta` augmentation repaired (the `.hint` field now actually propagates), and `collectNetworkValues` tightened.

- Type assertions stripped by `oxlint --fix` were restored where soundness required them.

- Internal: `Modal/Modal.tsx` renamed to `Modal/index.tsx`. `popover` Surface variant drops its `--focus-color` override (now inherited from the surrounding theme). New Storybook coverage for the elevation/inset-surface/motion-spring plugins and a `ServerSideValidation` Form demo.

## 2.10.2

### Patch Changes

- Fix `Dialog`'s `accent` override and `Alert`'s variant link color. Both were setting `--color-*` aliases (`--color-primary`, `--color-primary-contrast`, `--color-link`), but those aliases are declared inside `@theme inline` in `tooling/tailwind/fresco/theme.css` and get substituted to their inner `var(--…)` at Tailwind compile time. Consumers like `Button`'s `color="primary"` variant and the `text-link` utility read the underlying primitives (`--primary`, `--primary-contrast`, `--link`) directly, so overrides targeting the alias never propagated. Switched both to override the primitives instead, restoring the accent recoloring inside dialogs and link recoloring inside themed alerts.

- `DialogFooter` pins the cancel/dismiss button to the left and clusters secondary + primary to the right, via `justify-end` with a `first-of-many` selector that pushes the first child away. Choice dialogs render buttons in DOM order `cancel → secondary → primary` so the layout applies automatically. Single-button (acknowledge) footers stay right-aligned.

- `RichSelectGroup`'s mount-time `autoFocus` now uses `.focus({ preventScroll: true })`. Previously the default scroll-into-view ran before parent enter animations finished, so e.g. `TieStrengthCensus`'s slide-up `MotionSurface` (starting at `translateY(120%)`) was scrolled into view from off-screen, breaking the entrance. Keyboard-navigation focus is unchanged — user-initiated focus still scrolls.

- Expose `./collection/layout/GridLayout` in package exports. The compiled module already shipped in `dist/`, but with no `exports` entry consumers got a TS resolution error on `import …/GridLayout`. Sister layouts `InlineGridLayout` and `ListLayout` were already exposed.

## 2.10.2

### Patch Changes

- Control-variant size scale: `sm` button bumped up one notch for better tap-target density, and the briefly-introduced `xs` size is removed (the `sm` bump was the cleaner fix). Internal `Button` cleanup to match.

- `controlVariants` border-radius now varies per `size`. Default drops from `rounded-2xl` to `rounded`, and the `lg`/`xl` sizes opt into `rounded-lg`/`rounded-xl` so they keep visual mass against the larger control bodies. `sm`/`md` track the smaller new default.

## 2.10.0

### Minor Changes

- New `Accordion` component. Wraps base-ui's accordion primitives behind the fresco-ui surface (`Accordion`, `AccordionItem`, `AccordionHeader`, `AccordionTrigger`, `AccordionPanel`) and registers `./Accordion` in the package exports. Ships with Storybook coverage and uses the new `motionSafeProps` utility to strip motion props when `prefers-reduced-motion` is set.

- New `RadioItem` named export from `./form/fields/RadioGroup`. Pulls the styled radio item (label + animated indicator + base-ui `Radio.Root` + markdown label) out of `RadioGroupField`'s per-option `.map` so it can be reused inside other base-ui `RadioGroup` parents. `RadioGroupField`'s behavior and markup are unchanged.

- Register `./collection/layout/GridLayout` in the package exports. The compiled module already shipped in `dist/`, but without an `exports` entry consumers couldn't import it without a TS resolution error. Sister layouts `InlineGridLayout` and `ListLayout` were already exposed; this brings `GridLayout` in line.

- `RichSelectGroup` now uses listbox semantics in single-select mode. Selection decouples from focus, `Home`/`End` jump to first/last, and the single-select and multi-select branches are now separate JSX subtrees with static `role`/aria attributes (works around Biome's `useAriaPropsSupportedByRole` ternary-resolution limitation). New `autoFocus` prop. `description` is now optional. Horizontal mode sizes its container to content; `useColumns` is now gated behind an explicit prop instead of being implicit when horizontal. Used by the new Dyad/TieStrengthCensus stages over in `@codaco/interview`.

- `Surface` API simplification — **breaking for consumers passing `elevation`, `bleed`, or `dynamicSpacing`.** Drop those three props; consumers apply `shadow-*` utilities at the call site for elevation, and the spacing scale now resolves to static asymmetric padding (`px-N py-M`) at each tier rather than a mix of compound variants scaled by container queries. Default `spacing` shifts to `'md'` and each tier's `shadow-*` is bumped up one step so the resting depth matches the prior "low" elevation. Fresco-ui's own consumers (`Alert`, `Popover`, `Tooltip`, `DialogPopup`, `Combobox`) are updated; downstream consumers that relied on `elevation`/`dynamicSpacing` need to replace them with `shadow-*` classes and explicit responsive padding.

- `Surface` is now `min-h-0` by default. Surfaces nested in a flex column with a height constraint can now shrink below their content size — fixes a class of "ScrollArea viewport sizes to content instead of overflowing" bugs where the height-constraint chain was broken by flex's default `min-height: auto`. All 25 in-tree usages were audited; none depended on the prior `min-height: auto` behavior.

- `Node`'s `tabIndex` now defaults to `-1` when no `onClick` is provided, so passive nodes drop out of the tab order. Active (clickable) nodes are unaffected.

- Typography: switch `Heading`, `Paragraph`, and the list components to em-based top/bottom margins. After `--spacing-base` became rem-anchored in `@codaco/tailwind-config@1.0.0-alpha.17`, `mb-*` on typography no longer scaled per element, so headings and paragraphs lost their proportional rhythm. Em-based margins fix that without re-introducing em compounding into the global spacing scale. Also drop `h4` from `font-extrabold` to `font-bold` for consistency with the other heading levels, and downsize the `h4 + all-caps` compound to `text-sm` so it reads as a label rather than a heading.

- Theme cascade fixes for components that previously rendered a default-theme value inside `<ThemedRegion theme="interview">`:

  - `Node` selection ring: motion `boxShadow` keyframes now reference `var(--selected)` instead of `var(--color-selected)`, so the cascade picks up the interview override at the animated element. The `--color-*` alias resolves at `:root` and freezes the default-theme value, which was rendering the selection ring yellow inside the interview palette.
  - `Alert` `[--color-link:…]` variant overrides, `Button` `interview:[--component-text:…]` hover override, `Dialog` accent overrides (`[--color-primary:…]` / `[--color-primary-contrast:…]`), and `animate-pulse-glow` keyframes in `theme.css` swap to bare primitive vars for the same reason.

- `PortalContainer` is now a viewport-sized stacking context (`fixed inset-0 isolate z-50 pointer-events-none`), giving portaled popups a real containing block above sibling stage content. Re-enable pointer events on each portaled root via `[&>*]:pointer-events-auto` so dialog backdrops/popups don't inherit `pointer-events: none` from the container and stop accepting clicks.

- DnD drag preview now portals into the themed `PortalContainer` rather than `document.body`, so cloned drag items inherit the surrounding theme cascade.

- `ProgressBar` uses fixed `w-3/h-3` for the bar thickness instead of `calc(0.7 * var(--theme-root-size))`, and gates the `data-complete` pulse-glow animation behind `motion-safe:` so it respects `prefers-reduced-motion`.

- `ResizableFlexPanel` only applies `overflow: hidden` during the collapse transition, restoring it to the prior overflow behavior once the panel is fully open. Previously the panel kept `overflow: hidden` applied at all times, clipping content that should have been visible.

- `Spinner` and the package's Lucide default stroke-width drop from `2.5` to `2` for cleaner glyphs at the new themed sizes.

## 2.9.0

### Minor Changes

- Move `immer` from `peerDependencies` to `dependencies`. Hosts no longer need to declare `immer` themselves; fresco-ui now ships its own resolved version. Internal use is limited to `enableMapSet()` in the form store, and pnpm catalog/overrides keep the version aligned with `@codaco/interview`'s and any transitives (`@reduxjs/toolkit`, `zustand`).

- Drop `--color-` prefixes from a handful of `bg-[--…]` arbitrary values; tailwind-config alpha.16 now exposes the bare semantic tokens via `@theme inline`, and the `--color-*` indirection no longer flows through to scoped themes.

## 2.8.0

### Minor Changes

- `<ThemedRegion theme="interview">` now also applies Tailwind's `scheme-dark` utility (`color-scheme: dark`) on the wrapper. Interview is a dark-only palette, so native UI inside the region — form controls, scrollbars, autofill backgrounds — now matches the themed surface without the consumer having to add `scheme-dark` themselves. Consumers that previously hardcoded `scheme-dark` alongside `<ThemedRegion theme="interview">` can drop it.

## 2.7.0

### Minor Changes

- New `<ThemedRegion>` component and `<PortalContainerProvider>` for declarative theme scoping. All Portal-using components (Modal, Popover, Tooltip, DropdownMenu, Toast, Select, Combobox) now thread a portal container through React context, allowing themed dialogs and popovers to inherit the theme of the closest themed ancestor instead of always portaling into `document.body`. Outside a `<PortalContainerProvider>` the new container prop falls back to Base UI's default (`document.body`), so existing consumers see no behavior change. New exports: `@codaco/fresco-ui/ThemedRegion` (`ThemedRegion`) and `@codaco/fresco-ui/PortalContainer` (`PortalContainerProvider`, `usePortalContainer`).

- Move `@base-ui/react` from `dependencies` to `peerDependencies` (range `^1.4.0`). Previously it shipped as a regular dependency pinned to exact `1.4.0`, which caused dual-install issues when consumers (or sibling peer deps like `@codaco/interview`) wanted a different patch version. Hosts must now declare `@base-ui/react` themselves.

- Move `@codaco/protocol-validation` from `peerDependencies` to `devDependencies`. All usages inside fresco-ui are `import type` only (`Variable`, `StageSubject`, `Codebook`, `AdditionalAttributes` in the form layer's type signatures), so nothing ends up in the runtime bundle. Hosts that consume fresco-ui's form types must declare `@codaco/protocol-validation` themselves; without it, fresco-ui's emitted `.d.ts` files won't typecheck cleanly.

## 2.0.1

### Patch Changes

- 753be39: Order the Google Fonts `@import` before `@import "tailwindcss"` in `styles.css` so the nested `@import url('https://fonts.googleapis.com/...')` lands at the top of the compiled CSS stream — `@tailwindcss/postcss` expanded `tailwindcss` into rules and pushed the url() past them, breaking consumer apps with "@import rules must precede all rules" errors.

  Also: wire `@tailwindcss/vite` into Storybook + Vitest, repair the interview-theme `--warning` color, paint the themed body background and register `interview:` / `dashboard:` variants, and quiet autodocs canvas CSS warnings.

## 2.0.0

### Patch Changes

- c0cc415: Move the canonical Fresco themes (default + interview) into @codaco/tailwind-config.
  The previous default-theme.css was a stripped subset; it's now replaced with the
  full theme including light + dark variants and Inclusive Sans body font.
  The new interview-theme.css adds the interview-mode palette (keyed off
  :root:has([data-interview])).
- Updated dependencies [c0cc415]
  - @codaco/tailwind-config@0.4.0

## 1.0.0

### Patch Changes

- f553ba7: Move the Nunito Google Fonts `@import url(...)` out of `default-theme.css` and into a new `@codaco/tailwind-config/fresco/fonts.css`. `fresco-ui`'s `styles.css` now imports it first, so the `@import` lands at the top of the CSS stream — CSS spec requires `@import` to precede all rules except `@charset` / `@layer`. Resolves the "@import rules must precede all rules" warning emitted by Tailwind v4 builds in consumer projects.
- Updated dependencies [f553ba7]
  - @codaco/tailwind-config@0.3.0

## 0.3.0

### Minor Changes

- 3ea5b76: Move `@codaco/tailwind-config` from `dependencies` to `peerDependencies`. Tailwind v4's CSS resolver walks `node_modules/` from the consuming `.css` file's directory upward; pnpm doesn't hoist transitive deps, so the `@plugin` directives in `dist/styles.css` couldn't resolve in consumer projects. As a peer dep, pnpm with `auto-install-peers` (the default) hoists it correctly. Consumers without `auto-install-peers` need to install `@codaco/tailwind-config` themselves.

## 0.2.1

### Patch Changes

- fae569b: Restore `ValidFieldComponent = React.ComponentType<any>`. The narrower `React.ComponentType<FieldValueProps<FieldValue> & InjectedFieldProps>` introduced in 0.2.0 broke consumers that pass narrowly-typed field components (e.g. `InputField` accepts `value: string|number`) — contravariance forced them to handle the entire `FieldValue` union. The `any` is intentional and documented at the type definition.

## 0.2.0

### Minor Changes

- ff40992: Restructure the package's public surface and build setup. The public API is unchanged in behaviour, but several import paths have moved and the Tailwind theme now lives in a separate package.

  Changes:

  - **Tailwind theme moved to `@codaco/tailwind-config`.** The Fresco theme tokens, colour palette, and Tailwind plugins (elevation, inset-surface, motion-spring) are now hosted by `@codaco/tailwind-config` under the `./fresco/*` subpaths. The Nunito font is now loaded from there as well. `@codaco/fresco-ui` re-consumes them internally.
  - **Component file names standardised to PascalCase.** The lowercase files (`badge`, `dropdown-menu`, `popover`, `skeleton`, `table`, `tooltip`) and their corresponding subpath exports have been renamed.
  - **`form/components/` flattened to `form/`.** Field components are now imported one level shallower.
  - **`nuqs` is no longer a peer dependency.** Components that previously read URL state via `nuqs` now expose controlled `value`/`onChange` APIs, so consumers are free to wire up any state source.
  - **Storybook interaction tests.** A Vitest browser-mode project (Playwright + Chromium) now runs the Storybook play functions in CI.
  - **Build internals.** `exports.config.ts` and the build-exports script have been removed — `package.json#exports` is now the single source of truth. Externals are declared inline via regex (replacing `vite-plugin-externalize-deps`). Vite plugins, including `@vitejs/plugin-react` v6, are on their latest releases.

  Migration:

  - `import … from '@codaco/fresco-ui/badge'` → `'@codaco/fresco-ui/Badge'`
  - `import … from '@codaco/fresco-ui/dropdown-menu'` → `'@codaco/fresco-ui/DropdownMenu'`
  - `import … from '@codaco/fresco-ui/popover'` → `'@codaco/fresco-ui/Popover'`
  - `import … from '@codaco/fresco-ui/skeleton'` → `'@codaco/fresco-ui/Skeleton'`
  - `import … from '@codaco/fresco-ui/table'` → `'@codaco/fresco-ui/Table'`
  - `import … from '@codaco/fresco-ui/tooltip'` → `'@codaco/fresco-ui/Tooltip'`
  - `import … from '@codaco/fresco-ui/form/components/<X>'` → `'@codaco/fresco-ui/form/<X>'`
  - Theme/colour CSS imports move from `@codaco/fresco-ui/styles.css` add-ons to `@codaco/tailwind-config/fresco/theme.css` and `@codaco/tailwind-config/fresco/colors.css`.
  - Drop `nuqs` from peer dependencies; pass controlled state into the affected components instead.

### Patch Changes

- Updated dependencies [ead6f9e]
  - @codaco/tailwind-config@0.2.0

## 0.1.1

### Patch Changes

- Port two fixes from Fresco's `next` branch:
  - **Combobox**: control `inputValue` and only honour `input-change` so the user's search query survives item-press. Resets the query on popup close. Workaround for [mui/base-ui#3977](https://github.com/mui/base-ui/issues/3977) / [#4360](https://github.com/mui/base-ui/issues/4360).
  - **PasswordField**: `Omit<..., 'type'>` so consumers can't override the input type and break the password masking.

## 0.1.0

### Minor Changes

- fcfe1aa: Initial release of `@codaco/fresco-ui` — Fresco UI components, styles, and utilities migrated from Fresco's `components/ui/` directory. Tailwind v4 CSS-first; ~96 public exports across primitives, layout, typography, dialogs, dnd, collection, and form subsystems. Pre-1.0; expect breaking changes until the API stabilises.
- Stable initial release. Components, styles, and utilities migrated from Fresco's `components/ui/`. Tailwind v4 CSS-first; ~96 public exports across primitives, layout, typography, dialogs, dnd, collection, and form subsystems.

### Patch Changes

- d678a2a: Expose `./dnd/dnd`, `./form/components/Field/Field`, four form field components (`LikertScale`, `RelativeDatePicker`, `ToggleButtonGroup`, `VisualAnalogScale`), `./form/store/types`, and `./form/utils/ymd`. These are required by Fresco's `useProtocolForm` (relocated to `lib/interviewer/forms/`) and by Fresco code that imported the dnd barrel.
- 5793bf2: Inline the Collection's search Web Worker as a base64 blob URL. The previous build emitted the worker as a separate file at `dist/assets/search.worker-<hash>.js` with an absolute URL that consumers (Next.js, etc.) couldn't resolve. Switching to Vite's `?worker&inline` syntax embeds the worker so it works in any environment.

## 0.1.0-next.2

### Patch Changes

- Inline the Collection's search Web Worker as a base64 blob URL. The previous build emitted the worker as a separate file at `dist/assets/search.worker-<hash>.js` with an absolute URL that consumers (Next.js, etc.) couldn't resolve. Switching to Vite's `?worker&inline` syntax embeds the worker so it works in any environment.

## 0.1.0-next.1

### Patch Changes

- Expose `./dnd/dnd`, `./form/components/Field/Field`, four form field components (`LikertScale`, `RelativeDatePicker`, `ToggleButtonGroup`, `VisualAnalogScale`), `./form/store/types`, and `./form/utils/ymd`. These are required by Fresco's `useProtocolForm` (relocated to `lib/interviewer/forms/`) and by Fresco code that imported the dnd barrel.

## 0.1.0-next.0

### Minor Changes

- fcfe1aa: Initial release of `@codaco/fresco-ui` — Fresco UI components, styles, and utilities migrated from Fresco's `components/ui/` directory. Tailwind v4 CSS-first; ~96 public exports across primitives, layout, typography, dialogs, dnd, collection, and form subsystems. Pre-1.0; expect breaking changes until the API stabilises.
