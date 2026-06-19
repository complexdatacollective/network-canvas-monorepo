---
'@codaco/fresco-ui': patch
---

Fix form-field schema-conformance bugs found in a release audit:

- Render VisualAnalogScale on the normalized 0–1 scale (matching the contract) instead of 0–100.
- Preserve typed (number/boolean) RadioGroup option values instead of stringifying them.
- Respect configured month/year `min`/`max` bounds in DatePicker (accept partial `YYYY` / `YYYY-MM` resolutions).
- Short-circuit optional `minValue`/`minLength`/`minSelected` validators on empty fields (so `required` owns emptiness) and treat a `0` max bound as a real bound.
- Source cross-variable comparison validators (`greaterThanVariable`/`sameAs`/etc.) from persisted entity attributes when the referenced variable is not a field on the current form.
