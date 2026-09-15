---
'@codaco/fresco-ui': minor
---

`resolveFieldContainer` is exported from `form/utils/focusFirstError`. It
answers with the element a form field owns in the DOM for a given error key,
through the same two rules the focus machinery already used internally — the
store's own key first, then a public field name when exactly one element
carries it. Callers that need the field itself, rather than the control an
invalid submit would focus, no longer have to reimplement that lookup and drift
from it.
