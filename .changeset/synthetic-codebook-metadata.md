---
'@codaco/protocol-validation': minor
---

Add optional `synthetic` metadata to schema 8, describing how generated preview and sample data should be distributed.

The metadata is split by what each half is a property of. A value distribution belongs to the thing being measured, so codebook **variables** carry their own: option weights for ordinal and categorical, a selection-count table for categorical, a curated generator for text, and a missing probability wherever the variable is not required. How many entities get created, and how densely they get linked, is a property of the asking rather than the asked-about — so the entity-creating **stages** carry those: a population count on the name generators and Network Composer, and a topology on the Sociogram, the censuses, and Network Composer. Density may be described with a beta distribution as well as a constant, uniform, or normal one, since it is a proportion rather than a count.

Family Pedigree deliberately declares nothing. A family is a structure rather than a population, so it keeps its own generation logic, and no protocol-level constraint sizes it.

The property is optional everywhere and existing protocols are unaffected; a protocol that omits it generates from documented defaults exactly as before. Cross-field rules reject metadata that cannot be satisfied: a missing probability on a required variable, weights naming options the variable does not offer, selection counts outside what the options and validation allow, distribution parameters disjoint from the variable's own bounds, and a count whose spread could reach a population no synchronous preview could render.
