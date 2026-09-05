# @codaco/fresco-ui

## 6.5.0

### Minor Changes

- b0fa87a: Export `storybook-support/awaitPassiveEffects`. It is what a Storybook play
  function awaits before its first synthetic interaction, so the story's passive
  effects have run and the event is not swallowed by a listener that is not
  attached yet. Stories outside this package had no way to reach it, and the only
  alternative was a second copy of the same three lines.
- c358132: Every piece of copy the components supply themselves — icon labels, dialog
  buttons, empty states, validation messages, pagination and sort announcements
  — now renders through `@codaco/app-i18n` instead of being hardcoded English.
  That includes the copy with no visible home: the accessible names a control
  falls back to when the caller supplies none (progress bars, panel handles,
  number steppers, the Likert and analog scales), the drag-and-drop live-region
  announcements, and the two messages a person only sees once something has
  already failed — a submit handler that threw, and a validation rule that did.

  The numbers inside that copy now go through the same formatter, so a filter
  endpoint, a saved filter condition and the analog scale's value bubble carry
  the reader's digits and grouping rather than the source language's.

  Existing hosts need no change: a component used without a locale provider
  renders exactly the English it rendered before, with one exception — those
  numbers now take English grouping, so a range ending at 2000 reads `2,000`.

  A host that wants the components in the reader's language mounts
  `AppI18nProvider` and merges this package's catalogs into the messages it
  passes it — `mergeCatalogs(commonCatalogs[locale], frescoUiCatalogs[locale],
appCatalog)`, taking `frescoUiCatalogs` from `@codaco/fresco-ui/locales`. The
  provider formats only the `messages` it is handed, so mounting it without that
  merge leaves every `frescoUi.*` id on its English default — including the
  en-GB overrides, where the trash-bin icon stays a "Trash bin" rather than a
  "Rubbish bin".

  Also adds a `LocaleSelect` field for choosing a language, exports the
  package's catalogs at `@codaco/fresco-ui/locales`, and converts the layout to
  logical properties (`start`/`end` rather than `left`/`right`) so the
  components lay out correctly in right-to-left languages.

- 3abf9e4: Two new components for naming where a researcher is: `IdentityMark` and
  `navigation/TeamAndStudySwitcher`.

  `IdentityMark` gives an entity a stable visual identity — a monogram on a fill
  chosen by hashing the entity's id. The fill derives from the id alone, so the
  same entity is the same colour in every session with nothing persisted, and
  renaming it never recolours it. The fill and foreground pairings are measured
  rather than assumed: mustard, sea green and sea serpent take the dark
  foreground, because white on them is 1.82:1, 2.27:1 and 2.23:1. The mark is
  `aria-hidden` — every caller renders the entity's real name beside it.

  `TeamAndStudySwitcher` is the control that names the team whose work is on
  screen and the study open inside it, and moves between siblings of either. One
  component rather than a frame composed around separate switchers: the frame and
  the segments have to agree about radius, height and where a painted surface
  stops, and as separate components they disagreed about each in turn. The frame
  owns the border, the radius and the clip; the segments have no corners of their
  own.

  It is a listbox rather than a menu, so opening lands on the entity you are
  already in rather than on the first sibling. The trailing command sits in the
  popup but outside the list, so the list holds only options — and the command
  is still reachable, one Tab from the open list. A segment with nothing to
  switch to and no command renders inert rather than taking a tab stop, and a
  loading segment reserves the space its name will take, so the header does not
  reflow. Which presentation a segment is in follows a container query, not the
  viewport.

  A segment's status is `ready` or `loading`, and there is no failure state.
  A list that could not be read is the host's to report: one switcher carrying
  its own error surface would put a second, quieter account of the same outage
  beside the one the application already makes.

  The trigger's accessible name is one interpolated message the host supplies
  through `accessibleName`, rather than two separately translated strings this
  component joins. Word order is a property of the sentence — English wants
  "Team SONIC Lab" and Japanese the equivalent of "SONIC Lab team" — and no
  order the component picks is right everywhere. It defaults to the previous
  output, and warns in development when a supplied label does not contain the
  visible name, which a control's accessible name has to (WCAG 2.5.3).

  The listbox is rendered even when the list is empty. Without one, Base UI
  moves `role="listbox"` onto the popup, which puts the trailing command inside
  the listbox — a structure that holds options and nothing else, and one a
  screen reader may skip or misannounce.

  The supporting line under a name keeps full strength on the selected row.
  Dimmed, it composites toward `--selected` and falls to 2.90:1 against it.

  Every text run in the control sits on its caps and baseline rather than on its
  line box, matching the rest of the library. Two spacings that the leading used
  to provide by accident — between the kicker and the name, and between a name
  and its supporting line — are now stated, and a name that has to shorten clips
  sideways only, because a cap-height box would otherwise lose its descenders.

  The type scale gains `text-2xs`, one step below `xs`, for the small uppercase
  labels that qualify a value rather than being one.

  `@codaco/tailwind-config` ships alongside because the components need its CSS:
  a `--text-2xs` step below `xs`, for the small uppercase word above each name,
  and a radius scale that now derives every step from `--radius-base`. That
  second change is a fix — only the bare `rounded` utility followed a theme
  before, so `rounded-sm` and the rest resolved at `:root` and every themed
  region got the default theme's numbers.

  Interviewer's update indicator takes the default pill size. It was the only
  caller asking for `sm` — Architect's equivalent asks for `md` — so the same
  indicator was drawn at two sizes in the two apps for no stated reason. It is
  `md` in both now. The patch is here rather than in a changeset of its own
  because the size it lands on is `Pill`'s, and the two move together.

