---
title: Cloud Pricing
date: 8th October 2025
navOrder: 6
wip: false
---

Deploying Fresco can be achieved entirely for free using the free tiers of each service. You may optionally upgrade your services based on your needs.

## Netlify

- **Free tier**: Netlify's free tier provides sufficient features for small-scale deployments.

- **Upgrade option**: If your project grows or you require additional features, Netlify offers paid personal and team plans.

For current plans and prices, visit Netlify's [pricing page](https://www.netlify.com/pricing).

## Neon

- **Free tier**: Neon's free plan includes a small amount of storage and compute, sufficient for small-scale projects.

- **Upgrade option**: If you require extra storage or compute hours, Neon offers paid plans with higher limits.

For current plans and prices, visit Neon's [pricing page](https://neon.com/pricing).

## UploadThing

- **Free tier**: UploadThing's free tier offers basic features and a small amount of storage, suitable for small projects.

- **Upgrade option**: If you require additional storage or features, UploadThing offers paid plans with larger storage allowances.

For current plans and prices, visit UploadThing's [pricing page](https://uploadthing.com/pricing).

## S3-compatible storage (alternative to UploadThing)

Instead of UploadThing, you can store protocol assets in any S3-compatible bucket. Costs depend on the provider you choose:

- **AWS S3** — pay for storage, requests, and data egress. See the [AWS S3 pricing page](https://aws.amazon.com/s3/pricing/).
- **Cloudflare R2** — S3-compatible with no egress fees; pay for storage and requests. See the [R2 pricing page](https://developers.cloudflare.com/r2/pricing/).
- **Backblaze B2** — low-cost storage with an S3-compatible API. See the [B2 pricing page](https://www.backblaze.com/cloud-storage/pricing).
- **Self-hosted MinIO** — no service fees; you pay only for the infrastructure you run it on.

For setup steps, see [Configure storage](./guide#configure-storage) in the deployment guide.
