---
'@codaco/architect': patch
---

Every list in an Architect editor now has an add button of its own, instead of several called the same thing.

**Add buttons say what they add.** The prompt and form-field buttons were renamed for this (#1391), but the option and sort-rule lists still shared one label: "Add new". A Categorical Bin or Ordinal Bin prompt editor showed three of them — one for the variable's options, one for the bucket sort order and one for the bin sort order — and a Name Generator Roster stage showed three more, for the initial sort order, the participant's sortable properties and the card display properties. To a researcher working from a list of controls, or asking for one by name, they were one control repeated. Each now names its own list: "Create new option", "Add new bucket sort rule", "Add new bin sort rule", "Add new sort rule", "Add new sortable property" and "Add new display property".

The wording follows the split already in use: a list whose rows the researcher writes from scratch says "Create new", and one whose rows are assembled by choosing from variables that already exist says "Add new". Nothing else about these lists changes — the same click still adds the same blank row in the same place.
