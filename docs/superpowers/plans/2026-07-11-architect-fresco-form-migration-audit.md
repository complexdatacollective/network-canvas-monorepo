# Architect fresco form migration audit

**Date:** 2026-07-11
**Status:** Remediated and verified
**Scope:** Architect Redux Form adapters, all Architect field controls, and the
shared fresco-ui form primitives they consume

## Objective

Audit the completed Architect field migration as a behavior change, not only an
import migration. The acceptance criteria are:

- no obsolete Architect form primitives remain in production use;
- domain-specific controls use the shared fresco field shell and control tokens;
- labels, hints, errors, required state, disabled state, and read-only state are
  exposed consistently;
- typed values survive the Redux Form adapter boundary;
- add, edit, replace, remove, pointer reorder, keyboard reorder, validation,
  submission, cancellation, and undo retain their intended semantics;
- shared form controls behave correctly when used outside Architect too.

## Workflow used

The audit was divided into independent workstreams and then recombined for an
integration review:

1. Inventory every Architect field import, raw form element, custom picker, and
   Redux Form array callsite.
2. Audit the Redux Form-to-fresco scalar adapter and shared fresco field store.
3. Audit all collection operations and Redux Form metadata through FieldArray.
4. Migrate obsolete controls and adapt domain-specific controls.
5. Add behavior-first tests at the shared component, adapter, and Architect
   workflow levels.
6. Run typecheck, lint, dead-code analysis, full tests, and browser-based smoke
   testing.
7. Review the combined diff independently before release preparation.

The reusable inventory commands are:

```bash
rg -n "components/Form/Fields|ValidatedField|FieldArray|redux-form" apps/architect/src -g '*.ts' -g '*.tsx'
rg -n "<input\b|<textarea\b|<select\b|<button\b|role=\"button\"" apps/architect/src -g '*.tsx'
rg -n "Form/Fields/(Text|TextArea|Search|Radio)|Form/FieldError" apps/architect/src -g '*.ts' -g '*.tsx'
node -e "const p=require('./packages/fresco-ui/package.json'); console.log(Object.keys(p.exports).sort().join('\n'))"
```

## Migration result

### Removed obsolete controls

The Architect-local `Text`, `TextArea`, `Search`, and `Radio` field components,
along with the single-error `FieldError` component, were removed. Their callers
now use fresco controls or the shared multi-error renderer. No production import
of those legacy fields remains.

Redux Form itself remains intentionally. Architect relies on its selectors,
nested editor forms, dispatch actions, and FieldArray API. `FrescoReduxField`
and `FrescoReduxArrayField` are the supported migration seams.

### Domain-specific controls retained as adapters

These workflows are still Architect-specific, but now use the fresco field
shell, tokens, and accessibility contract:

| Control                     | Why it stays local                                     | Shared behavior now used                                                        |
| --------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Variable picker             | Codebook lookup, variable creation, spotlight workflow | label/hint/error shell, required state, disabled/read-only state, input surface |
| Entity-type picker          | Codebook previews and destructive-change confirmation  | radio-group semantics, field shell, shared buttons, error state                 |
| Color picker                | Protocol palette tokens                                | radio-group semantics, field shell, input surface                               |
| Resource picker             | Asset-browser workflow and previews                    | field shell, shared buttons, type-specific accessible labels                    |
| Shape picker                | Network Canvas node preview                            | radio-group semantics, field shell, selected state                              |
| Icon picker                 | Large searchable custom/Lucide catalogue               | fresco combobox styling, search input, popup surface, field shell               |
| Native select creation flow | Create/cancel/validate/untouch behavior                | native select and input controls, shared errors and buttons                     |
| Rich text                   | Markdown storage adapter                               | fresco TipTap editor, field shell, focus/blur/read-only behavior                |
| Data source                 | Interview-network versus asset workflow                | radio-group and resource controls                                               |

## Defects found and fixed

