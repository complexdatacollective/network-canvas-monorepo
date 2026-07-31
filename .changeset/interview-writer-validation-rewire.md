---
'@codaco/fresco-ui': patch
'@codaco/interview': minor
'@codaco/protocol-validation': patch
---

The Categorical Bin "other" input and the Name Generator quick-add field now apply the referenced variable's configured validation rules, exactly as form fields do — including context-dependent rules such as `differentFrom` and `unique`. The Network Composer's add-node input applies the quick-add variable's codebook rules in the same way, a behaviour change for existing protocols whose quick-add variable carries validation. Previously these inputs ignored the codebook and enforced only their local requirements. In native v8 protocols, both Categorical Bin "other" and Name Generator quick-add are optional when their referenced variable has no required validation. The v7→v8 migration adds `required: true` to variables referenced by either writer, preserving existing protocols' required responses while retaining their other validation rules. Variables without an explicit input `component` work correctly. After a valid Network Composer node is added, its quick-add field now resets its value and validation state so the fresh blank entry does not announce a required-field error.

Network Composer also waits for a quick-add node to finish being stored before
clearing and reopening the input, preventing two rapid submissions from
bypassing uniqueness validation against the first node.

The Categorical Bin dialog registers its response under the referenced
codebook variable ID, so a sibling variable literally named `otherVariable`
cannot be mistaken for the live response by cross-variable validation.

Deferred invalid-field focus now remains safe when its form unmounts before
smooth scrolling finishes.
