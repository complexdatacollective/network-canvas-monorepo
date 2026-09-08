---
'fresco': patch
---

Refuse Server Action requests aimed at participant or infrastructure routes. Next.js dispatches a Server Action by a `Next-Action` request header, independent of the URL a request targets, so a signed-in researcher's session cookie combined with an action id read out of the public JavaScript bundle could previously invoke an authenticated action — participant data export, deletion, and settings changes among them — through a route such as `/interview/finished`, bypassing an institutional network restriction that only filters by URL. Fresco now rejects such a request with a 403 at the application layer, regardless of what a reverse proxy in front of it does.
