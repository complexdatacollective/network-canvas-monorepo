---
'@codaco/protocol-validation': patch
---

Network Composer stages now require their layout variable to be a layout
variable and their convex hull variable to be a categorical variable. A protocol
that points either setting at a variable of another type fails validation
instead of letting the interview write layout or group data over unrelated
answers.