- a5626f5: Add the application-shell layout and navigation primitives: `layout/AppFrame`,
  `layout/AppArea`, `navigation/NavList`, `navigation/NavItem` and
  `navigation/NavDrawer`.

  `AppFrame` is the outer chrome — the skip link, the `header` it renders around
  the host's header contents, and the region an area fills. It renders no `nav` and no `main` of its own. `AppArea` renders those:
  one labelled navigation region and one `main` the skip link lands on, becoming
  a trigger and a drawer when its container is narrow. Keeping the two apart is
  what lets one area's navigation replace another's rather than nest inside it.

  `NavList` groups destinations under translatable headings, as sibling lists so
  each reports its own count and none claims a hierarchy that isn't there.
  `NavItem` takes its link from a render prop, so any router can supply one, and
  folds an optional count into the destination's accessible name rather than
  leaving a bare number beside it. Its `disabled` state — which requires an
  `unavailableReason` alongside it — renders a destination this deployment does
  not have as text rather than as a link: no `href`, nothing focusable, and the
  reason shown beneath the label so the row explains itself.

  `NavDrawer` traps focus while open and hands focus to the destination when a
  navigation closes it, falling back to the trigger when the destination has no
  landing point. A navigation that is cancelled leaves it open.

  `navigation/RouteFocus` gains `hasRouteFocusTarget`, which answers whether the
  current route has a landing point — for callers that must know a handoff is
  possible before giving up the focus they hold.

### Patch Changes

- 15c8259: Every subpath that runs a React hook now declares `'use client'`, so a Next App
  Router application can import it from a Server Component. Twenty-seven modules
  were missing the directive, including `Modal`, `Popover`, `TimeAgo`,
  `SegmentedSwitcher`, `form/FieldGroup`, `form/SubmitButton`,
  `form/fields/CheckboxGroup`, the form hooks (`form/hooks/useField`,
  `useForm`, `useFormState`, `useFormStore`, `useFormValue`), `dialogs/useDialog`,
  `dnd/useDropTarget`, `hooks/useSafeLocalStorage`, `navigation/RouteFocus` and
  `utils/NoSSRWrapper`. An unmarked module is treated as server code, so importing
  any of these anywhere in a Server Component's import graph failed the build
  rather than rendering.

  `typography/Heading` and `NativeLink` are deliberately unchanged and stay
  server-renderable: the only hook-named call they make is Base UI's `useRender`,
  which runs no React hook of its own.

- c100092: Fix `FieldErrors`' shake animation replaying on every keystroke of an already-invalid field. Revalidating a dirty field clears its error and writes the identical message back within the same keystroke, which made the message flicker off and back on and, with it, the shake — even though nothing had actually changed. The shake now only replays when the message itself changes.
- 208fcea: The site header's Software dropdown cards now highlight the moment the pointer reaches them. The hover tint is a light wash on the popup surface, and easing it in over 150ms made the highlight appear to lag behind the pointer and linger on the card just left.

## 6.4.0

### Minor Changes

- 05ea832: Add the everything bar component and the studio theme.

  `@codaco/fresco-ui` gains `navigation/EverythingBar`, the shared
  search-and-command surface specified for Network Canvas Studio: a ⌘K dialog
  with an ARIA combobox over app-supplied providers, fixed Go to / Commands /
  Documentation groups, rank-merged results with identity-stable highlighting,
  frontier-bounded pagination, reference-only recents with permission
  revalidation, and per-group error containment. It also gains `Kbd`, a semantic
  keyboard-key component used for the bar's chord and shortcut hints, and
  `ThemedRegion` now accepts `theme="studio"`.

  `@codaco/tailwind-config` gains the scoped studio theme: a light mode on
  subtly warmed paper and a midnight-blue dark mode, keyed off
  `[data-theme-studio]` with dark driven by the existing `[data-theme='dark']`
  attribute.

- 0666674: `SiteNavigation` now opens with a "Skip to main content" link, so every site
  that renders the canonical header has the mechanism WCAG 2.4.1 requires for
  bypassing a block repeated on every page.

  The link is the first focusable element in the header, invisible until it takes
  focus, and translated alongside the rest of the navigation copy. It jumps to the
  new `skipToId` prop, which defaults to `main-content`. The new
  `navigation/SiteNavigation.constants` subpath exports that default as
  `SITE_NAVIGATION_SKIP_TARGET_ID`, so a page can mark its target with the same
  value the header links to without importing the header itself.

  The host page owns the target element — the header cannot supply one — and the
  link moves focus onto it explicitly, adding `tabindex="-1"` when the page has
  not already made it focusable, because browsers otherwise only set the
  sequential focus navigation starting point and Safari does not honour it.

  `<nc-site-navigation>` exposes the same target through a `skip-to-id`
  attribute. The fragment resolves against the host document from inside the
  shadow root, so the link reaches an element the component cannot see; a host
  page with no matching element gets a link that does nothing, which the README
  now spells out.

### Patch Changes

- b4b21ed: Expose a renderer-backed icon-name guard so protocol editors can reject unsupported participant icons before saving.

## 6.3.0

### Minor Changes

