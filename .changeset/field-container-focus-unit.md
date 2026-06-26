---
'@codaco/fresco-ui': minor
---

Make a form field a single unit of focus.

- **Container-scoped validation**: validate-on-blur now fires when focus leaves the whole field, not the inner `<input>`. Moving focus to an in-field control (a prefix/suffix button, a number stepper, a sibling radio…) no longer counts as leaving the field, so it no longer leaves a stale validation error (e.g. a "Generate identifier" button populating a field that still showed "cannot be empty"). Single-control fields behave identically; multi-control fields (RadioGroup, Combobox, DatePicker…) get strictly better behaviour.
- **Focus indication**: slot controls stay real tab stops and render their own design-system focus ring (`Button`/`IconButton` already do); the field shows one ring per focused element rather than double-ringing the wrapper around an already-focused control. The `InputField` wrapper also un-clips (`overflow-visible`) while a slot control is focus-visible, so the control's offset focus ring isn't clipped by the rounded container.
- **Slot field controller**: `InputField`'s `prefixComponent`/`suffixComponent` now also accept a render function `(field) => ReactNode` that receives a `FieldSlotController` (`{ name, value, setValue, validate, focusInput }`), so a slot control can set and validate the value without importing the form store. Delivered via the new `useFieldController` hook / `FieldController` context. The plain `ReactNode` form is unchanged.
- **Escape hatch**: `validateOnControlBlur` on `Field` restores validation when focus moves to an in-field control.

Slot controls remain real tab stops with native button semantics.
