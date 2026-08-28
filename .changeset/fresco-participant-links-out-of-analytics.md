---
'fresco': patch
---

Participant interview links no longer reach the analytics service.

A participant's interview URL contains the identifier that grants access to that interview, and an onboarding link also carries the participant identifier a researcher assigned. Fresco already refuses to send those URLs as a referrer, but on deployments with analytics enabled they were still attached to analytics events as the current page address, including the link address of anything clicked.

Those identifiers are now removed before any event is sent, on every route a participant sees. Session replay is also switched off for those pages, both when one is opened directly and when a researcher opens an interview from the dashboard — replay stores the page address in a form the removal cannot reach, and a recording of someone answering interview questions is research data rather than analytics.
