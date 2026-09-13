---
'@codaco/fresco-ui': minor
---

`CheckboxGroupField` takes an `emptyState`, shown inside the group when there
is nothing to tick. A field whose options all come from somewhere else can be
handed none, and the caller that wants to say so had to replace the group with
a paragraph — which drops the `aria-labelledby` the field injects, so the
control assistive technology announced as "Edge types" became unnamed text at
the moment the name mattered most. The sentence now sits inside the group the
label names.
