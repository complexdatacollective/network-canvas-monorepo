# Legacy Protocol Migrations (v1→v7)

## Goal

Reimplement protocol migration support for schema versions 1 through 7, so the `protocol-validation` package can migrate protocols from any version (1-8) to the current version (8). Previously this was handled by a separate package using AJV; now it will be integrated into the existing Zod-based system.

## Approach

Port the old migration functions into the existing `MigrationChain` system. No AJV or JSON Schema files needed — just transform functions registered as migration steps. Validation happens only at v8 (Zod), with step-level error reporting if a migration fails.

## Schema Version Type

Expand `SchemaVersion` from `7 | 8` to `1 | 2 | 3 | 4 | 5 | 6 | 7 | 8`.

Affected files:
- `src/schemas/index.ts` — `SchemaVersionSchema` union
- `src/migration/index.ts` — `ProtocolDocument<V>` type (versions 1-6 use the fallback `{ schemaVersion: V; [key: string]: unknown }`)

No new Zod schemas for v1-v6. The `VersionedProtocolSchema` discriminated union stays as v7 | v8.

## Migration Files

| File | From → To | Transform |
|------|-----------|-----------|
| `src/schemas/2/migration.ts` | 1 → 2 | No-op, bump version |
| `src/schemas/3/migration.ts` | 2 → 3 | No-op, bump version |
| `src/schemas/4/migration.ts` | 3 → 4 | Sanitize variable/type names (spaces→underscore, remove special chars), deduplicate with numerical suffix, remove non-boolean additionalAttributes from prompts |
| `src/schemas/5/migration.ts` | 4 → 5 | No-op, bump version |
| `src/schemas/6/migration.ts` | 5 → 6 | Rename NameGeneratorAutoComplete/List → NameGeneratorRoster |
| `src/schemas/7/migration.ts` | 6 → 7 | No-op, bump version |
| `src/schemas/8/migration.ts` | 7 → 8 | (existing, unchanged) |

Each migration follows the `createMigration()` pattern with `from`, `to`, `notes`, `dependencies`, and `migrate` fields.

## Registration

All migrations registered in `src/migration/migrate-protocol.ts` alongside the existing v7→v8 registration.

## detectSchemaVersion Changes

Expand to detect versions 1-8. Handle v1's string-typed schemaVersion (`"1"` → `1` coercion).

## Pre-validation Change

Currently `migrateProtocol()` validates input against `VersionedProtocolSchema` (v7/v8 only). For versions 1-6, skip Zod pre-validation — just detect version and run migration chain. Post-validation at v8 with Zod remains.

## Error Handling

Existing `MigrationStepError` already captures `from`/`to` version. No changes needed.

## Public API Impact

- `migrateProtocol()` — accepts versions 1-8 (was 7-8)
- `getMigrationInfo()` — accepts versions 1-8
- `validateProtocol()` — unchanged (validates v7/v8 only; older versions must be migrated first)
- `SchemaVersion` type — `1 | 2 | 3 | 4 | 5 | 6 | 7 | 8`

## Testing

- Unit tests for v3→v4 migration (sanitization logic, deduplication, additionalAttributes removal)
- Unit tests for v5→v6 migration (NameGenerator type renaming)
- Integration test: migrate a v1 protocol to v8 and validate
- Test that `MigrationStepError` correctly identifies the failing step

## Source Reference

Old migration functions ported from: https://github.com/complexdatacollective/protocol-validation/tree/master/src/migrations/migrations
