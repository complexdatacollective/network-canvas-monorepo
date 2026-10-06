---
'@codaco/interviewer': patch
---

Interviewer opens with about 4 MB less JavaScript to load. The bundled sample
protocol and its media, and the synthetic data generator, now load only when
you install the sample or generate synthetic interviews. Both are still stored
for offline use, so installing the sample protocol works without a connection.
