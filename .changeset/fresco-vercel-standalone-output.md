---
"fresco": patch
---

Fresco can be deployed to Vercel again. Since 4.1.0 every Vercel deployment failed during the build with `ENOENT: .next/next-server.js.nft.json`. Next.js 16.3 stopped writing that file-trace manifest when `output: 'standalone'` is set, and Vercel's build adapter needs it to package the app's serverless functions. Fresco sets `output: 'standalone'` only for its Docker image, so it is now switched off when building on Vercel. Container and Netlify deployments are unaffected.

The consequence reached further than a failed build. Fresco applies its database migrations before the build runs, so an upgrade attempted on Vercel migrated the schema and then failed — leaving the previous deployment, still serving, reading a database whose shape it no longer understood. A Vercel deployment could therefore take itself offline by trying to upgrade, and could not be repaired by redeploying the older version.

Fixed upstream in Next.js 16.4 (vercel/next.js#96646).
