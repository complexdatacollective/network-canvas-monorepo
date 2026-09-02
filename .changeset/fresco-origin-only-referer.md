---
'fresco': patch
---

Interview pages now send an origin-only `Referer`, so URL-restricted Mapbox tokens work with Fresco.

Fresco set `Referrer-Policy: no-referrer` on `/interview/*` and `/onboard/*` so that the interview id in those URLs could never reach a third party. That also withheld the site's origin, and Mapbox evaluates a token's URL restrictions from the `Referer` header — so a Geospatial stage backed by a URL-restricted token failed with 403 on every map load, leaving researchers no choice but an unrestricted token. Those routes now use `strict-origin-when-cross-origin`, the policy every other Fresco route already carried: a cross-origin request carries only the scheme and host, an HTTPS→HTTP downgrade carries nothing, and the full URL, interview id included, is sent only to same-origin requests, which already know it. The protection the old policy provided is unchanged; Mapbox can now see the origin it needs.

Existing deployments must upgrade to this version to benefit. A deployment on an earlier release still sends no `Referer`, so its Mapbox token has to stay unrestricted.
