---
title: Variable Types
---

The Network Canvas software supports modeling data using a standard of variety data types. Below you will find these types summarized, along with relevant information about their limitations and features.

<div class="variable-definition">
## Boolean
Represents dichotomous categories with only two possible values (e.g. true/false).

**Compatible Input Controls:**

- [Toggle](/en/desktop/key-concepts/input-controls#toggle)

**Validation Options:** Required

</div>

<div class="variable-definition">
## Categorical
These variables represent nominal categories or characteristics that have no intrinsic ordering or hierarchy (e.g. gender, nationality, etc.).

**Compatible Input Controls:**

- [Toggle Button Group](/en/desktop/key-concepts/input-controls#toggle-button-group)
- [Checkbox Group](/en/desktop/key-concepts/input-controls#checkbox-group)

**Validation Options:** MinSelected, MaxSelected, Required

</div>

<div class="variable-definition">
## Datetime
These variables represent a point in time (typically a date).

**Compatible Input Controls:**

- [Date Picker](/en/desktop/key-concepts/input-controls#date-picker)
- [Relative Date Picker](/en/desktop/key-concepts/input-controls#relative-date-picker)

**Validation Options:** Required

</div>

<div class="variable-definition">
## Layout
These variables store the x, y coordinates of nodes on the Sociogram normalized to a range of `[0, 1]`.

This variable type has no validation options or input controls, because it cannot be used on a [form](/en/desktop/key-concepts/forms).

</div>

<div class="variable-definition">
## Number
These variables represent integer values (e.g. age, height, etc.).

**Compatible Input Controls:**

- [Number Input](/en/desktop/key-concepts/input-controls#number-input)

**Validation Options:** MaxValue, MinValue, Required

</div>

<div class="variable-definition">
## Ordinal
These variables represent categories that are ordered hierarchically (e.g. frequency of contact, level of education, etc.).

**Compatible Input Controls:**

- [Likert Scale](/en/desktop/key-concepts/input-controls#likert-scale)
- [Radio Group](/en/desktop/key-concepts/input-controls#radio-group)

**Validation Options:** Required

</div>

<div class="variable-definition">
## Scalar
These variables represent a normalized value within a scale `[0.1]` (e.g. perceived pain).

**Compatible Input Controls:**

- [Visual Analog Scale](/en/desktop/key-concepts/input-controls#visual-analog-scale)

**Validation Options:** Required

</div>

<div class="variable-definition">
## Text
These variables represent text data (e.g. names, qualitative responses, etc.).

**Compatible Input Controls:**

- [Text Input](/en/desktop/key-concepts/input-controls#text-input)
- [Text Area](/en/desktop/key-concepts/input-controls#text-area)

**Validation Options:** MinLength, MaxLength, Required

</div>
