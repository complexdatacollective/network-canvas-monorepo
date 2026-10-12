---
'fresco': patch
---

A protocol whose stored design cannot be read is no longer treated as if it
were empty. Fresco used to start interviews for such a protocol with no stages,
export its interviews without the protocol's variable definitions, and generate
synthetic interviews from it that held nothing. It now refuses each of these
instead. Participants see an error rather than an empty interview. Recruitment
links and synthetic data generation report that the protocol could not be
read. An export that includes the protocol stops with an error, and the
interview data API returns an error. Each refusal is recorded in error
tracking.
