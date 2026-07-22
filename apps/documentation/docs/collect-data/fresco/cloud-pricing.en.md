---
title: Cloud Pricing
date: 8th October 2025
navOrder: 6
wip: false
---

Deploying Fresco can be achieved entirely for free using the free tiers of each service. You may optionally upgrade your services based on your needs.

## Netlify

- **Hobby Tier (Free)**: Netlify offers a Free tier which provides sufficient features for small-scale deployments.

- **Upgrade Option**: If your project grows or you require additional features, you can upgrade to Netlify's Personal plan for $9/month or Pro plan for $20/member/month.

For more information on Netlify's pricing plans and features, you can visit their [pricing page.](https://www.netlify.com/pricing)

## Neon

- **Free Plan**: Neon offers a free plan which provides 0.5 GB storage and 100 compute hours, sufficient for small-scale projects.

- **Upgrade Option**: If you require extra storage or compute hours, you can upgrade to Neon's Launch plan for $5/month.

For more information on Neon's pricing plans and features, you can visit their [pricing page.](https://neon.com/pricing)

## UploadThing

- **Free Tier**: UploadThing offers a free tier with basic features and up to 2GB of storage, suitable for small projects.

- **Upgrade Option**: If you require additional storage or features, you can upgrade to 100GB of storage for $10/month.

For more information on UploadThing's pricing plans and features, you can visit their [pricing page.](https://uploadthing.com/pricing)

## S3-compatible storage (alternative to UploadThing)

Instead of UploadThing, you can store protocol assets in any S3-compatible bucket. Costs depend on the provider you choose:

- **AWS S3** — pay for storage, requests, and data egress. See the [AWS S3 pricing page](https://aws.amazon.com/s3/pricing/).
- **Cloudflare R2** — S3-compatible with no egress fees; pay for storage and requests. See the [R2 pricing page](https://developers.cloudflare.com/r2/pricing/).
- **Backblaze B2** — low-cost storage with an S3-compatible API. See the [B2 pricing page](https://www.backblaze.com/cloud-storage/pricing).
- **Self-hosted MinIO** — no service fees; you pay only for the infrastructure you run it on.

For setup steps, see [Configure storage](./guide#configure-storage) in the deployment guide.
