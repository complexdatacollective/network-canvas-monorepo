---
'@codaco/studio-sync': minor
'@codaco/studio-api': patch
'@codaco/studio-web': patch
---

A section the host refuses now names, on each issue, the object inside it that the issue is about. `SectionIssue` has an optional `objectId`, the id of the nearest object holding the failing value, such as the sort rule inside a prompt, and `toSectionIssues` turns a section schema's refusal into these issues.

A new protocol is now made the way Architect makes one, with `createEmptyProtocol` from `@codaco/protocol-builder-core`. It starts with an empty participant codebook and an empty list of resources, as well as its Finish Screen stage.

In the editor, choosing a validation problem about one item in a list, such as a prompt, a form field or a rule, now opens its screen and moves focus to that item's row, rather than to the list that holds it.
