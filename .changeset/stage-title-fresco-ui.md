---
'@codaco/fresco-ui': minor
---

A form's "jump to the first problem" now finds a field rendered outside the
`<form>` element, and can no longer reach a field belonging to another form.
Every connected field stamps its own form's identity on its container
(`data-field-form`), and `focusFirstError` takes that identity alongside the
form element: a field belongs to the form if the element contains it or it
carries the form's id. Previously the search was DOM containment alone, so a
host drawing one of a form's fields outside the element — a stage editor's
title — was unreachable, and an unscoped fallback could scroll the page behind
a dialog to a same-named field it must not touch.
