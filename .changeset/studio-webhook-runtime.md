---
'@codaco/studio-server': minor
'@codaco/studio-rpc': minor
---

Add team-administered webhook subscriptions and deliver real study creation events through the shared outbox worker. Deliveries use Standard Webhooks signatures, stable at-least-once retry identities, audited encrypted-secret access, bounded public-network delivery, and published OpenAPI event schemas.
