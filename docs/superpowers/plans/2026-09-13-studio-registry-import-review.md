# Registry import review corrections

The asset store fixes transport metadata on its first content-hash write. Registry artifacts may validly give identical JSON bytes different source names and compatible declared media types (application/json and application/geo+json). The existing completed import intent already retains the immutable per-reference manifest. Import now checks stored byte identity/size, and republication reads each reference's declared media type from that manifest while re-verifying the retrieved hash and complete rebuilt artifact. Ordinary non-Registry publication retains the existing metadata checks. The shared object is not rewritten.

The PostgreSQL round-trip regression seeds an existing canonical JSON object, imports both typed aliases, and republishes them. It asserts both declared types and the exact original Merkle root. The previous code fails with STORAGE_UNAVAILABLE; the corrected code and same-type filename-alias case pass.

Pending imports that encounter TEMPLATE_REGISTRY_SCHEMA_UNSUPPORTED now enter owner-fenced, audited quarantine with reason schema_unsupported. The regression injects the typed client error after an existing intent is claimed, then verifies the terminal status, audit event and absence of local publication. The previous code rethrows instead of quarantining. Existing 404/410 cases remain covered.

Validation: 32 Registry/audit PostgreSQL tests passed, Studio server types passed, lint passed, Knip passed with the two existing configuration hints. No numbered migration or rendered UI surface changed.
