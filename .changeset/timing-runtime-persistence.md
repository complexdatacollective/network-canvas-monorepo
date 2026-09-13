---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Persist privacy-safe stage timing in the interview session contract. Stage and prompt history retains the latest 10,000 exits; stored totals describe that bounded observation window, while completion analytics continues its in-memory total for the current loaded runtime.
