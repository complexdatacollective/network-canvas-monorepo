# Authenticate Studio release history

Implemented locally for #1243; workflow integration and live Cosign/upgrade qualification remain open.

The publication caller fetches main and all release tags while holding the non-cancelling distribution lock, then calls `authenticateStudioReleaseHistory`. The reader requires annotated source-matching tags, published GitHub releases whose body and tag bind the manifest digest, and manifest signatures under the installer's fixed GitHub Actions issuer/workflow policy. Missing releases, assets, permission errors and malformed evidence fail; an interrupted draft is excluded from supported history. A newer or unrelated final tag blocks an older candidate even when that tag's release is still a draft.

Every authenticated manifest must match its Git source and generation. Published sources form one ancestry chain. The newest published prior release supplies image-reuse metadata; a same-source retry is never its own upgrade parent. The supported range defaults to all authenticated prior releases and can only be narrowed with an explicit authenticated oldest source. More than 20 supported sources requires an explicit range decision; the reader never silently drops old supported installations. It returns the oldest and immediately preceding supported releases for cumulative-upgrade qualification.

The reader authenticates historical manifest bytes, not the images or a running upgrade. Preparation and final publication must still verify image signatures, retain exact retry artifacts, execute fresh/upgrade/recovery qualification, and reevaluate release eligibility and ancestry before publication. The new reader cannot replace any of those gates.

Validation uses real temporary Git histories and a deterministic signature-command boundary to check exact bytes, fixed trust arguments, restrictive staging permissions and cleanup. Separate negative controls remove signature verification or Git-generation binding from disposable module copies and require the matching refusal test to fail. These controls do not claim live Sigstore cryptographic qualification.
