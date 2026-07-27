---
"@codaco/architect": patch
---

Fix two variable dropdowns that could produce protocols failing validation. The
sort-order rules for the sociogram bucket and bin (ordinal bin, categorical bin,
and one-to-many dyad census) now offer Ascending/Descending in the direction
dropdown instead of a list of variables. Scalar (visual analog scale) variables
now offer only the validation rules that scale supports — Required alongside the
comparison rules — and no longer offer "must be unique", "different from", or
"same as", which the schema has never accepted for a scale.
