---
'fresco': patch
---

Session replay and heatmap capture are now off on every page, not only participant ones. Enabling either on the dashboard could send data neither optional analytics feature was meant to include: heatmaps key their captured data by the full page URL, and the participants and interviews tables put the researcher's search text there as a query parameter; session replay can capture whatever the current page renders, including the TOTP secret on the two-factor setup screen and recovery codes or freshly created API tokens on the settings screen, and the recorder's default masking does not cover plain text or images. Fresco reports only the usage events it emits explicitly.
