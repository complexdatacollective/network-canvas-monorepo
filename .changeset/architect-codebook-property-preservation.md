---
'@codaco/architect': patch
---

Stop the stage editors from silently discarding variable settings they don't manage. Adding an editable attribute to a Network Composer stage no longer clears the input control from the variable in your codebook, which previously broke every other stage that used the same variable. Interface-owned option sets, such as the Family Pedigree biological sex values, also keep their locked state when you edit a form field that uses them.

Day offsets on a relative date picker can no longer be set to a negative number, and edge rules are no longer offered on side panels that draw their data from an external file, where they can never match. Switching an existing panel to an external file now offers to remove any edge rules its filter already contains.