| Severity | Defect                                                                                                                                                                                                                                                      | Resolution and regression coverage                                                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical | Array updates replaced the whole value through a scalar Redux Field. Indexed touched, submit-error, and async-error metadata could attach to the wrong row; `touchOnChange` could create a `NaN` metadata key; multiple edits collapsed into one undo unit. | Added semantic insert/remove/move/replace operations to fresco ArrayField, rebuilt the adapter on Redux Form FieldArray methods, migrated all array callsites, and added metadata/undo tests. |
| High     | Pointer drag emitted reorder changes throughout the preview instead of one completed operation.                                                                                                                                                             | Drag order is local preview state and one move is committed on drag end. Keyboard reorder also commits once.                                                                                  |
| High     | Disabled select options were discarded at shared-control boundaries, allowing duplicate variables or replacement of protected validation rules.                                                                                                             | Preserved per-option disabled state in native, styled, checkbox, and composite controls; global and option disabled states are combined with OR semantics.                                    |
| High     | Async dialog saves could be submitted twice, cancelled while pending, or complete after the edited item changed.                                                                                                                                            | Added single-flight save guards, pending dismissal protection, and stale-completion checks to collection editors and inline edit dialogs.                                                     |
| High     | Async field validation could resolve out of order and overwrite a newer result.                                                                                                                                                                             | Added per-field validation generations and stale-result suppression in the fresco form store.                                                                                                 |
| High     | Server-returned field errors did not reliably display or route focus through the invalid-submit path.                                                                                                                                                       | Server errors now update field state, use the normal invalid-submit callback, and preserve every error message.                                                                               |
| High     | Required state was lost at the ValidatedField-to-fresco adapter seam.                                                                                                                                                                                       | Derived required state from Architect validation configuration and forwarded native/ARIA required semantics.                                                                                  |
| High     | ArrayField notified Redux Form from inside a React state updater, producing a cross-component render update and risking duplicate work under concurrent rendering.                                                                                          | Moved semantic operation notification outside state updaters, retained a synchronous state ref, and added a console-regression assertion.                                                     |
| Medium   | Architect rebuilt its validation array on render, while stabilizing it naively would capture obsolete conditional rules.                                                                                                                                    | Added one stable Redux Form validator that reads the latest rule configuration and closures.                                                                                                  |
| Medium   | Validators could execute twice, and several validation helpers had no coverage for optional/malformed values.                                                                                                                                               | Execute once; hardened unique-array and ISO-date handling; replaced validation TODOs with regression tests.                                                                                   |
| Medium   | Numeric adapters truncated decimals and some number inputs used integer parsing accidentally.                                                                                                                                                               | Split number and integer adapters; decimal fields use number parsing and `step="any"`.                                                                                                        |
| Medium   | Month-date controls retained stale internal parts after a controlled clear and could keep an invalid month across a boundary-year change.                                                                                                                   | Synchronized controlled state, clear incomplete composites, filter boundary months, and added clear/bounds/accessibility tests.                                                               |
| Medium   | Custom pickers manually rendered one error and inconsistently exposed label, hint, disabled, and read-only state.                                                                                                                                           | Moved them behind the shared field shell and multi-error renderer.                                                                                                                            |
| Medium   | Several specialized controls dropped parts of the field contract: DataSource did not forward disabled/read-only state, RichText did not expose required state, and icon selection could exceed its configured maximum.                                      | Forwarded the complete contract and enforced the icon cap with focused regressions.                                                                                                           |
| Medium   | Map selection could leak listeners or reuse a stale map instance, and invalid BasicForm submissions did not focus the first invalid control.                                                                                                                | Hardened map load/error/cleanup/value synchronization and routed invalid submission through first-error focus.                                                                                |
| Medium   | Custom field wrappers put required/invalid/read-only ARIA attributes on `role="group"`, where those states are unsupported.                                                                                                                                 | Replaced wrappers with native fieldsets, moved state to the actual controls, and added an accessible required description to the shared field shell.                                          |
| Medium   | The file dropzone used legacy colors and could leave rejected or asynchronously failed imports without a durable, announced error.                                                                                                                          | Restyled it with fresco input/destructive tokens and added busy, disabled, live status, and persistent error handling.                                                                        |
| Medium   | New-stage interface cards and capability filters were mouse-oriented.                                                                                                                                                                                       | Interface cards are native buttons and filters expose pressed state and a named group.                                                                                                        |

## Collection-operation matrix

| Operation        | State mutation                    | Metadata                           | Undo                | Accessibility                        |
| ---------------- | --------------------------------- | ---------------------------------- | ------------------- | ------------------------------------ |
| Add              | `fields.insert`                   | Existing rows remain aligned       | One splice snapshot | Live announcement                    |
| Edit/replace     | `fields.splice(index, 1, value)`  | Index metadata retained            | One splice snapshot | Dialog label and pending guard       |
| Remove           | `fields.remove`                   | Following metadata reindexed       | One splice snapshot | Named action and live announcement   |
| Pointer reorder  | local preview, then `fields.move` | Touched/errors move with row       | One move snapshot   | Final position announced             |
| Keyboard reorder | `fields.move` once                | Touched/errors move with row       | One move snapshot   | Keyboard action and announcement     |
| Validation       | field and array-level errors      | Nested paths and `_error` retained | N/A                 | Shared error description/live region |

## Intentional native/specialized exceptions

The remaining raw inputs are not abandoned legacy fields:

- the stage-name input is an editable page heading with bespoke typography;
- the protocol-name textarea auto-grows and commits a single logical line;
- dropzone and home file inputs are native hidden inputs owned by the file-drop
  interaction;
- Base UI radio render functions intentionally render native buttons;
- application navigation/banner buttons are outside the form migration scope.

These controls were still checked for labels, native semantics, focus
visibility, and error descriptions.

## Verification checklist

- [x] Legacy field import scan
- [x] Scalar adapter and custom-picker regression tests
- [x] Array metadata and operation tests
- [x] Pointer and keyboard reorder tests
- [x] Dialog duplicate-submit/cancel/stale-completion tests
- [x] Validation helper and async race tests
- [x] Shared fresco-ui form tests
- [x] Architect form and affected editor tests
- [x] Browser smoke test across representative Architect editor workflows
- [x] Final root typecheck, lint, knip, and full test gates

The browser pass created an Information stage and exercised required scalar and
rich-text validation, two insertions, keyboard reorder, edit, confirmed removal,
and persistence after leaving and reopening the stage. The live-region move and
remove announcements were present and the browser console contained no warnings
or errors. Automated coverage finished with 827 passing fresco-ui tests and 766
passing Architect tests (plus four existing todos).
