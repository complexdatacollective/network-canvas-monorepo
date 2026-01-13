---
"@codaco/protocol-validation": major
---

Add required `name` property to protocol schema (breaking change)

**Schema changes:**
- Protocol schema now requires a `name` property (`string`, min 1 character)

**Migration changes (v7 → v8):**
- Migration now requires a `name` dependency to be provided when migrating from v7
  

