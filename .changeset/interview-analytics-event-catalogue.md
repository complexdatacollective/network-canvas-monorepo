---
'@codaco/interview': minor
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

The interview's usability analytics events are now declared as Effect Schemas in a catalogue exported from `@codaco/interview/analytics-events`: each event name with the exact type of every property it carries (stage and interface codes, indices, counts, durations, booleans and session pseudonyms), the properties every event carries, and the properties of each exception the interview reports. The tracker is typed by the catalogue, so an event or property outside it no longer compiles, and a host can decode what it receives against the same definitions. `effect` 4 is now a peer dependency of `@codaco/interview`. The events themselves are unchanged.
