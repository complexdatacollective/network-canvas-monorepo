---
'@codaco/studio-server': minor
---

The public data API at `/api/v1` is served from its Effect `HttpApi` contract.
`GET /api/v1/status` answers exactly as before, and every request under
`/api/v1` is still counted against the `public_api` limit.

`/api/v1/openapi.json` is now an OpenAPI 3.1.0 document (it was 3.1.2) generated
from the contract. The operation id, summary, server entry and `Status` schema
are unchanged; the operation now carries a `status` tag, an empty `security`
list and a 404 response in the RFC 9457 problem shape (`application/problem+json`),
which is how every declared refusal on this surface is encoded.

`/api/v1/docs` is new: a browsable API reference for the document.

A problem document's `status` is now an integer on every Studio surface: the
published schema says `integer`, and a document whose `status` is fractional
or non-finite is refused when decoded. Every status Studio sends already was
one.
