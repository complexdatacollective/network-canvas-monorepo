---
'@codaco/architect': patch
---

Stop the rule builder marking its container with `aria-required`. The rule
builders behind a stage's Skip Logic and Filter sections are regions of controls
rather than a single input, so the form's identity lands on a `role="group"`
element — and `group` is not a role that supports `aria-required`, so axe
reported a critical `aria-allowed-attr` failure on every editor that mounted a
required rule set. ARIA 1.2 made `aria-invalid` global, so the group keeps that.
The requirement still reaches assistive technology the way it already did: the
visible marker on the "Rules" label and the visually hidden "Required" element
the group's `aria-describedby` names.
