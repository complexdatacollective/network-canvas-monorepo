---
'@codaco/protocol-validation': minor
---

Add optional `synthetic` metadata to the schema 8 codebook, describing how generated preview and sample data should be distributed. Node types can declare a population count, edge types a topology (density or mean degree), and variables a type-specific distribution — option weights for ordinal and categorical, a selection-count table for categorical, a curated generator for text, and a missing probability wherever the variable is not required.

The property is optional everywhere and existing protocols are unaffected; a protocol that omits it generates from documented defaults exactly as before. Cross-field rules reject metadata that cannot be satisfied: a missing probability on a required variable, weights naming options the variable does not offer, selection counts outside what the options and validation allow, and distribution parameters disjoint from the variable's own bounds.
