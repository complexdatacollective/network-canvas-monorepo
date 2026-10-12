---
'@codaco/studio-api': minor
---

The public data API at `/api/v1` is served from its Effect `HttpApi` contract.
`GET /api/v1/status` answers with the same document as before, and every
request under `/api/v1`, whatever its method, is now counted against the
`public_api` limit (`HEAD`, `OPTIONS` and unusual methods were not counted
before).

Paths under `/api/v1` now match the way the rest of the server's routes do:
case-insensitively, with repeated slashes collapsed and a trailing slash
ignored, so `/API/v1//status` is `/api/v1/status` (it was a 404). A path with
`./` or `../` segments is no longer resolved and answers 404, and `HEAD` on
any `/api/v1` path answers 404.

`/api/v1/openapi.json` is now an OpenAPI 3.1.0 document (it was 3.1.2) generated
from the contract. The operation id, summary, server entry and `Status` schema
are unchanged; the operation now carries a `status` tag, an empty `security`
list and a 404 response in the RFC 9457 problem shape (`application/problem+json`).

`/api/v1/docs` is new: a browsable API reference for the document, served
compressed and cacheable (an ETag revalidates it to a 304), loading nothing
from a third party, and limited to 30 views a minute per address on top of
the public API limit (the new `api_docs` scope).

A problem document's `status` is now an integer on every Studio surface: the
published schema says `integer`, and a document whose `status` is fractional
or non-finite is refused when decoded. Every status Studio sends already was
one.

`GET /api/v1/status` answers 500 rather than 400 if the server ever produces a
status document it cannot encode.
