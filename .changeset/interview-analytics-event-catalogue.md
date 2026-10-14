---
'@codaco/interview': major
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

The interview's usability analytics events are now declared as Effect Schemas in a catalogue exported from `@codaco/interview/analytics-events`: each event name with the exact type of every property it carries (stage and interface codes, indices, counts, durations, booleans and session pseudonyms), the properties every event carries, and the properties of each exception the interview reports. A host can decode what it receives against the same definitions.

Breaking changes: the function `useTrack()` returns is now typed by the catalogue, so it accepts only catalogued event names with their declared properties, and a host-specific event no longer compiles. `effect` 4 is now a peer dependency of `@codaco/interview`.

Stage and force-simulation durations are now never negative, and never above 366 days, when the device clock changes while they are measured. The events are otherwise unchanged.
