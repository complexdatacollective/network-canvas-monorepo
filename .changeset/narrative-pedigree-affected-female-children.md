---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Three changes to how the Narrative Pedigree handles an X-linked recessive condition.

When a stage shows possible statuses, the children of a woman recorded as affected are now marked: her daughters may carry the condition and her sons may develop it, and this continues down through her daughters. A child whose sex is uncertain is left unmarked. Before, her children were only marked when her own mother had been worked out to carry or possibly carry the condition, so the result depended on which other relatives had been recorded. Her being affected adds nothing about her parents.

A woman with an affected son whose own mother is recorded as affected is now shown as carrying the condition. Only biological and donor links count.

When a woman who carries the condition is focused and her father is affected, the highlighted path now runs only through her father, even when her mother is also affected. If she is herself affected, the path still runs through both parents.