- 080d355: Add `navigation/RouteFocus`: route-change focus management and screen-reader
  announcement, router-agnostic so any host can use it.

  On a route change it moves focus to the new route's `h1` — marked with the
  exported `routeFocusTargetProps` — and announces the destination politely.
  Focus only moves when the navigation actually lost focus, so it will not fight a
  dialog returning focus to its opener, an autofocused field, or a focus trap; and
  it refuses a target inside an `inert` subtree, where focusing silently fails and
  would strand focus on `body`.

  The announcement alternates between two live regions, so a route whose title
  matches the one just announced still changes a region and is still read out —
  two stages called "Name people" are announced twice, not once. A route with no
  heading to name it by announces nothing and clears what the last route left, and
  a heading that only appears after the location commits — a lazy or
  Suspense-backed route showing a fallback — is picked up when it arrives, without
  taking focus from anyone who started using the fallback.

  The host supplies its own router's location as a prop. `focusRouteTarget` is
  exported for the case where a route's content is replaced without the location
  changing, and both it and the component accept an optional `ownerDocument` for
  UI rendered into a popped-out window or an iframe.

### Patch Changes

- cead6fc: Correct empty date field text colors in Safari so placeholders use the intended neutral theme color.
- 77c3736: Replace the interview text-size choices with an accessible percentage input that supports plus and minus controls, arrow keys, and direct entry.
- 0584c69: Focus state is now read correctly in another window's document, so a modal, a
  form error, or a route change in UI rendered into an iframe or a popped-out
  window no longer treats the control the user is on as unfocused and moves focus
  off it.

  The shared `holdsFocus` predicate identified elements with `instanceof`, which
  only recognises the realm it was loaded in; every caller that accepts an
  `ownerDocument` — `Modal`, `focusFirstError`, `RouteFocus` — could be handed an
  element from another one. It and `asFinalFocusTarget` now ask the node what it
  is, and answer exactly as before for everything in the host's own document.

## 6.2.0

### Minor Changes

- 301e8fe: `Section` now accepts an optional `id`, so a form outline elsewhere on the page
  can link to a section and move focus to it — arriving announces the section's
  own title. Field path utilities are also available on their own subpath
  (`@codaco/fresco-ui/form/utils/objectPath`), for reading and removing a value
  at the structural path a field is stored under.

### Patch Changes

- 2f8fcdc: Make app updates reliable without reloading open work automatically. Fresh launches now activate an available update before the interface appears, updates found after rendering wait for an explicit install action, and the post-reload state reliably links to the release notes.

## 6.1.0

### Minor Changes

- 43c7746: Fresco UI now owns two answers its consumers were each working out for themselves.

  **`stripManagedProperties`.** `ArrayField` adds its own bookkeeping properties to every item it hands out, and a consumer that saves an item has to take them off first. Three consumers were doing that with their own inline copy of the list, each frozen on the properties that existed when it was written — so a property added to `ArrayField` would have started arriving in saved data. The strip is now exported from `@codaco/fresco-ui/form/fields/ArrayField/ArrayField` and derived from the property definitions themselves, and adding a managed property without listing it is a compile error.

  **`selectIsFormDirty`.** Exported from `@codaco/fresco-ui/form/store/formStoreProvider`, this answers whether a form currently holds values that differ from the ones its fields registered with. It is a live comparison, unlike the `isDirty` flag beside it in the same store, which is set by the first keystroke and cleared only by a reset — so anything guarding unsaved work on that flag keeps asking about a form the person has already put back by hand, and treats a form that normalised its own values at mount as edited before it was touched.

  No visible change for anyone using Architect: it consumed both from its own copies and now consumes them from here.

- e9a6522: Shared form and interaction components now provide more reliable validation, focus, accessibility, and responsive layout behavior.

  - Required fields, errors, hints, and custom controls expose only the ARIA relationships they actually render, and a blocked submission focuses the first usable invalid control.
  - Optional blank values no longer trigger format, range, or length errors. External value changes clear stale errors and remain synchronized with rich text fields.
  - Dialogs keep the rest of the page inert, restore focus when closed, and expose scrollable content only when it can actually scroll.
  - Toolbars retain keyboard focus when an action becomes unavailable, and buttons, repeated fields, selected-resource cards, and segmented controls can shrink within narrow containers.
  - `Node` can render as presentational content inside another control, and `IconButton` accepts `aria-labelledby` as an accessible name.

  `ArrayField` no longer imposes a minimum width. It fills and shrinks with its container, so hosts that relied on it to hold a column open must set that width themselves.

- 71baa6c: Add reusable Section and Toggle components with accessible collapsible controls, nested-surface heading hierarchy, guarded open-state changes, and automatic form-field clearing and unregistration when a section is collapsed. Add named Surface color series and render ArrayField items as accent surfaces so nested components inherit the correct themed surface level.
- 1391fa8: Form stores can now read and clear a value the form holds as a container of
  nested fields, not just as one field. A form that registers `parameters.type`
  and `parameters.min` never registers `parameters` itself, so reading that name
  used to come back empty and clearing it did nothing.

  Three new store actions cover it, each available on the store, on
  `pathOperations`, and through `useFormValue`:

  - `getValue(name)` returns the value at a name, assembling it out of the
    registered fields beneath it when the form holds it as a container. The
    assembled object keeps a stable identity while its contents are unchanged, so
    a component reading a container re-renders no more often than one reading a
    single field. `useFormValue` uses it, so container names now read the same way
    field names always have.
  - `hasValue(name)` reports whether the form holds anything at a name — useful
    for telling a field that has not registered yet apart from one that has been
    emptied. `useFormHasValue` is the matching hook.
  - `clearValue(name)` clears a name together with every field beneath it,
    including fields whose sections are currently unmounted, so a cleared value
    cannot reappear when its section comes back.

