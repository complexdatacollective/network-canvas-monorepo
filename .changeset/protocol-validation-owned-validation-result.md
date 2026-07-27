---
'@codaco/protocol-validation': major
---

`validateProtocol` now returns a domain-owned `ProtocolValidationResult` instead of Zod's `SafeParseReturnType`. The result envelope is unchanged (`{ success: true, data }` / `{ success: false, error }`), but on failure `error` is now a `ProtocolValidationError` — an `Error` subclass carrying `issues: ProtocolValidationIssue[]` (`{ code, path, message }`) whose `message` renders the issues as a readable `path: message` list. `ProtocolValidationResult`, `ProtocolValidationIssue`, `ProtocolValidationError`, and `formatProtocolValidationIssues` are all exported.

No changes are needed if you only read `result.success`, `result.data`, `result.error.message`, or the `code`/`path`/`message` fields of `result.error.issues`. Code relying on Zod specifics must migrate: `error instanceof z.ZodError` checks, `error.format()`/`error.flatten()`, per-code issue fields (`expected`, `received`, `minimum`, …), or narrowing against Zod's literal issue-code union. The CLI prints the formatted issue list on failure.

Internally, entity-reference collection no longer touches Zod's private `zod/v4/core` internals; schema traversal now uses only Zod 4's public API.
