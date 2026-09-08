---
'fresco': minor
---

Fresco's URLs are now split by who may reach them, so that an institution can restrict the researcher surfaces to its own network at a reverse proxy with a single rule while participant traffic stays public. Exactly three prefixes plus the application's static assets are participant-facing — `/interview/`, `/onboard/`, `/api/public/`, and `/_next/` — and everything else is researcher-only. The split is documented in `SECURITY.md` and kept true by a test, and the FAQ for IT departments and the Advanced Deployment guide show the Traefik and nginx rules.

Four URLs moved to make that true. Update anything outside Fresco that references them when you upgrade:

- `/api/health` is now `/api/public/health`. Update container healthchecks and uptime monitors.
- `/api/uploadthing` is now `/api/public/uploadthing`. This is the UploadThing upload endpoint and callback; a firewall exception for the old path must move with it.
- `/api/assets/<key>` is now `/api/public/assets/<key>`. This serves protocol media from an S3-compatible backend; the URLs stored for existing assets are rewritten by a database migration during the upgrade.
- `/api/interviews/<id>/finish` is now `/interview/<id>/finish`, beside the interview's save endpoint.

The old paths are not redirected. A Fresco upgrade takes the deployment down, so no participant is left on a page that still uses them.
