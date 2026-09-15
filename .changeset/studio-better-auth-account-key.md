---
'@codaco/studio-server': minor
---

Upgrade better-auth to 1.7.5 and key accounts the way it does again. 1.7.0 through 1.7.2 matched a credential or OAuth account on an extra `issuer` column, so the schema carried one and made it required; 1.7.3 reverted to the 1.6 behaviour, where `(providerId, accountId)` is the whole identity, and refuses to start against a schema that still demands a column it never writes. The column and its unique index go, replaced by a unique index on `(providerId, accountId)` — the pair every account lookup now matches on, and the one better-auth itself refuses to disambiguate if two rows share it. The development seed writes credential accounts without the column, and the schema fingerprint moves with it, so an existing development database is re-provisioned on next boot.
