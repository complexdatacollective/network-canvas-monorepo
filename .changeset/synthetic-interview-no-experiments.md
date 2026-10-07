---
'@codaco/protocol-utilities': major
---

`SyntheticInterview.setExperiments()` is removed, and the interview payloads it
generates no longer include `experiments`, because schema 9 protocols have no
experiments setting. An attribute added with `encrypted: true` is always
encrypted by the interview.
