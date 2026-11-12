---
'@codaco/studio-api': patch
---

An idle Studio deployment no longer sends a trace for every background check. The worker's job polls that find nothing, the once-a-second maintenance readings, and `/healthz` and `/readyz` probes are no longer exported, along with the database queries they run. A poll that claims a job is still traced from the job's processing onwards. When telemetry is on, an idle worker now exports roughly a twelfth of the trace data it did.
