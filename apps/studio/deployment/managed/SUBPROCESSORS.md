# Managed Studio subprocessor inventory

Generated from `subprocessor-estate.json`, `candidate-sizing.json`, and the managed Terraform estate. This is an infrastructure inventory, not legal or contractual qualification.

Managed service residency: **United States**. Self-host the identical Studio artifact in an institution-selected region.

Configured candidate: compute `iad`; PostgreSQL `us-east-1` (Hobby-2, 20 GB); primary R2 jurisdiction `us`; recovery `us-west-004`; KMS `us-east-1`. Services: studio-production, studio-staging, registry-production, registry-staging.

| Provider | Role | Data categories | Estate status |
| --- | --- | --- | --- |
| Fly.io | Managed Studio and template-registry compute | request data; runtime secrets; operational logs | selected-candidate |
| Crunchy Data / Crunchy Bridge on AWS | Managed PostgreSQL cluster | research data; account data; application metadata | selected-candidate |
| Cloudflare | CDN, DNS, ingress Worker, and primary R2 object storage | research assets; API request data; signed object requests; routing metadata | selected-candidate |
| Amazon Web Services | KMS application-root wrapping and observability anchor candidate | KMS-wrapped root-key material; operational anchor state | encoded-candidate |
| Backblaze | Independent encrypted recovery archive storage | encrypted database dumps; encrypted object archives | selected-candidate |
| New Relic | Operational logs, metrics, queries, and alerts | sanitized operational logs; aggregate metrics | cost-candidate |
| PostHog relay | Existing application telemetry and error reporting | redacted telemetry; sanitized error reports | existing-integration |
| Netlify | Studio branch-preview client and function hosting; approved production domains networkcanvas.studio and staging studio.networkcanvas.dev | preview traffic; build artifacts | existing-preview-only |
| Postmark | Transactional application mail provider | recipient addresses; transactional message content | application-integration |

Provider legal entities, affiliates, retention/deletion, security reports, breach terms, support, and account recovery must be confirmed by the #1260 publication process.
