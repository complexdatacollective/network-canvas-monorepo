---
'fresco': patch
---

The interview data API now accepts the `Bearer` prefix on an API token in any letter case, such as `bearer` or `BEARER`, and only removes it from the start of the Authorization header.
