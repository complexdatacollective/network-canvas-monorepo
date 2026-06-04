---
'@codaco/fresco-ui': patch
---

`RadioGroupField`: respect a per-option `disabled` flag even when the field itself is not disabled. The per-option disabled state was computed with `disabled ?? option.disabled`, which discarded `option.disabled` whenever the field passed an explicit `disabled={false}` (the normal case via `useField`), so individual options could never be disabled.
