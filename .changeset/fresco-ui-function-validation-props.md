---
'@codaco/fresco-ui': patch
---

Fix a field going on running a validation rule it no longer has. A field memoises its validation function on a JSON serialisation of its validation props, and `JSON.stringify` omits a function-valued property, so a `custom` rule rebuilt to judge against something that has changed — the rows a value must stay unique against, the picks a cross-reference must agree with — produced an identical key and the field kept running the rule it first registered with. The rules are now read when validation runs, so the registered function keeps its identity (re-registering would delete the field's stored errors) while always judging by the rules the field currently holds.
