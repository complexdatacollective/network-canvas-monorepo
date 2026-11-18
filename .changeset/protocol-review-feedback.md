---
'@codaco/protocol-review-worker': minor
---

The service now accepts feedback on a review the researcher shared.
`POST /feedback` takes what the researcher did with each problem, whether they
rated it useful or not and why, and an optional comment on the review. It is
kept beside the shared review under `feedback:<reviewId>`, replaces what was
sent before, and expires at the moment the review does, so it never outlives
the 90 days. Feedback naming a review the service holds no shared copy of is
refused with `404 unknown_review` and nothing is kept.

Feedback has hourly limits of its own (60 sendings for each installation and
600 for each network address), a 16,000 byte size limit, and spends no
provider's budget.
