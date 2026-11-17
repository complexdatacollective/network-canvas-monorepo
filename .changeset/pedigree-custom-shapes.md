---
'@codaco/interview': minor
'@codaco/protocol-utilities': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

The Family Pedigree and Narrative Pedigree now draw custom node shapes. A person whose type gives them a custom shape, as its default shape or through a mapping, is drawn with that shape on the pedigree, where they used to be drawn as a circle. The lines joining them to their relatives end at the edge of the box their drawing fills, and stay hidden behind a drawing that is partly see-through. In the Narrative Pedigree, a person with a custom shape is drawn with it until a condition is chosen. Once one is chosen they are drawn as a circle, as before, because standard notation is drawn only on a circle, a square or a diamond. A saved snapshot shows custom shapes in the person type's color.

For developers: `SyntheticInterview`'s node type handle gains `setCustomShapes`, which records custom shapes on the generated codebook's node type.
