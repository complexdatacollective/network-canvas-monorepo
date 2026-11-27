---
'@codaco/network-query': patch
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

A rule that checks whether an attribute **exists** now checks whether the attribute has been answered, in the same way as the check for a required question. Text that is empty or contains only spaces, and a categorical answer with no options selected, count as not answered. An answer of 0 or "no" counts as an answer. Previously, skip logic and filters counted an answer that the participant typed and then deleted as an answer, because it was saved as empty text. The same check applies to interviews saved before this change, so the empty answers that they contain now count as not answered.

When a participant deletes an answer before submitting a form, the form now saves no answer to that question, instead of empty text.

In Architect, the rules of skip logic and filters now offer **exists** and **does not exist** for an attribute, as well as the comparisons for its type.
