---
'@codaco/interview': minor
'@codaco/interface-images': patch
---

NarrativePedigree now models mitochondrial donation. The genetics engine infers
each child's mitochondrial-DNA source from the egg-cytoplasm edge rather than
assuming it always follows the female parent, so a child conceived with a donor
egg inherits the donor's mitochondrial line while still inheriting the intended
parents' nuclear genome. Protocols that record a `gameteRole` on their pedigree
edges get this automatically; those that don't are unaffected (the engine falls
back to the previous female-parent rule, so existing data is unchanged).

The comprehensive example pedigree is rebuilt around a single, realistic,
ego-centric family in which all six conditions reach the participant's own
household — including a mitochondrial-donation branch whose child escapes the
family's mitochondrial condition — and the NarrativePedigree interface preview
image is regenerated to match.
