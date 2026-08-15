---
'@codaco/architect': patch
---

The Skip Logic and Filter rule builders now name their add buttons separately, instead of both using the same three names.

**Two rule builders, two sets of names.** Most stage editors offer rules in two places — Skip Logic, which decides whether the stage is shown, and Filter, which decides which nodes and edges appear on it. Both used the same buttons: "Add alter rule" and "Add edge rule". So an Alter Form, Alter Edge Form, Categorical Bin, Dyad Census, Geospatial, Narrative, One-to-Many Dyad Census, Ordinal Bin, Sociogram or Tie-Strength Census editor showed each of those names twice, and a researcher working from a list of controls — or asking for one by name — could not tell which rule set a button belonged to. Each now says: "Add new filter alter rule" and "Add new filter edge rule" in the Filter section, and "Add new skip logic alter rule", "Add new skip logic edge rule" and "Add new skip logic ego rule" in Skip Logic.

The wording follows the split already in use across Architect's lists: "Create new" for a row written from scratch, "Add new" for one assembled by choosing from material that already exists — which is what a rule is, a variable and an operator picked out of the codebook. Nothing about how the rules work changes; the same button still opens the same rule editor.
