---
'@codaco/fresco-ui': minor
---

`Definition` accepts a `render` prop that replaces the term element, so a term that should lead somewhere can be a link itself. The tooltip popup is `aria-hidden` and `definition` reaches assistive technology as flattened description text, so a link placed inside `definition` was reachable only with a mouse. A replaced element keeps its own tab stop and activation, and no longer has its press intercepted to open the popup.