- f03b1e4: Names that are too long for a node now shrink to fit instead of being cut off, so most are readable in full at a glance. A name that is still too long at the smallest readable size can be read in full by pressing and holding it, or by moving to it with the keyboard. Holding never moves or selects the person, and letting go leaves everything exactly as it was.

  For developers, the Node component is now the single gesture recognizer for its own pointer sequence: hosts declare `onClick`, `onLongPress`, and `onDragStart`/`onDragMove`/`onDragEnd`, and the node classifies each gesture as exactly one of them and renders every visual and accessibility consequence itself — press animation, hold indicator, grab/grabbing cursor, pointer capture, `aria-grabbed`, `aria-pressed` from `selected`, and a tab stop whenever focusing does something. Canvas hosts implement drag effects through `useCanvasDrag`'s callback API instead of attaching their own pointer listeners.

  Compatibility: the names `onDrag`, `onDragStart`, and `onDragEnd` were already omitted from Node's props before this release (and at runtime were claimed by Motion's own gesture system, so they never received native HTML5 drag events); they now form Node's pointer-gesture drag API. `onClick` handlers written for a plain button remain assignable — the new `details` argument is optional in the type and always supplied at runtime.

### Patch Changes

- 9a34469: Hovering a `Button` that is already selected no longer repaints it. A toggle that is on, a disclosure that is open, and a control using the `selected` prop all keep their selected colours under the pointer — previously the hover treatment painted over them, so a menu trigger stopped looking open while the pointer rested on it, which is exactly when a researcher is most likely to be looking at it.

  A call site's own selected treatment now stands unopposed on hover too, including a quieter one such as `aria-expanded:bg-selected/15`. A call site's explicit `ui-enabled:hover:…` is still honoured, and unselected buttons are unchanged.

- e3e7b2c: Respect Motion's global skip-animation setting in `useSafeAnimate`.
- b51ef59: Prevent malicious form field paths from modifying object prototypes while preserving dotted protocol variable identifiers and nested field namespaces.
- eb73319: Every form field control now survives being handed a value of the wrong shape. Because the form store owns the value and the resets that follow a change of question type run only after a render commits, any control can hold the previous field's value for one render — and a control that threw during that render blocked the very reset that would have cleared it. The array field, combobox, radio matrix, segmented code field and styled select each did so; they now render their empty state for that one pass instead. What a control emits when someone actually uses it is unchanged.
- e08ebbf: Checkbox and toggle button groups no longer crash when given a value that is not an array. A host that swaps the control under a still-registered field — a form whose question type changes, say — could hand the group a boolean or number for one render and take the page down with it. Such a value now renders nothing selected until the host settles, and a value of the wrong shape can no longer select entries by accident.

  The scroll fade at the top of a `ScrollArea` is now confined to its own stacking context, so it can no longer paint over content that follows the scrolling region.

- 88d7db0: Boolean and rich-select option cards now set their own text colour alongside their background, so their labels stay readable on any surface. Previously the label inherited the surrounding surface's text colour, which could leave it unreadable — white on a white card — wherever the card sat on a dark surface.

  Modal popups now finish their exit animation instead of restarting it whenever a surrounding component re-renders, which could leave a closed modal mounted on screen and covering whatever opened next.

  Form values now resolve a nested field over the field that holds its container path, instead of whichever registered last winning. A form with both `mapOptions` and `mapOptions.style` registered could previously lose one of them on submit.

  Submit buttons keep the same label while a form is submitting, showing progress through their spinner and disabled state instead of renaming themselves. A button that renamed itself mid-submit could make an automated check believe a dialog had already closed. Pass `submittingText` to opt back in to a changed label.

  Surfaces gained a fourth nesting level, so deeply nested content has one more step of contrast before it repeats its parent's colour.

  Fields no longer establish a CSS size container unless they lay out inline, which is the only layout that queries it. Making every field a size container could, in Chromium, leave a field's control with its styles but without any layout at all — rendering it invisible and unusable — when a large neighbouring section appeared at the same moment.

  Adding a row to a list field now keeps the row's own identity instead of assigning it an unrelated one. The mismatch surfaced a moment later and remounted the row, and any form fields it contained were torn down with it, losing what had just been entered.

  A field that is checked while part of the form appears or disappears now finishes that check instead of abandoning it. Previously the field kept whatever error it was already showing, so an answered field could go on reporting itself as required — most visibly where answering one field is what reveals the next section.

  Apps may now supply `checkUnsavedWork` to `useAppUpdate`, re-checked at the moment an update would be applied automatically. An app whose "unsaved work" reading is coalesced can otherwise still report itself idle for work the person has just done, and that path reloads without asking.

