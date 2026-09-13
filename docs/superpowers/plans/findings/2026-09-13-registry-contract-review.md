# Registry contract review corrections

The public contract and account UI must describe the same authority and parsing rules enforced by the service. This batch addresses PR #1745 report cursor, canonical format and credential permission findings, plus public specification PR #1 moderator issuance and UTF-8 BOM findings.

- One exported sequence schema bounds both opaque entry cursor payloads and report cursors to PostgreSQL positive bigint. The OpenAPI pattern carries the full bound; independent BigInt boundary and deterministic sample oracles check both generated dialects and runtime parsing.
- Both OpenAPI dialects describe the live operator requirement for issuing or using moderation credentials. The actual credential boundary PostgreSQL tests cover non-operator issuance and operator revocation.
- The app-owned exchange specification is the sole normative format source. The older repository path is a compatibility pointer. Exactly one initial UTF-8 BOM is consumed for JSON and GeoJSON decoding; additional or displaced BOMs are invalid, while archive bytes and hashes remain unchanged.
- Credential rows show their actual localized permission labels, distinguishing otherwise identical credentials without revealing secrets.

Verification: 90 contract cases, 59 exchange cases, 14 account UI cases, 3 PostgreSQL credential boundary cases, Registry backend and account typechecks, lint and Knip pass. Pinned openapi-python-client 0.29.0 generated without warnings and completed its actual localhost round trip. Disabling BOM consumption fails the byte-preserving artifact regression; removing row permission labels fails the account regression. Lint retains two existing Credentials.tsx warnings and Knip retains two existing script hints. No Architect, Interview or Interviewer rendered baseline consumes this account screen. The existing pending Registry account/service changesets cover this initial product behavior; explicit TextDecoder options preserve the existing exchange behavior.

Recovery ownership reconciliation, no-op moderation report resolution and publisher profile audit corrections are isolated on the registry-recovery-review branch and require integration before the next complete review round. No production deployment or recovery qualification is claimed by these source checks.
