---
'@codaco/fresco-ui': minor
'@codaco/architect': patch
---

`ArrayField` writes the id `getId` returns for an item on that item's row as `data-item-id`, so a host can find the row an item is drawn in. A row a host moves focus to shows the focus ring.

When Architect refuses to add a stage because of one item in one of its lists, such as a prompt, focus now moves to that item's row.

When a stage cannot be added because part of it is not valid, the message now says that your changes are still in the editor. It used to say they had been discarded, which was not true.