- ae3c616: Read-only checkboxes and toggle button groups no longer show hover and press affordances for a click they silently ignore. A read-only `Checkbox` (and the checkboxes rendered by `CheckboxGroup`) and a read-only `ToggleButtonGroup` option now stop responding to the pointer entirely — no hover state, no press animation — while remaining focusable and still announced as read-only to assistive technology.
- 59f131c: Fixes interactions that were advertised to assistive technology but did nothing when activated.

  `ArrayField` now omits `onDelete`/`onEdit`/`onChange`/`onUpdate` (and the editor's `onSave`) entirely while disabled or read-only, instead of substituting no-op stand-ins. An `itemComponent`/`editorComponent` that renders its edit/delete/save affordance from handler presence — the normal pattern — now correctly hides that affordance rather than drawing a live-looking control wired to nothing.

  `SegmentedToolbar`'s toggle and group segments now forward `onPressedChange`/`onValueChange` straight through to Base UI, the same way button segments already forward `onClick`. This also fixes those callbacks silently losing Base UI's `eventDetails` argument, which a consumer needs to veto a change via `eventDetails.cancel()`. A controlled toggle or group segment supplied without its change callback — which can never change state once controlled — is now disabled outright instead of staying tappable for nothing.

  Architect's library panel gallery promo card no longer announces itself as a selectable option — clicking or activating it never did anything, since the collection it sits in doesn't support selection. It's now rendered as its own labelled group alongside the templates list rather than as one of the list's items, so its Dismiss button and gallery link stay independently operable without the collection's listbox/option structure being misapplied to a card that isn't a selectable option.

- 7ca985f: Keep fitted node labels accurate as fluid type changes, make long labels scroll within the available viewport when revealed, and release keyboard press feedback when activation moves focus into an opened form.
- c78135c: Stop offering click affordances for nodes that cannot be clicked. A collection with no selection, a node list with no tap handler, and a name generator stage with no form each handed their items a click handler that did nothing, so nodes showed a pointer cursor and press feedback for a tap that could never have an effect.
- dcbc7aa: Popover now honours a consumer's `event.cancel()` in `onOpenChange` for uncontrolled popovers: cancelling a close (as SegmentedToolbar's sticky popovers do for outside presses) previously left the internal mounted state closed anyway, so only controlled popovers stayed open.
- 0f20ff5: SegmentedToolbar keyboard nudges now stay within a `RefObject` drag constraint, not only an object-form one. Arrow-key moves measure the constraint container against the toolbar, and an oversized toolbar receives a pannable range instead of jumping to one edge.
- 4a4a9f4: Tooltips now hide instantly on close instead of waiting for an exit animation, so rapid movement across controls never leaves stale tooltip popups visible.
- 54650ab: Prevent null form field values from crashing Architect when changing the node type of configured ordinal or categorical bin stages.
- a9825f4: `SegmentedToolbar` items can now opt into remaining focused when they become unavailable. The default remains native disabled-button behavior.

  The opt-in is available as `focusableWhenDisabled` on button, toggle, group-option, menu, and popover items. These items report `aria-disabled="true"`; other unavailable items continue to use the native `disabled` attribute. All unavailable items now dim and suppress hover and active styling.

