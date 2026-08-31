# @codaco/architect

## 8.2.1

### Patch Changes

- 2f8fcdc: Make app updates reliable without reloading open work automatically. Fresh launches now activate an available update before the interface appears, updates found after rendering wait for an explicit install action, and the post-reload state reliably links to the release notes.
- Updated dependencies ([2f8fcdc](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2f8fcdc0c202678060501d2942645462c9cca77b), [301e8fe](https://github.com/complexdatacollective/network-canvas-monorepo/commit/301e8fefdf74b563545ef9c1ac3a0dd098a14bbc))
  - @codaco/fresco-ui@6.2.0

## 8.2.0

### Minor Changes

- Architect's editors now use the shared Fresco UI form system instead of redux-form.

  - Fields have consistent labels, descriptions, required states, and errors that are announced with the control and focused when saving is blocked.
  - Disabling a feature or changing a roster, entity type, or source stage clears settings that no longer apply. These multi-field changes are recorded as one Undo step rather than a sequence of invalid intermediate states.
  - Repeated sections and editor dialogs retain the correct options, identifiers, and values when items are added, removed, reordered, or reopened. Newly created variables and entity types start clean instead of inheriting the previous editor's state.
  - Unsaved edits are detected when navigating, refreshing, closing the browser, or applying an app update. Undo and Redo also cover collapsed sections, backgrounds, side panels, and automatic stage naming.
  - Half-finished sort, display, assignment, and option settings can no longer be saved as a misconfigured protocol.

  Existing protocols containing option values with spaces or blank display labels must be corrected before those variables can be saved. Changing an option value also changes its column name in exported data, so projects already collecting data should choose the replacement carefully.

- 4dcd18f: Architect's form field editor now uses a two-pane workspace. Field settings remain on the left while a live participant-facing preview on the right shows the current input control, interview theme, and validation behaviour. The panes begin at an even split and can be resized, while narrower windows switch cleanly to a stacked layout.
- c37a801: Applications now derive their protocol schema compatibility from the interview runtime they embed, instead of hard-coding a version number, and each application can upgrade stored protocols when a future schema version ships.

  - `@codaco/interview` exports its supported protocol schema version as `COMPATIBLE_PROTOCOL_SCHEMA_VERSION` (from `@codaco/interview/protocol-schema-version`). Fresco and Interviewer read it for import limits, stored-data migration, and interview payloads; Architect derives its own compatibility from `@codaco/protocol-validation` directly.
  - Interviewer checks stored protocols at launch. A protocol saved under an older schema version is migrated, re-identified under its new content hash, and its interview sessions and media follow it in a single transaction, with a notification when this happens. A protocol that cannot be migrated is left untouched, with a message directing you to repair it in Architect.
  - Architect upgrades a library protocol automatically when you open it, with a notification, leaving the protocol untouched if the upgrade cannot complete. Protocols made with a newer version of Architect are refused with an explanation instead of opening incorrectly.
  - Fresco's deployment migration targets the runtime's supported version rather than a fixed number, and an interview can no longer start from a protocol stored under a version the runtime does not support — it reports the mismatch instead.

  Nothing changes for existing data today — every stored protocol is already at the current schema version. This machinery exists so a future schema version change cannot orphan interview sessions or mislabel stored protocols.

### Patch Changes

- e9a6522: Undo and Redo now remain keyboard-focused when the control becomes unavailable at the end of the protocol history, so the next key press no longer starts again at the top of the page.
- 17aeca4: Architect and Interviewer now load analytics and automatic error-reporting modules through the Network Canvas relay without Content Security Policy errors.
- c599dac: This release improves the reliability, accessibility, and recovery of protocol editing in Architect.

  - Stage edits are now transactional: cancelling restores Codebook changes, incomplete settings remain open with actionable errors, and Information blocks retain their drafts while switching media types.
  - Forms, rule builders, the Codebook, timeline, dialogs, and resource library now provide accurate labels, keyboard operation, focus restoration, and layouts that work on smaller screens. Undo and Redo operate one change at a time without recording no-op edits.
  - A second tab now shows a read-only protocol instead of accepting changes it cannot save. Closing the editing tab restores editing from the saved copy, and deleting a protocol clears its history and releases associated resources.
  - Protocol names, resource cards, variable identifiers, and stage editors are bounded on narrow screens. Duplicate resource filenames are distinguishable without changing the names stored in the protocol.
  - Invalid imports, blocked edits, migration conflicts, preview completion, and deleted protocol routes now explain what happened and provide a safe recovery path.
  - Recent protocols in the library now show their description, and starter templates show their stage, node type, and edge type counts.
  - The CEGRM starter template now uses an available color for its Narrative Pedigree condition. Protocol colors are constrained to typed node, edge, ordinal, or categorical palette references; Narrative Pedigree and Geospatial resolve those references through the active theme. A protocol created from the previous release's CEGRM template will report a validation error on its condition color — open the stage editor and select one of the available colors to fix it. A downloaded protocol file with this problem must be corrected before it can be imported again. Neutral dialog actions remain distinct from white dialog surfaces.

- e5d4fd3: A stage name longer than the width of the stage editor's heading was cut off at the right-hand edge, with nothing to show that more of it existed. Long names now wrap onto as many lines as they need, and stay editable in place.
- 2d59b10: Standardize Architect editor settings into single-panel sections with concise headings, guidance, and field labels, including collapsible settings that discard their values when closed. Give repeated form items and their nested sections a consistent slate-blue accent surface hierarchy. Size attribute pills to their labels by default, with container and Tailwind maximum-width constraints for narrow and printable layouts.
- b51ef59: Prevent malicious form field paths from modifying object prototypes while preserving dotted protocol variable identifiers and nested field namespaces.
- 43c7746: Fresco UI now owns two answers its consumers were each working out for themselves.

  **`stripManagedProperties`.** `ArrayField` adds its own bookkeeping properties to every item it hands out, and a consumer that saves an item has to take them off first. Three consumers were doing that with their own inline copy of the list, each frozen on the properties that existed when it was written — so a property added to `ArrayField` would have started arriving in saved data. The strip is now exported from `@codaco/fresco-ui/form/fields/ArrayField/ArrayField` and derived from the property definitions themselves, and adding a managed property without listing it is a compile error.

  **`selectIsFormDirty`.** Exported from `@codaco/fresco-ui/form/store/formStoreProvider`, this answers whether a form currently holds values that differ from the ones its fields registered with. It is a live comparison, unlike the `isDirty` flag beside it in the same store, which is set by the first keystroke and cleared only by a reset — so anything guarding unsaved work on that flag keeps asking about a form the person has already put back by hand, and treats a form that normalised its own values at mount as edited before it was touched.

  No visible change for anyone using Architect: it consumed both from its own copies and now consumes them from here.

- 59f131c: Fixes interactions that were advertised to assistive technology but did nothing when activated.

  `ArrayField` now omits `onDelete`/`onEdit`/`onChange`/`onUpdate` (and the editor's `onSave`) entirely while disabled or read-only, instead of substituting no-op stand-ins. An `itemComponent`/`editorComponent` that renders its edit/delete/save affordance from handler presence — the normal pattern — now correctly hides that affordance rather than drawing a live-looking control wired to nothing.

  `SegmentedToolbar`'s toggle and group segments now forward `onPressedChange`/`onValueChange` straight through to Base UI, the same way button segments already forward `onClick`. This also fixes those callbacks silently losing Base UI's `eventDetails` argument, which a consumer needs to veto a change via `eventDetails.cancel()`. A controlled toggle or group segment supplied without its change callback — which can never change state once controlled — is now disabled outright instead of staying tappable for nothing.

  Architect's library panel gallery promo card no longer announces itself as a selectable option — clicking or activating it never did anything, since the collection it sits in doesn't support selection. It's now rendered as its own labelled group alongside the templates list rather than as one of the list's items, so its Dismiss button and gallery link stay independently operable without the collection's listbox/option structure being misapplied to a card that isn't a selectable option.

- 7be223c: Interface cards in the "Select an Interface Type" dialog are now announced by
  their interface name alone. Each card previously announced its title twice,
  followed by its whole description and every capability tag, as one unbroken
  button name — so moving through the dialog with a screen reader meant hearing a
  paragraph per card before reaching the next name. The description and tags are
  still announced, as the card's description, after its name.
- 06d26fb: Display complete attribute names in pickers whenever the available field width can accommodate them.
- 54650ab: Prevent null form field values from crashing Architect when changing the node type of configured ordinal or categorical bin stages.
- Updated dependencies ([c599dac](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c599dacf78b18efb7d0c5c5fad4d38644a57e775), [9a34469](https://github.com/complexdatacollective/network-canvas-monorepo/commit/9a3446969d5fcc7a3640d8eb5597f807a4fee810), [e3e7b2c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e3e7b2c9cfbc1758754afc0c3959c50ae6518363), [eec63f8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eec63f8c62bd6cfb030c88e396933c4aab384be9), [3e10128](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3e10128db1d1a1abc56f8293d66bf9f7dd75c722), [b51ef59](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b51ef598343c67c95edd4e165c0bac91a7a82571), [43c7746](https://github.com/complexdatacollective/network-canvas-monorepo/commit/43c774665b781cb5cc71acf8ed8c8ca48838ca64), [eb73319](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eb7331942683e879328530e997e554fb12fef52a), [e08ebbf](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e08ebbf8547c2507f5f2a37f7cbab1169dd392cd), [88d7db0](https://github.com/complexdatacollective/network-canvas-monorepo/commit/88d7db04ea3ba323be2fb18f55f6b11d6274740f), [ae3c616](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ae3c616ed4edc55c294be9097e4ae724b249601e), [e9a6522](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e9a652266ef9ddfa7fc42de1c8123bd7011c52a1), [23d0fab](https://github.com/complexdatacollective/network-canvas-monorepo/commit/23d0fab63d4de8da1ba3574cb151ac1c76580d9a), [59f131c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/59f131c2af206c8b1f668b90edf21fbcb3b0b7b7), [06bc1e9](https://github.com/complexdatacollective/network-canvas-monorepo/commit/06bc1e991df40ab3e115da361cfe0ebfe391bbd8), [bd06a52](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bd06a5256b64b82b2718c15b6d3bc825b4ba95c5), [7ca985f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7ca985fe57ca03dda02a96a6013c5dac55dc0123), [c78135c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c78135cd461d1e482ce248b1eb6337359bafc189), [dcbc7aa](https://github.com/complexdatacollective/network-canvas-monorepo/commit/dcbc7aad21ec995bf3a598eb5b208a681789eb4f), [4ea26a7](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4ea26a74dfab5bc02495bc8fa03c31aa5f987dad), [c37a801](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c37a801a3a0a8e6cc82fce3cfe64d031003af207), [0f20ff5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0f20ff594e3fd9b38f393d3d71e9f7bdcc078955), [4a4a9f4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4a4a9f49d4c449e09e07558a0032d6a3b8015743), [fdb3b56](https://github.com/complexdatacollective/network-canvas-monorepo/commit/fdb3b56440f6cad89a44718d24ff725be3bb5e15), [71baa6c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/71baa6c3c376bc287958e5f06659daa1df617e08), [54650ab](https://github.com/complexdatacollective/network-canvas-monorepo/commit/54650ab4bb357d39db88a46f5c3ab8b82375f647), [469d404](https://github.com/complexdatacollective/network-canvas-monorepo/commit/469d4041bd1c86fbfc92eaf2a368f1689858bbd2), [a9825f4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a9825f4067cc6cddd08b64a76e8d88a4b96ae998), [1391fa8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1391fa879011e988a1e8c250a4c80a96797d5d47), [f03b1e4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f03b1e45f425cf3c97ba2137765073a462ee9c9f))
  - @codaco/interview@9.0.0
  - @codaco/protocol-utilities@4.0.0
  - @codaco/protocol-validation@13.0.0
  - @codaco/fresco-ui@6.1.0
  - @codaco/tailwind-config@1.3.0
  - @codaco/shared-consts@6.0.0

## 8.1.0

### Minor Changes

- fec9536: Add a Colored Eco-Genetic Relationship Map (CEGRM) template for families living with an inherited condition. It combines a family pedigree with the participant's wider social network, records relationship closeness and contact frequency alongside exchanges of information, practical help, emotional and spiritual support, and closes on a visual map and an inheritance view.

  Treat the Family Pedigree node label as a validated codebook field, apply its rules to every family-member name entry point, and expose those rules beside the label-variable selector in Architect. Keep the iconically rendered ego node outside label and additional family-member form collection, including in synthetic previews. Reduce the default synthetic Sociogram edge density so preview networks remain legible as their node count grows.

  Keep optional unique fields empty without false duplicate errors, scope comparison rules to the active field namespace, and prevent dormant or duplicate pedigree name controls from affecting validation.

### Patch Changes

- 52a3fbb: Honor reduced-motion preferences in Architect and expose a shared provider for disabling Motion and Base UI animations together in automated hosts.
- d5723ec: Prevent the Sociogram editor from showing Finished Editing until the stage has actually changed.
- e349137: Update runtime dependencies to resolve security vulnerabilities in analytics sanitization, uploads, and form state handling.
- 8920223: Add a default-off Respect skip logic preview setting so disabled previews show every stage and enabled previews retain routing after the initially force-shown stage.
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

- Updated dependencies [52a3fbb]
- Updated dependencies [fec9536]
- Updated dependencies [90e0178]
- Updated dependencies [90e0178]
- Updated dependencies [e349137]
- Updated dependencies [13e5e99]
- Updated dependencies [673d5f3]
- Updated dependencies [ea06b66]
  - @codaco/fresco-ui@6.0.0
  - @codaco/interview@8.0.0
  - @codaco/protocol-utilities@3.2.1
  - @codaco/protocol-validation@12.1.1

## 8.0.2

### Patch Changes

- 3c8fe35: Generate realistic, source-backed family pedigrees with reproductive scenarios and multi-generational disease lineages, while respecting each stage's collected variables, keeping pedigree membership isolated from other interview stages, correctly rendering shared and multiple unions, widening partnership response columns, and warning participants before discarding onboarding progress.

  Improve pedigree editing and parentage capture by confirming destructive deletions, preserving biological-sex values, allowing current/ex-partner status changes, and recording reproductive roles independently from sex recorded at birth.

- Updated dependencies [3c8fe35]
- Updated dependencies [fa88ae4]
- Updated dependencies [2325d34]
  - @codaco/protocol-utilities@3.2.0
  - @codaco/fresco-ui@5.1.0
  - @codaco/interview@7.1.1
  - @codaco/shared-consts@5.6.1

## 8.0.1

### Patch Changes

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

- Updated dependencies [ea589ec]
- Updated dependencies [48572ed]
- Updated dependencies [8ff0e2d]
- Updated dependencies [c5f30fd]
- Updated dependencies [8ff0e2d]
- Updated dependencies [b95af22]
- Updated dependencies [66da138]
- Updated dependencies [d985cd3]
- Updated dependencies [cd974f7]
  - @codaco/fresco-ui@5.0.3
  - @codaco/interview@7.1.0
  - @codaco/tailwind-config@1.2.2
  - @codaco/protocol-utilities@3.1.1

## 8.0.0

### Patch Changes

- cd88c3e: Architect 8 and Interviewer 8 are now stable releases. Future app versions follow standard semantic versioning and deploy to production when the Version Packages release PR is merged.
- Updated dependencies [fde9bb4]
  - @codaco/fresco-ui@5.0.2
  - @codaco/interview@7.0.2

## 8.0.0-beta.13

### Patch Changes

- Marking a boolean option as negative now takes effect during an interview — the option is shown in red once a participant selects it. The BooleanChoice help text has been corrected to describe what participants actually see.

## 8.0.0-beta.12

### Minor Changes

- Improve variable pills with clearer static and editable states, full-name details, and a focused variable rename workflow.

### Patch Changes

- Polish stage editing and preview workflows across Architect. Variable, subject,
  color, and shape pickers now share consistent field styling; variable pills
  offer a clearer accessible rename interaction; quick-add and categorical-bin
  variables expose their validation rules; and newly created quick-add variables
  are required by default. The stage editor now avoids false unsaved-state and
  preview-settings transitions, while preview-only notices and the obsolete
  relationship question in the Life Transitions template have been removed.
- Fix being able to save an option that has no label or no value. Confirming an
  option you had not filled in used to collapse it into the list with nothing to
  show it was incomplete, leaving a protocol that failed validation later. The
  option's editor now stays open and marks whichever field is still missing, and
  an options list containing an incomplete option says so.
- Fix the Input Control picker vanishing after you choose an input control for a
  newly created variable, which left the field impossible to complete.
- Previewing a protocol whose validation rules cannot all be satisfied now
  explains why. The preview lists each clash — naming the entity type and the
  variables involved, and describing the conflict — so you can go back, correct
  the rules, and preview again. Previously this showed the same generic
  "couldn't build the preview" screen as any other failure, with a "Try again"
  button that could only fail in exactly the same way.

  A preview that fails to rebuild also clears what was on screen, so an earlier
  successful preview is never left showing as though it were the protocol you
  just changed. Each attempt reports only its own reason for failing: a list of
  rule clashes from an earlier attempt is never left up next to a failure that
  had nothing to do with those rules, and a slow protocol that arrives after the
  preview has given up waiting now reports what actually happened to it — the
  rule clashes to correct, or the preview itself — instead of continuing to
  blame the connection to Architect.

- Fix a link that spans bold, italic, and plain text being saved as several
  separate links. Adding one link across mixed formatting used to write out one
  link per run of formatting, so a single citation became three links to the same
  place — three things to hover, three underlines, and three links announced by a
  screen reader. Such a link is now saved as one link, and the affected references
  in the Life Transitions template have been repaired.
- Prevent invalid protocol edits from being saved, and require authors to revert or return to the start screen before continuing.
- The variable validation editor now prevents contradictory rules at authoring
  time: contradictory drafts cannot be saved and explain why, reference pickers
  only offer targets that keep the rules satisfiable, the whole field dialog is
  checked on save (e.g. deleting an option out from under `minSelected`), and a
  hint appears when `unique` is applied to a variable with only a few possible
  values. Codebook edits are also checked against the current shared form and
  every NetworkComposer stage-effective control overlay, and integer validation
  bounds reject fractional values directly in the editor. Network Composer group
  variables are kept separate from validated form fields, including in the Life
  Transitions template.

  Relative date anchors in years 0001 through 0099 now remain selectable and
  valid in the editor, matching the protocol schema and interview runtime.

- Keep the confirm and cancel buttons reachable when renaming a variable with a long name.
- Variable pickers no longer offer variables that would end up written both with and without validation: form-field pickers exclude variables already written by a bin, sociogram highlight, census, or other direct writer, and those stages' pickers exclude form-collected variables (the current selection always stays available). Saving a stage that would create such a pairing is refused with an explanation of why, including conflicts between a Name Generator's still-unsaved form fields and prompt assignments. Protocols that already contain one show a warning on the protocol timeline listing each affected variable and the stages involved, with a badge on the Stages tab — nothing blocks opening, editing, or exporting. Newly created "other" and quick-add variables default to required.

## 8.0.0-beta.11

### Patch Changes

- Refine the Codebook screen layout: the search bar, entity tables, and the
  unused-variables alert now share a single width; the "Show unused only" toggle
  moves onto the search row with its label beside the checkbox; and there is more
  separation between entity types and between individual entities.
- Fix two variable dropdowns that could produce protocols failing validation. The
  sort-order rules for the sociogram bucket and bin (ordinal bin, categorical bin,
  and one-to-many dyad census) now offer Ascending/Descending in the direction
  dropdown instead of a list of variables. Scalar (visual analog scale) variables
  now offer only the validation rules that scale supports — Required alongside the
  comparison rules — and no longer offer "must be unique", "different from", or
  "same as", which the schema has never accepted for a scale.
- Reduce spacing around editable list item previews.
- Protocol previews now reflect the refined interview typography, which scales
  smoothly with the window size instead of stepping between fixed sizes.
- Use medium-sized edit and delete buttons throughout editable lists.
- The installed app's icon now fills its tile on the dock, home screen, and task
  switcher, instead of sitting inside a white border, and renders at a consistent
  size whether the app was installed from Safari or Chrome.
- Protocol validation failures during import and stage preview now show a readable list of problems (one `path: message` line per issue) instead of raw JSON.
- Add the Life Transitions & Turning Points protocol to Architect's built-in templates.

## 8.0.0-beta.10

### Minor Changes

- Open protocol previews in a dedicated window instead of a browser tab. When Architect is installed as an app, the preview opens in its own app window.
- Synthetic preview sessions now draw roster-stage people from the protocol's
  actual roster assets instead of inventing them, so a preview lines up with the
  roster file the way a real interview would. A roster that is missing or
  unreadable — including a half-built draft stage — falls back to generated
  people, so a roster problem never blocks a preview.
- Allow Narrative stages to use custom image backgrounds, accept SVG image resources, preview canvas backgrounds at their full interview size and color, render resource cards responsively with contextual surface shading, and link every canvas background selector to responsive SVG guidance.

### Patch Changes

- Stop the stage editors from silently discarding variable settings they don't manage. Adding an editable attribute to a Network Composer stage no longer clears the input control from the variable in your codebook, which previously broke every other stage that used the same variable. Interface-owned option sets, such as the Family Pedigree biological sex values, also keep their locked state when you edit a form field that uses them.

  Day offsets on a relative date picker can no longer be set to a negative number, and edge rules are no longer offered on side panels that draw their data from an external file, where they can never match. Switching an existing panel to an external file now offers to remove any edge rules its filter already contains.

- Renaming an ego variable to a name already in use now shows an inline "already in use" message on the field, matching how node and edge variables behave. Previously it slipped past the inline check and surfaced a confusing "Misconfigured Protocol" dialog instead.
- Closed several ways a protocol could be left in a state the validator rejects, where saving previously appeared to work but the stage silently reverted:

  - Mapping a variable to a node shape now requires a variable to be chosen, and a breakpoint mapping requires at least one threshold with strictly increasing values. New thresholds start above the previous one, and an incomplete mapping blocks saving with an explanation instead of reverting without warning.
  - Changing the node type of a Family Pedigree stage is now blocked, with an explanation, while a Narrative Pedigree stage depends on it — preventing a broken reference to a variable that no longer exists on the new type.
  - The map stage now reads feature properties from every feature in a GeoJSON file rather than only the first, so the property selector appears whenever any feature has properties. When no feature has any, saving is blocked with a clear message rather than failing validation later.
  - The codebook's "used in" display now names shape settings as a place a variable is used.

- Make Architect's large startup spinner match the motion and colours of the loading indicator used throughout the app.
- Fix the loading spinner covering the protocol upgrade dialog, which made the "Create upgraded copy" button unclickable when opening an older protocol.
- Fix the update dialog so Install and reload opens the new version immediately and shows progress while the update is applied.
- Clarify that protocols and settings are saved locally on this device, whether Architect is open in a browser tab or installed as an app.

## 8.0.0-beta.9

### Patch Changes

- Prevent the browser Back button from opening an empty, invalid protocol after returning to the start screen.
- Bundled template protocols now set an explicit dialog title on their name
  generators ("Add Person") and an explicit scale color and canvas background
  where these were previously implicit defaults, so they satisfy the tightened
  protocol schema.
- Ensure automatically generated stage names start with a capital letter when they begin with user-defined text.
- Add a “Return and download now” option when leaving the protocol editor, so researchers can download the active protocol and return to the start screen in one step.
- Remove the redundant skip-destination note from timeline stages while retaining the skip-logic icon.
- Show browser-specific protocol storage risk in the install banner, request
  persistent storage after the first user interaction, and keep the Install action
  matched to the warning level.

## 8.0.0-beta.8

### Minor Changes

- Let researchers choose where an interview continues when a stage is skipped:
  the next available stage, a specific later stage, or the interview finish
  screen.
  Architect now shows these routes in the timeline and protocol summary and
  protects referenced destinations from invalid deletion or reordering.
  Preview only applies its one-stage skip override when routing could actually
  make the selected stage unavailable.
  The bundled Mental Health Networks and Transnational Networks templates now
  collect explicit consent and route declined consent to the finish screen.

  Interviewer follows the live route as answers change, keeps unavailable screens
  from flashing during recovery, and allows a skipped or bypassed screen to be
  opened once after confirmation.

### Patch Changes

- Show the install prompt with a warning palette, restore the Home screen action hierarchy with medium sea-green Create and slate-blue Open buttons, and keep filled Download and Finished Editing toolbar actions sea green when hovered.
- Update Architect action toolbars to use the shared SegmentedToolbar default theme, medium sizing, restrained floating shadow treatment, and explicit colors for primary preview/download actions. Apply the same restrained shadow to the top navigation bar, remove redundant shared theme overrides, set Architect primary actions to sea-green while keeping neutral buttons visually neutral, align timeline row interaction states with the selected token, let shared dialogs keep their default white popover surface, and refactor stage editor sections onto the shared Surface nesting system.
- Migrate Architect's dynamic list editors to fresco-ui ArrayField, preserving Redux Form state, validation, animated rounded dialogs, reordering, limits, dependent controls, and semantic Fresco fields throughout array rows.
- Color and resize Codebook edge type icons to match the selected edge type.
- Fix three protocol-editor bugs surfaced while building end-to-end coverage: selecting a node or edge type no longer clears when the field loses focus; creating an edge type inline within a Tie-Strength Census prompt no longer writes an invalid value that corrupts the codebook; and choosing a roster data source no longer force-expands the optional Search Options section and blocks saving.
- Fix the Family Pedigree stage delete guard. It previously read a pruned stage list that never contained the reference field, so deleting a Family Pedigree stage that a Narrative Pedigree depends on silently did nothing; it now correctly shows a blocking dialog instead.
- Audited and hardened Architect's migration to the fresco-ui field system, and reworked the "map variable to shape" editor.

  Form fixes: clearing a numeric field (e.g. a maximum-alters limit) no longer stores an empty string over the intended empty value; integer fields reject exponent/decimal input that previously stored a silently wrong number; categorical rule operands in filters and skip logic keep their selected values instead of being dropped on save; and dialog editors no longer let a native browser validation bubble pre-empt the styled, scrollable error display. Rule editors, protocol notes and stage previews now render markdown through the shared renderer, and the query-rule editors use a lighter controlled field wrapper.

  Styling and accessibility: field error states use a border cue rather than repainting whole rows, several date and relative-date inputs gained accessible names, and dead legacy styling was removed.

  Map variable to shape: the threshold editor is now a fresco editable list — add, remove, and inline-edit thresholds, capped by the number of available shapes. Threshold inputs are configured per variable type (scalar variables step across their normalised 0–1 range; number variables use their own range). The default-shape row, threshold rows, and shape choosers were restyled to match, with a node-coloured selection ring on the shape and colour pickers.

  Field labels: across the stage and codebook editors, a field label that merely restated its section heading (e.g. a "Prompts" list under a "Prompts" heading, or "Node type" under "Node Type") is now visually hidden while remaining the control's accessible name, so each field is named once instead of twice. Where a section holds several fields, duplicated labels were renamed to add information rather than hidden, and a couple of fields that had an empty or missing label gained a proper accessible name.

- Complete the fresco form-field migration with consistent custom chooser styling and accessibility, reliable validation, and correct add, edit, remove, and reorder behavior.
- Replace additional Architect form controls with fresco-ui field components while preserving redux-form state.
- Move Architect heading and lead text styling onto shared fresco-ui typography components and variants, retire the local heading utility classes from the Architect theme, switch codebook variable tables to the shared DataTable, tune variable pills to match shared button sizing with surface-token colors and an animated accent border, and color the finished editing action sea-green.
- Align the start screen library metadata with the Recent and Templates tabs, restore the panel to the base white surface, and publish that surface color so collection scroll fades match the panel background.
- Fix creating a new layout variable from a Narrative stage preset. The handler destructured a `dispatch` prop that react-redux's object-shorthand `mapDispatchToProps` never provides, so the action threw; it now calls the already-dispatch-bound action creator directly.
- Remove the unintended green tint from tables in printable protocol codebooks while preserving the intended row and column striping.
- Render Resource Library media previews on the interview background so transparent image and video assets keep their interview-time contrast.
- Fixed a range of protocol-editor UI issues:

  - The install banner and the "this protocol is already open in another tab"
    banner now both appear as strips at the top of the screen, with white,
    intent-coloured action buttons.
  - The "Create/Edit Field" dialog is split into distinct sections (Variable,
    Question, Input Control, Categorical/Ordinal Options, Validation), and the
    Validation list now uses inline editing with a collapsed summary per rule.
  - Categorical/ordinal option rows and the protocol description field use cleaner,
    consistent styling with no clashing background or border layers.
  - Empty toggleable sections centre their "enable this feature" message correctly.
  - Selecting a node type for a stage no longer clears itself when you edit another
    field or save, so stages can no longer be saved in an invalid state.

- Use the fresco-ui RichSelectGroup for choosing sociogram background types.
- Show linked text as plain text in item previews to keep it readable against colored backgrounds.
- Use the fresco-ui Likert scale for roster search accuracy settings.
- Load the newest app shell on fresh online launches while preserving the precached offline startup path and keeping in-progress interviews on the active offline-safe shell.
- Improve printed protocol summaries with neutral table colors.
- Replace Architect alert-like panels and editor tips with the shared fresco-ui Alert component.
- Use responsive shared dialogs throughout Architect while preserving Interviewer's purpose-built home modal sizing.

## 8.0.0-beta.7

### Minor Changes

- Add a developer authoring mode for source-linked template protocols, including a toolbar action that saves edited template, sample, and development protocols back to the canonical protocol source package.
- Use the shared rich text editor for protocol text fields and add support for inserting hyperlinks.

## 8.0.0-beta.6

### Minor Changes

- Architect now uses the shared Network Canvas design system — the same theme foundation as Interviewer. Interface elements shared between the apps, including the app update dialog, confirmation dialogs, and form fields, now display correctly. Architect's appearance is otherwise unchanged, with a few small refinements: fonts are bundled with the app rather than loaded from Google Fonts (better offline support and privacy), timeline stage cards show a subtle highlight when hovered, and badge text on dark backgrounds is easier to read.

### Patch Changes

- The Narrative Pedigree stage editor's at-risk help text no longer references the removed "may be affected" (homozygous) marker. At-risk relatives are now described only as "may develop" or "may carry" a condition, and the copy clarifies that a solid, filled symbol indicates a clinically affected individual (per Bennett et al., 2022 nomenclature), so at-risk relatives always appear as unfilled symbols marked with a "?".

## 8.0.0-beta.5

### Minor Changes

- Replace the update toast with a version indicator that shows when an update is available or has just been applied, and displays the release changelog. Updates now apply automatically on a fresh load when no work is in progress.

### Patch Changes

- Fix minor styling from invalid Tailwind classes: button colour transitions, the
  search field's clear-icon colour, and the ordered-list error text colour.
- Close a batch of data-durability, privacy and safety gaps surfaced by the pre-release audit follow-up:
  - **Encrypted variables:** editing a field in the Network Composer or Family Pedigree editors no longer strips the variable's `encrypted` flag.
  - **Analytics privacy:** import-validation failure analytics no longer embed protocol-derived strings (codebook keys, variable names, entered values) — only structural error codes/paths are sent.
  - **Asset export:** distinct assets whose names sanitise to the same archive entry no longer silently overwrite each other, and the primary Download button now warns when a `.netcanvas` is exported with unresolved assets.
  - **Validation timing:** an edit that lands while a validation is in flight is no longer dropped, and auto-undo no longer reverts a valid newer edit or stacks dialogs.
  - **Undo/persistence:** inline-created variables with an invalid name show a friendly error instead of throwing; a mismatched rehydrated protocol id/content pair can't autosave the wrong content into a library row; a `sessionStorage` quota failure now surfaces the storage-unavailable banner instead of silently going in-memory.
  - **Preview:** assets held in the Safari-private in-memory fallback are now transferred to the preview tab, so media/roster protocols preview correctly.
  - **PWA updates:** the update auto-apply now also defers during the autosave-debounce window after a stage edit and during bundled-template imports, so a fresh-load auto-update can't reload mid-write.
  - **Storage GC:** orphaned asset blobs are now removed within a transaction that includes the assets table, so the delete no longer throws and leaves the blob behind.
  - **Stage editor:** a multi-step browser Back from a dirty stage editor now prompts before discarding the draft, and the unsaved-variable dialog confirms before a backdrop dismiss.

## 8.0.0-beta.4

### Patch Changes

- Fixed a memory leak in the protocol summary where an asset preview's object URL was never released if the asset finished loading after the preview had already closed or switched to a different asset.

## 8.0.0-beta.3

### Minor Changes

- Renamed the app from "Architect Web" to "Architect". The browser tab now reads **Architect** and the package is `@codaco/architect`. Your protocols, saved work, and workflow are unchanged.

## 8.0.0-beta.2

### Minor Changes

- You can now work on more than one protocol at a time in separate browser tabs.
  Each tab keeps its own open protocol and edits, so opening a second protocol in a
  new tab no longer disturbs the first, and reloading a tab keeps the protocol you
  were editing. Opening a fresh tab starts at the start screen. If you open the
  same protocol in two tabs, the second becomes a read-only view that tells you the
  protocol is already open elsewhere, so the two tabs can't overwrite each other's
  changes.

### Patch Changes

- Pre-release audit fixes across the protocol designer. Your work is protected in
  more places: the undo history no longer quietly fills up browser storage, an
  interrupted export now tells you which resources were skipped instead of failing
  silently, exported protocols keep same-named resources distinct, and reloading
  for an update warns you before discarding an in-progress edit. Deleting and
  editing entries in the codebook is safer — encrypted variables stay encrypted,
  in-use resources can no longer be removed by mistake, and clearer prompts appear
  when a change would affect another part of your protocol. The Family Pedigree,
  Narrative Pedigree, and Network Composer editors handle diseases, edge types,
  labels, and source-stage changes correctly; Family Pedigree's fixed value sets
  (such as biological sex) stay read-only after they're created; and previewing is
  more robust (clearer errors instead of a preview that never loads). Option labels no longer
  pick up stray blank lines. Privacy is tightened: analytics no longer transmits
  your protocol's text, and a Content-Security-Policy is applied to the deployed
  app.

  Starting up is nicer too: a loading animation now appears while the app opens
  instead of a blank screen, and the "install Architect" banner disappears on its
  own as soon as you install the app, without needing to refresh.

## 8.0.0-beta.1

### Patch Changes

- Fix the Information stage editor producing invalid protocols. Text blocks could previously be resized, which set a display size that is no longer valid for text. Content blocks are now managed as a reorderable list with no limit on how many you can add, and a display size (Small, Medium, Large, or full size) can be set on image and video blocks only.

## 8.0.0-beta.0

- Start of the changeset-driven beta release line.

## 7.0.0-beta.1

### Patch Changes

- Updated dependencies [02c4314]
  - @codaco/fresco-ui@2.12.2
  - @codaco/art@0.1.0

## 7.6.0

### Minor Changes

- 7775d5f: Replace FamilyTreeCensus stage editor with FamilyPedigree, matching restructured protocol schema. The new editor organizes configuration into Node Configuration and Edge Configuration sections, simplifies the census prompt, and generalizes disease nomination prompts into generic nomination prompts.

### Patch Changes

- Updated dependencies [f1dbd8d]
  - @codaco/protocol-validation@11.4.0

## 7.5.2

### Patch Changes

- Updated dependencies [b8b9fb0]
  - @codaco/protocol-validation@11.2.0

## 7.5.1

### Patch Changes

- Updated dependencies [4f2d778]
  - @codaco/protocol-validation@11.1.1

## 7.5.0

### Minor Changes

- 273bcbe: Add optional showTransit and allowSearch configuration options to geospatial interface mapOptions:

  - showTransit: When enabled, Fresco displays transit layers on the map
  - allowSearch: When enabled, participants can search the map for locations

  Both options default to false (disabled).

- Updated dependencies [273bcbe]
  - @codaco/protocol-validation@11.1.0

## 7.4.0

### Minor Changes

- 8f91391: Remove `introductionPanel` from Geospatial interface schema.

  This is a breaking change for existing protocols that include an `introductionPanel` on Geospatial stages. Protocols with Geospatial interfaces no longer support or require an introduction panel.

### Patch Changes

- Updated dependencies [8f91391]
  - @codaco/protocol-validation@11.0.0

## 7.3.0

### Minor Changes

- b713317: Add greaterThanOrEqualToVariable and lessThanOrEqualToVariable validations for number, datetime, and scalar variable types

### Patch Changes

- Updated dependencies [b713317]
  - @codaco/protocol-validation@10.1.0

## 7.2.0

### Minor Changes

- 23b675c: Migrate from direct PostHog usage to @codaco/analytics package for consistent analytics across all Network Canvas apps

## 7.1.0

### Minor Changes

- 01448c8: Split Family Tree sexVariable into egoSexVariable and nodeSexVariable.

  This is a breaking change for existing protocols that reference the old sexVariable field. Protocols with Farmily Tree interfaces require that the egoSexVariable and nodeSexVariable be defined separately.

### Patch Changes

- Updated dependencies [01448c8]
  - @codaco/protocol-validation@10.0.0

## 7.0.3

### Patch Changes

- Updated dependencies [cc2adc3]
  - @codaco/protocol-validation@9.0.0

## 7.0.2

### Patch Changes

- Updated dependencies [9958b67]
  - @codaco/protocol-validation@8.0.2

## 7.0.1

### Patch Changes

- Updated dependencies [84d09e3]
  - @codaco/protocol-validation@8.0.1
