---
'@codaco/interview': minor
---

The Categorical Bin "other" input and the Name Generator quick-add field now apply the referenced variable's configured validation rules, exactly as form fields do — including context-dependent rules such as `differentFrom` and `unique`. The Network Composer's add-node input applies the quick-add variable's codebook rules in the same way, a behaviour change for existing protocols whose quick-add variable carries validation. Previously these inputs enforced a hard-coded requirement and ignored the codebook: a variable with no validation rules is now genuinely optional at these inputs, and variables without an explicit input `component` work correctly.