- Updated dependencies ([e9a6522](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e9a652266ef9ddfa7fc42de1c8123bd7011c52a1), [fdb3b56](https://github.com/complexdatacollective/network-canvas-monorepo/commit/fdb3b56440f6cad89a44718d24ff725be3bb5e15))
  - @codaco/shared-consts@6.0.0

## 6.0.0

### Major Changes

- 90e0178: Form values now include only registered fields. `getFormValues()` — and therefore submitted values, validation context, and wizard finish payloads — no longer merges values from unmounted (dormant) fields. A field hidden by conditional rendering (`FieldGroup`) contributes nothing to the form's output while hidden. Dormant storage still restores a field's value when it remounts, and `getFieldState`/`useFormValue` still fall back to it for cross-step reads.

  Wizard dialogs now accumulate each step's values as you navigate (forward, back, or jumping), so multi-step wizards continue to resolve with every step's answers under the new semantics. A revisited step's answers wholly replace what was previously recorded for its fields, which also fixes stale repeated-entry arrays surviving a reduced count.

  `setFieldValue` on an unregistered field name now stages a pending value that takes effect when the field next mounts, instead of warning and discarding the write.

### Minor Changes

- 52a3fbb: Honor reduced-motion preferences in Architect and expose a shared provider for disabling Motion and Base UI animations together in automated hosts.
- 13e5e99: Add a shared automation-aware animation provider that disables Motion and Base UI animations together for visual-test hosts.
- ea06b66: Validation rules now save what the editor shows.

  Nudging a rule's value with the plus or minus button changed the number on
  screen without saving it, and if the value was being edited at the time, the
  older number was saved instead. Switching on a rule that needs no value — such
  as Required — saved it even where it could never be satisfied, for instance
  alongside a maximum length of zero. A rule held back because it clashed with
  another one stayed unsaved even after the clash was resolved, so a rule could
  sit switched on with a sensible value that was never written. And undoing a
  change left the rule switched on with the old value still showing, ready to be
  written out again.

  A rule whose value was still being typed is no longer dropped when a different
  rule in the same list is saved: changing a minimum and then nudging the maximum
  now saves both, rather than putting the minimum back to its old number. And
  switching the whole Validation section off and then undoing reopens the section
  with the restored rules in view, instead of leaving rules that will be saved
  hidden behind a switched-off section.

  Each rule's plus and minus buttons are also now named after that rule, so a
  screen reader announces "Increase Minimum value" rather than "Increase value"
  on every numeric rule on the screen.

  `InputField` gains two optional props to support this: `onStep`, which reports
  a value settled by a stepper button or arrow key, and `stepperLabels`, which
  names the stepper buttons. Both default to the previous behaviour.

### Patch Changes

- fec9536: Add a Colored Eco-Genetic Relationship Map (CEGRM) template for families living with an inherited condition. It combines a family pedigree with the participant's wider social network, records relationship closeness and contact frequency alongside exchanges of information, practical help, emotional and spiritual support, and closes on a visual map and an inheritance view.

  Treat the Family Pedigree node label as a validated codebook field, apply its rules to every family-member name entry point, and expose those rules beside the label-variable selector in Architect. Keep the iconically rendered ego node outside label and additional family-member form collection, including in synthetic previews. Reduce the default synthetic Sociogram edge density so preview networks remain legible as their node count grows.

  Keep optional unique fields empty without false duplicate errors, scope comparison rules to the active field namespace, and prevent dormant or duplicate pedigree name controls from affecting validation.

- 673d5f3: Toggles no longer replay their animation when something near them moves. Motion
  groups every animating element inside a dialog together and re-measures the
  whole group whenever any one of them changes, so switching one toggle on made
  every other toggle on screen slide its handle as the content around it reflowed.
  Each toggle's handle is now measured on its own, and only the toggle that was
  actually operated animates.

## 5.1.0

### Minor Changes

- fa88ae4: Likert and visual analog scales respond to being tapped again. Pressing anywhere
  along the scale had stopped moving the marker at all, so a participant could
  only answer by dragging it — and on a scale they had not answered yet, pressing
  the marker without moving it recorded nothing. Both now register the position
  that was pressed, and pressing an unanswered scale without moving it records the
  value the marker is resting on.

  The marker's press animation moved to a nested element to make this work, so
  `sliderThumbVariants` no longer carries the marker's fill. The new
  `sliderThumbSurfaceVariants` supplies it, and both scales pair the two.

  The same restructure clears the render loop that had held Base UI at 1.6, so the
  workspace now tracks 1.7.

### Patch Changes

- 3c8fe35: Generate realistic, source-backed family pedigrees with reproductive scenarios and multi-generational disease lineages, while respecting each stage's collected variables, keeping pedigree membership isolated from other interview stages, correctly rendering shared and multiple unions, widening partnership response columns, and warning participants before discarding onboarding progress.

  Improve pedigree editing and parentage capture by confirming destructive deletions, preserving biological-sex values, allowing current/ex-partner status changes, and recording reproductive roles independently from sex recorded at birth.

## 5.0.3

### Patch Changes

- ea589ec: Keep a scrolled roster near the dragged item after it is added instead of resetting the source list to the top.
- 8ff0e2d: Hide the check indicator on unchecked `DropdownMenuRadioItem`s. The indicator
  is kept mounted to preserve label alignment, but previously remained visible,
  so every radio item in a dropdown menu appeared checked.
- c5f30fd: Restore the full-size interview type scale on tablets.

  The interview's viewport ramp for `--theme-root-size` rendered below the full
  `1rem` base for every viewport narrower than 1280px — sitting at its `0.9rem`
  floor (14.4px) up to tablet-portrait width and only climbing to 15.7px by iPad
  Pro landscape width — so tablets rendered the participant interview at the
  smallest text sizes in the product, with spacing and touch targets
  (checkboxes, radios) shrinking in lockstep below recommended minimum sizes.
  The ramp is now piecewise: phones keep the dense `0.9rem`-floored curve in
  both orientations, tablets (768–1280px) get the full `1rem` base — matching
  the interview's pre-July size and returning default form controls to the 24px
  WCAG 2.5.8 minimum — and displays at 1280px and above are unchanged.

  The interview theme also gains a 16px font-size floor for text-entry elements
  (text inputs, textareas, selects, and rich-text editors), expressed as
  `max(16px, 1em)` so explicitly larger sizes pass through. iOS Safari zooms the
  page when a focused editable element renders below 16px; with the phone-width
  type scale this made every form field a zoom trigger in browser hosts. Editable
  text in the interview now never renders below 16px at any viewport size. To
  support this, `SegmentedCodeField` now carries its text-size class on the
  segment group wrapper (segment inputs inherit), so the floor preserves its
  `lg`/`xl` sizes; computed sizes are unchanged.

- b95af22: Virtualized collection measurements now invalidate when a themed region's
  type scale changes while mounted — for example the interview's participant
  text-size control. The re-measure sentinel is sized in the theme's
  `--theme-root-size` unit instead of `rem`, which only tracked the document
  root and missed locally scoped scale changes, leaving stale row geometry.
- cd974f7: TimeAgo now renders its relative timestamp in the very first frame. It
  previously mounted empty and filled in a moment later (both its own state and
  the SSR wrapper resolved in effects), so any re-render that recreated the
  element — selecting a data-table row, for example — made the value's width
  visibly collapse and re-expand.

## 5.0.2

### Patch Changes

- fde9bb4: Make animation-aware components consistently respect disabled and reduced motion, and advance Dyad Census and Tie Strength Census immediately after committed answers when motion is disabled.

## 5.0.1

### Patch Changes

- 8effa31: `BooleanField` now honours the `negative` flag on a boolean option. Selecting an option marked negative styles its border and indicator in the destructive colour instead of the primary one; unselected options are unchanged. Previously the flag was accepted by the protocol schema and written by Architect, but ignored at render time.

## 5.0.0

### Major Changes

- a33e3cf: `@codaco/fresco-ui` no longer exports `addDays` from `./form/utils/ymd`. `RelativeDatePickerField` derived its window through it directly; that stopped when it moved to `dateWithinPickerRange` (`@codaco/shared-consts`), which was `addDays`' last caller inside this repo. `todayYmd` is unaffected and still exported from the same subpath.

  If you imported `addDays` directly, replace it with your own `YYYY-MM-DD` arithmetic, or with `dateWithinPickerRange`, `DATE_PICKER_EARLIEST_DATE`, and `DATE_PICKER_LATEST_DATE` from `@codaco/shared-consts` if what you needed was a date held inside the range a date field can represent.

### Patch Changes

- 59625a8: The defaults a date field falls back on, when a protocol declares no bounds of its own, now live in one place.

  `@codaco/shared-consts` exports `DATE_PICKER_DEFAULT_MIN`,
  `DATE_PICKER_EARLIEST_DATE`, `DATE_PICKER_LATEST_DATE`,
  `RELATIVE_DATE_PICKER_DEFAULT_BEFORE`, and
  `RELATIVE_DATE_PICKER_DEFAULT_AFTER`. `@codaco/fresco-ui` renders its date
  fields from them, `@codaco/interview` derives the bounds a submitted date is
  validated against from them, `@codaco/protocol-validation` models those bounds
  when detecting contradictions, and `@codaco/protocol-utilities` generates
  synthetic dates to fit them. Each package previously kept some local copies and
  tested only those copies, so widening or narrowing a bound in one place could
  leave another package predicting a window that no longer existed. No default
  or limit has changed value, and generated data is unchanged.

  `@codaco/protocol-utilities` additionally exports `todayYmd`, the clock read behind `GenerationConfig.today`'s default.

- a124bc0: The date picker's year and month dropdowns now decide what "today" is the same way the rest of Network Canvas does.

  When a date question sets no latest date, the picker stops offering dates after today. It worked out today from the device's own clock and timezone, while every other part of the software — including the relative date picker beside it, and the dates generated when you preview a protocol — works it out in UTC. For part of each day the two disagreed, so a participant west of UTC could be offered a month that had not started elsewhere, and one east of UTC could be shown a month the rest of the software still considered next month. Both now agree.

- 1b4dc6b: `FieldErrors` accepts a new opt-in `variant` prop (`'text'` | `'box'`,
  defaulting to `'text'`). `variant="box"` applies the same boxed destructive
  treatment the `interview` theme already renders automatically — a rounded
  destructive background with contrast text — regardless of theme, for hosts
  that render field errors on a colored background where plain destructive text
  would have poor contrast.
- 86603b4: Fix `DatePicker` becoming unanswerable, or silently collapsing to a single
  forced value, when only one of `min`/`max` is authored outside the default
  1920-to-today window (for example a `year` picker with only `max: '1800'`,
  or only `min: '3000'`). The year dropdown, the month dropdown's
  boundary-year filtering, and the full-resolution date input's `min`/`max`
  attributes now all resolve from a range that extends the missing bound past
  the authored one by the default window's own span (today's year minus
  1920), so the control always offers a genuine multi-value range rather than
  clipping to nothing or pinning to one option. Pickers with no authored
  bounds, or with both bounds authored, are unaffected.

  Also clamp that extended bound, for the year/month dropdowns only, to the
  four-digit year range (1000-9999) those controls can actually store (they
  emit an unpadded `y.toString()`): an authored bound near either edge — for
  example `max: '1000'` or `min: '9999'` — no longer synthesizes a three- or
  five-digit far bound the dropdown would offer but the protocol schema could
  never validate. An authored bound itself is left exactly as authored. The
  full-resolution date input's `min`/`max` attributes are unaffected by this
  particular clamp, since `formatYmd` always zero-pads to four digits and so
  stays schema-valid at any magnitude.

  Separately, also clamp the full-resolution date input's own synthesized
  `min`/`max` to the four-digit year range (0001-9999): an authored bound near
  either edge — for example `min: '9999-12-31'` alone — previously synthesized
  a five-digit far bound (around year 10105) that the native input accepted
  but that `useProtocolForm`'s min/max validation could never pass, since it
  compares against the authored bound using four-digit lexical string
  comparison and a five-digit year always sorts before it. That left the
  in-window value as the only ever-submittable answer despite a much wider
  range appearing pickable. The synthesized bound is now clamped to
  0001-9999, so an authored `min: '9999-12-31'` alone now resolves to the
  single genuinely-submittable day rather than a wider, trap-filled one. This
  is a distinct concern from the year/month dropdowns' clamp above (native
  input/validator legality, not dropdown storage grammar), so the two clamp
  to different four-digit ranges.

  Validation hints also preserve authored years from 0001 through 0099 instead
  of displaying them as years 1901 through 1999.

