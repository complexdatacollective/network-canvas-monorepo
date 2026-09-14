# Studio managed hosting budget review

Status: Candidate comparison, 2026-09-07. No paid resources provisioned; this is not a deployment or recovery qualification.

The authorized ceiling is **$100 per month for hosting**. Codex and AI usage are outside that ceiling. The current technically plausible candidate already exceeds the ceiling before its required independent recovery and monitoring services are included. Do not provision this candidate under the existing authorization, assume shared free allowances are unused, or reduce the accepted recovery requirements to make the estimate fit.

## Candidate and fixed-cost floor

All amounts are USD, before applicable taxes. Compute uses a 31-day month and on-demand rates; no annual prepayment or promotional credits are assumed.

| Component                       | Candidate allocation                                                                                                                                    | Monthly amount |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------: |
| Managed PostgreSQL 18           | Crunchy Bridge Standard-4 in AWS us-east-1, 4 GB RAM, 20 GB storage; four separately enrolled databases for Studio and Registry, production and staging |         $72.00 |
| Persistent application services | Four Fly Machines in iad, shared-cpu-1x, 512 MB each, continuously running; one Studio and one Registry service per environment                         |         $13.18 |
| Managed application email       | Postmark Basic, 10,000 emails per month, shared across bounded product streams                                                                          |         $15.00 |
| Application root wrapping       | Two AWS KMS keys, one per environment, including the recurring cost after the first two rotations                                                       |          $6.00 |
| **Fixed-cost floor**            | **Excludes all remaining rows below**                                                                                                                   |    **$106.18** |

Crunchy Bridge lists Standard-4 at $70/month and storage at $0.10/GB/month. Its role API explicitly provides a PostgreSQL superuser for administrator provisioning and permits ordinary SQL role creation. That is relevant to the administrator-only large-object/catalog privilege setup; the application and migration processes still use their separate restricted identities. A single cluster is a shared capacity and failure boundary; database CONNECT enrollment must keep all four installations isolated. These are technical candidates, not proof that the live provider accepts every required grant or setting. [Plans and pricing](https://docs.crunchybridge.com/concepts/plans-pricing), [role capabilities](https://docs.crunchybridge.com/api/postgres-role).

The live Fly iad table lists $0.00000123/second for a 512 MB shared-cpu-1x machine. Four machines for 2,678,400 seconds cost $13.177728. The existing local Registry image experiment stayed below 512 MB under a bounded load; the final composed images and managed load still require qualification. No extra replicas, dedicated egress addresses, migration jobs, or validators are included in this row. [Fly pricing](https://fly.io/docs/about/pricing/).

Postmark's free tier is limited to 100 messages/month and refuses overages; Basic is $15/month, with no intermediate tier. The production estimate therefore includes Basic rather than treating the integration-testing allowance as established production capacity. This preserves the managed Postmark transport selected in #1305. [Postmark pricing](https://postmarkapp.com/pricing).

AWS KMS charges $1/key/month, plus $1/month for each of the first two key-material rotations. Two keys initially cost $2/month and eventually $6/month before requests. Even the initial $102.18 floor exceeds the ceiling. Historical application roots remain subject to independent operator custody; KMS alone is not a recovery plan. [KMS pricing](https://aws.amazon.com/kms/pricing/).

## Costs and capabilities still required before selection

- **Independent database recovery:** four dumps every 30 minutes, read-back/decrypt/scratch-restore validation before advancing each checkpoint, all generations for seven days and daily generations for 30 days. At steady state this is approximately 359 retained full generations per database, plus incomplete/retry overlap. Storage and transfer depend on measured compressed dump size, not merely provisioned database disk.
- **Independent object recovery:** authoritative inventory reconciliation and validated copies within five minutes, indefinite retention for live references, at least 31 days for deleted/overwritten versions, and a budgeted 30-day integrity scrub. Request, retained-version, transfer and replay costs must be included.
- **Immutable second-provider custody:** Backblaze B2 is a candidate, with US-region and Object Lock qualification still pending. Published storage is $6.95/TB per 30 days; free egress is bounded by stored volume. Do not assume that recurring restoration reads and capture uploads are free at either end. [B2 pricing](https://www.backblaze.com/cloud-storage/pricing), [Object Lock](https://www.backblaze.com/docs/cloud-storage-object-lock).
- **Disposable independent validation:** encrypted ephemeral scratch storage, no public ingress, restricted egress, independently held decryption credentials, deadlines and independent orphan cleanup. A Lambda prototype would need to prove PostgreSQL compatibility, duration and network restrictions; it is not yet selected. For scale, 5,952 validations/month at 2 GB for 30 seconds consume 357,120 GB-seconds, or about $5.95 before ancillary costs and without assuming free-tier availability. Actual duration must be measured. [Lambda pricing](https://aws.amazon.com/lambda/pricing/).
- **Thirty-day logs and metrics, independent alerts, and recovery reserve:** free monitoring tiers must meet the required retention rather than silently shorten it. Alert transport must remain usable with Studio's dispatcher and mail provider unavailable. Costs for the selected service, message delivery, quarterly drills and exceptional recovery compute remain to be added.
- **Primary object storage, CDN, transfer, API calls and domain renewal:** existing Netlify account entitlements need a current account-level check. US-jurisdiction R2 is a candidate for live objects; a location hint alone is not a residency guarantee. [R2 data location](https://developers.cloudflare.com/r2/reference/data-location/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/).
- **Enforceable growth envelope:** estimate normal traffic, archive size and changed-object volume, retain a usage reserve, and alert before projected cost reaches the approved ceiling. Do not delete protected recovery generations or stop required recovery checks merely to meet a budget.

## Provider qualification gaps

Crunchy Bridge documents daily physical backups with WAL shipping every 60 seconds or 16 MB and ten days of continuous recovery history. Its public backup-list endpoint reports base-backup completion, which alone cannot establish the latest continuously restorable point. The backup-token interface exposes a pgBackRest repository, but a bounded, fresh, authenticated recovery-point monitor still needs implementation and live stopped-stream/idle-database qualification. Restore every database and verify grants, effective tuning, historical keys, data, object references and end-to-end recovery time. [Backup behavior](https://docs.crunchybridge.com/concepts/backups), [backup API](https://docs.crunchybridge.com/api/cluster-backup).

DigitalOcean was considered earlier, but its restricted administrator's compatibility with required catalog revocations and a provable current PITR checkpoint remain unresolved. A cheaper advertised database is not an accepted substitute until those requirements pass. DigitalOcean browser access currently reaches its sign-in page; no account was selected or provisioned.

The fixed-cost conflict is established; the final full-estate amount is not. Complete the recovery/monitor design and measured cost envelope, then present a concrete revised authorization request or a fully qualified cheaper alternative. Implementation, local qualification and PR delivery continue while paid provisioning remains unapproved.
