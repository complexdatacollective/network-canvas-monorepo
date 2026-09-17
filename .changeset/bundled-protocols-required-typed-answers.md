---
'@codaco/architect': patch
'@codaco/interviewer': patch
'@codaco/sample-protocol': patch
'@codaco/development-protocol': patch
---

Require an answer in the bundled protocols' quick-add and "other" fields

Quick-add name generators and the follow-up question behind a categorical bin's
"other" option used to require an answer on their own. They now follow the
validation set on the attribute they write to, and upgrading a protocol to
schema 8 adds `required` to those attributes so nothing changes for existing
studies. The protocols bundled with Architect and Interviewer were never
upgraded that way, so participants could leave these fields blank. The sample
protocol, the development protocol and the Colored Eco-Genetic Relationship Map
(CEGRM) template now require an answer in those fields again.
