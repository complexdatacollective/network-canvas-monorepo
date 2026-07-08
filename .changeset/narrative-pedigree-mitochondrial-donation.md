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

Disease-status symbols follow standardized pedigree nomenclature: a solid fill is
reserved for individuals who are affected, and relatives who are only at risk are
shown with the standard hatched carrier symbol rather than a filled marker, keeping
the display consistent with established clinical and research practice.

The comprehensive example pedigree is rebuilt around a single, realistic,
ego-centric family in which all six conditions reach the participant's own
household. The mitochondrial-donation branch (not authorable through the
participant interface) is shown in a dedicated example, while the default preview
reflects a participant-reachable pedigree.
