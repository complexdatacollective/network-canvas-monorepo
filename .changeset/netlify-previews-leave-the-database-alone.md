---
'fresco': patch
---

On Netlify, deploy previews no longer migrate the database. Netlify gives a
deploy preview the same database settings as the production deploy, and every
preview build ran the same database setup as production. A preview of a
version with a newer protocol schema could therefore migrate the live
deployment's protocols and interviews to that schema. The live deployment then
refused every interview link and showed the onboarding error page. Deploy
previews now skip the database setup, as branch deploys already did, and only
the production build migrates the database.
