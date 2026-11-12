---
'@codaco/protocol-review-worker': minor
---

First release of the service behind Architect's experimental Automated Protocol Review, deployed at `protocol-review.networkcanvas.com`.

The service spends at most US $200 on reviews in a calendar month and US $20 in a day. When the month's budget is spent it answers `monthly_limit` with the time reviews start again, the first midnight UTC of the next month.