- fd78d55: Fix form controls disappearing when content is added below them. A field's query
  container and its sibling-dependent spacing shared one element, so inserting a
  sibling after a field could leave its control with no layout box at all —
  present but invisible and unusable.
- b777dc1: The Categorical Bin "other" input and the Name Generator quick-add field now apply the referenced variable's configured validation rules, exactly as form fields do — including context-dependent rules such as `differentFrom` and `unique`. The Network Composer's add-node input applies the quick-add variable's codebook rules in the same way, a behaviour change for existing protocols whose quick-add variable carries validation. Previously these inputs ignored the codebook and enforced only their local requirements. In native v8 protocols, both Categorical Bin "other" and Name Generator quick-add are optional when their referenced variable has no required validation. The v7→v8 migration adds `required: true` to variables referenced by either writer, preserving existing protocols' required responses while retaining their other validation rules. Variables without an explicit input `component` work correctly. After a valid Network Composer node is added, its quick-add field now resets its value and validation state so the fresh blank entry does not announce a required-field error.

  Network Composer also waits for a quick-add node to finish being stored before
  clearing and reopening the input, preventing two rapid submissions from
  bypassing uniqueness validation against the first node.

  The Categorical Bin dialog registers its response under the referenced
  codebook variable ID, so a sibling variable literally named `otherVariable`
  cannot be mistaken for the live response by cross-variable validation.

  Deferred invalid-field focus now remains safe when its form unmounts before
  smooth scrolling finishes.

