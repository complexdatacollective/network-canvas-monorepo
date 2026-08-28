---
'fresco': patch
---

Deployments with analytics disabled no longer contact the Network Canvas analytics service.

Analytics previously started as soon as a page loaded, before the deployment's own setting had been read. A deployment that set `DISABLE_ANALYTICS` or turned analytics off in its settings still requested configuration, supporting scripts, and feature flags on every page load, and could send one anonymous event before the setting took effect. Each new browser also created a new anonymous person record.

Analytics is now loaded only once the server confirms it is enabled, so a deployment with it disabled makes no requests at all. If the setting cannot be read, nothing is sent. Errors reported from the server now honour the setting too.

Turning analytics off part-way through a study now takes effect on the server straight away. A deployment that had analytics enabled kept sending server errors until it was restarted, because those reports came from a handler that was set up once and never consulted the setting again. Every server report is now checked against the setting as it is made.
