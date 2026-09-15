---
'@codaco/protocol-validation': patch
---

Declare `jszip` as a runtime dependency. The published bundle still inlines it,
so a published install keeps working with nothing extra to fetch, but the
package's type surface imports it and workspace consumers that compile this
package from source resolve its imports themselves — including under a
production install (`pnpm deploy --prod`), which installs only `dependencies`.
