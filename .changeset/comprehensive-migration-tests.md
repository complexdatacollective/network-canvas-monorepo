---
"@codaco/protocol-validation": minor
---

Add comprehensive migration tests and wildcard support for schema transformations

- Add comprehensive test suite for v7 to v8 migration covering all transformations (displayVariable removal, Toggle options removal, filter type transformations, schema version updates)
- Extend traverseAndTransform utility to support wildcard (*) syntax in transformation paths
- Add 9 new tests for wildcard functionality including nested paths, multiple wildcards, and edge cases
- Create Protocol<V> generic type for discriminated union extraction by schema version
- Fix TypeScript compilation errors using schema validation and optional chaining patterns
- Update extractProtocol utility to use VersionedProtocol type for better type safety