- 1a3fe60: Improve node entry and display across interview interfaces. Synthetic `name`
  variables now use realistic personal names whenever their validation rules
  allow it, long labels wrap and truncate without distorting node shapes, and
  Network Composer quick add retains focus after submitting a node. Shared modal,
  form-field, and theme refinements support the updated Architect editing
  experience.
- efc3a92: A relative date question anchored near either end of the calendar no longer refuses every date it offers.

  A relative date question works out the dates it accepts by counting days forward and back from an anchor. With an anchor late in the calendar that count could pass the year 9999 — an anchor of 9999-12-31 accepting one day after it worked out a latest date of 10000-01-01 — and with an early anchor it could pass year zero, working out 0000-07-05 or, further back, something that was not a date at all. Neither is a date the software recognises, so the check on what a participant entered stopped comparing dates and compared plain text instead, where a five-digit year sorts before every four-digit one. Every date the question could offer was then rejected as too late, including the one the participant had just chosen. Both ends of the window now stop at the first and last dates a date field can hold.

  `@codaco/shared-consts` exports `dateWithinPickerRange`, `DATE_PICKER_EARLIEST_DATE` and `DATE_PICKER_LATEST_DATE`. The field in `@codaco/fresco-ui`, the submission checks in `@codaco/interview` and the synthetic dates drawn by `@codaco/protocol-utilities` all work the window out from that one function, so the three cannot disagree about it. Questions anchored anywhere else are unaffected, and generated data for them is unchanged.

- 7cffcc9: Synthetic interview data now respects the validation rules configured on your variables.

  Previously, generated networks ignored the rules a protocol author sets in Architect, so previewing a protocol or bulk-generating interviews could produce data a participant could never have entered — names shorter than a required minimum length, numbers outside their permitted range, dates outside a date picker's window, duplicate values on a variable marked unique, or a "start date" later than the "end date" it is required to precede. Generated values now satisfy required, minimum/maximum length, minimum/maximum value, minimum/maximum selected, unique, same as, different from, and the greater/less than (or equal to) cross-variable comparisons, as well as the bounds a date picker or relative date picker imposes.

  Where rules refer to one another, generation follows that order, so a variable compared against another is filled in after the variable it depends on.

  If a protocol's rules cannot all be satisfied at once — for example a minimum length greater than its maximum length, a permitted range with no values in it, or a variable required to be both unique and drawn from fewer options than there are entities to fill — generation is now refused with a `SyntheticDataConstraintError` that names the variable and describes the conflict, instead of silently producing data that could never be collected. `SyntheticDataConstraintError` and the `ConstraintConflict` type it carries are exported from `@codaco/protocol-utilities`.

  When skip logic and filtering are respected, controls on stages proven unreachable no longer create synthetic-data rendering conflicts with reachable Network Composer stages.

  Read-only stage references no longer make validation rules apply to values written only by binning stages. Writers on stages proven unreachable by skip logic are likewise ignored consistently by both the feasibility check and the synthetic draw.

  Manually seeded nodes and edges keep omitted Boolean attributes at the neutral
  `false` value regardless of how the control's options are ordered.

  When multiple reachable Network Composer stages render one date variable at the
  same resolution, generation now uses the intersection of their accepted
  windows. It refuses only controls at incompatible resolutions or controls whose
  windows do not overlap. When an ordinary form also renders that variable,
  generation includes its codebook control in the same intersection.

  Categorical Bin "other" inputs must now target a text variable, matching the
  text field the interview renders. Importing a version 7 protocol removes an
  incompatible non-text "other" configuration instead of preserving a control
  that cannot record the target variable's value.

  `@codaco/fresco-ui` adds a `./form/validation/helpers` export subpath so consumers can build the same validator stack the interview uses. `@codaco/interview` now fails loudly, naming the variable, when a protocol carries a validation rule of the wrong type, rather than passing it to a validator that would report a generic error.

- 457052e: `Toast`'s description no longer grows without limit. A toast is anchored to the bottom of the screen and grows upward, so a consumer rendering a lot of content (a long message, a list of errors) could push the toast's own title and Close control off the top — clipped by the browser window with no way to read or dismiss it. The description is now capped and scrolls internally instead, keeping every toast's title and Close control on screen and reachable regardless of how much content it renders.

## 4.2.0

### Minor Changes

- 711c77a: Add raised buttons, uppercase text styling, larger heading variants, and the supporting shared type-scale tokens for expressive product pages. Add the accessible Definition tooltip for inline terms, including touch activation.

### Patch Changes

- 06aa4a6: Allow Definition popovers to contain keyboard-accessible links and controls.
- a3585a2: RelativeDatePickerField now forwards the id supplied by Field to its native date input, restoring the label/input association so screen readers announce the field's label when the input receives focus.

## 4.1.2

### Patch Changes

- 72adf34: Improve the shared site navigation software menu with roomier spacing and app icons for every destination.
- cdce0c2: Rename the shared site navigation "Docs" link to "Documentation".
- a95c5e8: Reveal the software destinations in the shared site navigation with a staggered animation, keep the dropdown stable while it closes, and respect reduced-motion preferences.
- 10e9fba: Toggle button labels no longer paint over content stacked above them. Their text sat in the same stacking context as the surrounding page rather than being scoped to its own button, so a form's pinned header could be overlapped while scrolling.

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
