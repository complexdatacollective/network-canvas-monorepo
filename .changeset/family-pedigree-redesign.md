---
"@codaco/shared-consts": minor
"@codaco/protocol-validation": minor
"@codaco/interview": minor
"@codaco/protocol-utilities": minor
---

Family Pedigree redesign (three features):

- **Configurable FamilyPedigree framing** — swappable parent terminology (gamete-based "Egg/Sperm Parent" vs gendered "Mother/Father"), either researcher-fixed or participant-chosen; an optional video+text intro step; and two author-set boundary rules (require grandparents; require children's genetic contributors). Persists `gameteRole` as a network edge variable and captures biological sex for non-parent people.
- **Interface fixes** — "Add sibling" is now always discoverable (rendered disabled with an inline hint when it cannot apply, keeping the shared-parent rule), plus first-cousin representation/creation demonstration stories.
- **Narrative Pedigree** — a new read-only interface that renders a captured pedigree, computes faithful Mendelian carrier/at-risk status per disease (autosomal dominant/recessive, X-linked recessive/dominant, Y-linked, mitochondrial, multifactorial), highlights a focal node's affected genetic lineage under participant-switchable presets, renders status as edge stickers or classic pedigree notation, and exports a PNG snapshot.
