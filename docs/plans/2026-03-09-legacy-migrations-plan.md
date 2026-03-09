# Legacy Protocol Migrations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add migration support for protocol schema versions 1-7, so protocols from any version can be migrated to the current version 8.

**Architecture:** Port old migration functions into the existing `MigrationChain` system. Each version gets a migration file in `src/schemas/<version>/migration.ts`. No AJV or JSON Schema needed — just transform functions. Pre-validation is skipped for versions 1-6; post-validation at v8 with Zod catches issues.

**Tech Stack:** TypeScript, Zod, Vitest

---

### Task 1: Expand SchemaVersion to 1-8

**Files:**
- Modify: `packages/protocol-validation/src/schemas/index.ts`

**Step 1: Update SchemaVersionSchema**

Change the union from `[z.literal(7), z.literal(8)]` to include all 8 versions:

```typescript
export const SchemaVersionSchema = z.union([
	z.literal(1),
	z.literal(2),
	z.literal(3),
	z.literal(4),
	z.literal(5),
	z.literal(6),
	z.literal(7),
	z.literal(8),
]);
```

`VersionedProtocolSchema` stays as `z.discriminatedUnion("schemaVersion", [ProtocolSchemaV7, ProtocolSchemaV8])` — no change needed.

**Step 2: Verify types compile**

Run: `pnpm --filter @codaco/protocol-validation typecheck`
Expected: PASS (the `ProtocolDocument<V>` fallback branch handles versions 1-6)

**Step 3: Commit**

```
feat(protocol-validation): expand SchemaVersion to support versions 1-8
```

---

### Task 2: Update detectSchemaVersion and migrateProtocol

**Files:**
- Modify: `packages/protocol-validation/src/migration/migrate-protocol.ts`

**Step 1: Write failing tests**

Add to `packages/protocol-validation/src/migration/__tests__/migrations.test.ts`:

```typescript
// In the detectSchemaVersion describe block:
it("detects versions 1 through 6", () => {
	for (const v of [1, 2, 3, 4, 5, 6]) {
		const doc = { schemaVersion: v };
		expect(detectSchemaVersion(doc)).toBe(v);
	}
});

it("coerces string schemaVersion for v1", () => {
	const doc = { schemaVersion: "1" };
	expect(detectSchemaVersion(doc)).toBe(1);
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @codaco/protocol-validation test -- --run`
Expected: FAIL — versions 1-6 not detected, string "1" throws

**Step 3: Update detectSchemaVersion**

In `migrate-protocol.ts`, update `detectSchemaVersion` to handle string coercion for v1:

```typescript
export function detectSchemaVersion(document: unknown): SchemaVersion {
	try {
		const rawVersion = (document as { schemaVersion?: unknown })?.schemaVersion;

		// Handle v1 string schemaVersion ("1" -> 1)
		const coerced = typeof rawVersion === "string" ? Number(rawVersion) : rawVersion;

		const partial = SchemaVersionSchema.safeParse(coerced);

		if (partial.success) {
			return partial.data;
		}
		throw new SchemaVersionDetectionError();
	} catch {
		throw new SchemaVersionDetectionError();
	}
}
```

**Step 4: Update migrateProtocol to skip pre-validation for v1-6**

The current `migrateProtocol` validates input against `VersionedProtocolSchema` (v7/v8 only). For older versions, skip that check:

```typescript
export function migrateProtocol(
	document: unknown,
	targetVersion: SchemaVersion = CURRENT_SCHEMA_VERSION,
	dependencies: Record<string, unknown> = {},
): CurrentProtocol {
	const detectedVersion = detectSchemaVersion(document);

	// Only pre-validate versions that have Zod schemas (7+)
	if (detectedVersion >= 7) {
		const preValidationResult = VersionedProtocolSchema.safeParse(document);
		if (!preValidationResult.success) {
			throw new ValidationError(
				`Invalid protocol document for version ${detectedVersion}: ${preValidationResult.error.message}`,
				detectedVersion,
			);
		}
	}

	const migrated = protocolMigrations.migrate(document as ProtocolDocument<SchemaVersion>, targetVersion, dependencies);

	const postValidationResult = CurrentProtocolSchema.safeParse(migrated);
	if (!postValidationResult.success) {
		throw new ValidationError(
			`Migration resulted in invalid protocol: ${postValidationResult.error.message}`,
			targetVersion,
		);
	}

	return postValidationResult.data;
}
```

**Step 5: Run tests to verify they pass**

Run: `pnpm --filter @codaco/protocol-validation test -- --run`
Expected: New detection tests PASS. Existing tests still pass.

**Step 6: Update existing tests that expect v6 to throw**

The test at `migrations.test.ts:19` (`"throws error for unknown versions"` with schemaVersion 6) now needs to use a version outside 1-8, like 0 or 99. Similarly `migrate-protocol-extended.test.ts:60` (`getMigrationInfo(6 as never, 8)`) should now actually work once migrations are registered — update to use `0 as never`.

**Step 7: Commit**

```
feat(protocol-validation): detect schema versions 1-6 and skip pre-validation for legacy protocols
```

---

### Task 3: Create no-op migrations (v1→v2, v2→v3, v4→v5, v6→v7)

**Files:**
- Create: `packages/protocol-validation/src/schemas/2/migration.ts`
- Create: `packages/protocol-validation/src/schemas/3/migration.ts`
- Create: `packages/protocol-validation/src/schemas/5/migration.ts`
- Create: `packages/protocol-validation/src/schemas/7/migration.ts`

**Step 1: Write tests**

Add to `packages/protocol-validation/src/migration/__tests__/migrations.test.ts`:

```typescript
describe("no-op migrations", () => {
	it("v1→v2: bumps version", () => {
		const result = migrationV1toV2.migrate(
			{ schemaVersion: 1 as const } as ProtocolDocument<1>,
			{},
		);
		expect(result.schemaVersion).toBe(2);
	});

	it("v2→v3: bumps version", () => {
		const result = migrationV2toV3.migrate(
			{ schemaVersion: 2 as const } as ProtocolDocument<2>,
			{},
		);
		expect(result.schemaVersion).toBe(3);
	});

	it("v4→v5: bumps version", () => {
		const result = migrationV4toV5.migrate(
			{ schemaVersion: 4 as const } as ProtocolDocument<4>,
			{},
		);
		expect(result.schemaVersion).toBe(5);
	});

	it("v6→v7: bumps version", () => {
		const result = migrationV6toV7.migrate(
			{ schemaVersion: 6 as const } as ProtocolDocument<6>,
			{},
		);
		expect(result.schemaVersion).toBe(7);
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @codaco/protocol-validation test -- --run`
Expected: FAIL — imports don't exist

**Step 3: Create the migration files**

Each no-op migration follows this pattern (example for v1→v2):

`packages/protocol-validation/src/schemas/2/migration.ts`:
```typescript
import { createMigration, type ProtocolDocument } from "~/migration";

const migrationV1toV2 = createMigration({
	from: 1,
	to: 2,
	dependencies: {},
	migrate: (doc) => ({
		...doc,
		schemaVersion: 2 as const,
	}) as ProtocolDocument<2>,
});

export default migrationV1toV2;
```

Repeat for v2→v3 (`schemas/3/migration.ts`), v4→v5 (`schemas/5/migration.ts`), v6→v7 (`schemas/7/migration.ts`) with appropriate version numbers.

Notes for each:
- v1→v2: no notes
- v2→v3: no notes
- v4→v5: `notes` from old `5.js` (TieStrengthCensus, validation options, interview script)
- v6→v7: `notes` from old `7.js` (min/max alters, skip logic options)

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @codaco/protocol-validation test -- --run`
Expected: PASS

**Step 5: Commit**

```
feat(protocol-validation): add no-op migrations for v1→v2, v2→v3, v4→v5, v6→v7
```

---

### Task 4: Create v3→v4 migration (sanitize names)

**Files:**
- Create: `packages/protocol-validation/src/schemas/4/migration.ts`
- Create: `packages/protocol-validation/src/schemas/4/__tests__/migration.test.ts`

This is the most complex migration. It ports the logic from the old `4.js`.

**Step 1: Write tests**

Create `packages/protocol-validation/src/schemas/4/__tests__/migration.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { ProtocolDocument } from "~/migration";
import migrationV3toV4 from "../migration";

describe("Migration V3 to V4", () => {
	describe("variable name sanitization", () => {
		it("replaces spaces with underscores in variable names", () => {
			const v3Protocol = {
				schemaVersion: 3 as const,
				codebook: {
					node: {
						person: {
							name: "Person",
							variables: {
								var1: { name: "first name", type: "text" },
							},
						},
					},
				},
				stages: [],
			} as ProtocolDocument<3>;

			const result = migrationV3toV4.migrate(v3Protocol, {});
			const variables = (result as Record<string, unknown> & { codebook: Record<string, unknown> })
				.codebook.node as Record<string, { variables: Record<string, { name: string }> }>;
			expect(variables.person.variables.var1.name).toBe("first_name");
		});

		it("removes special characters from variable names", () => {
			const v3Protocol = {
				schemaVersion: 3 as const,
				codebook: {
					node: {
						person: {
							name: "Person",
							variables: {
								var1: { name: "name@#$%!", type: "text" },
							},
						},
					},
				},
				stages: [],
			} as ProtocolDocument<3>;

			const result = migrationV3toV4.migrate(v3Protocol, {});
			const variables = (result as Record<string, unknown> & { codebook: Record<string, unknown> })
				.codebook.node as Record<string, { variables: Record<string, { name: string }> }>;
			expect(variables.person.variables.var1.name).toBe("name");
		});

		it("deduplicates variable names with numerical suffix", () => {
			const v3Protocol = {
				schemaVersion: 3 as const,
				codebook: {
					node: {
						person: {
							name: "Person",
							variables: {
								var1: { name: "first name", type: "text" },
								var2: { name: "first_name", type: "text" },
							},
						},
					},
				},
				stages: [],
			} as ProtocolDocument<3>;

			const result = migrationV3toV4.migrate(v3Protocol, {});
			const variables = (result as Record<string, unknown> & { codebook: Record<string, unknown> })
				.codebook.node as Record<string, { variables: Record<string, { name: string }> }>;
			expect(variables.person.variables.var1.name).toBe("first_name");
			expect(variables.person.variables.var2.name).toBe("first_name2");
		});
	});

	describe("option value sanitization", () => {
		it("sanitizes ordinal/categorical option values", () => {
			const v3Protocol = {
				schemaVersion: 3 as const,
				codebook: {
					node: {
						person: {
							name: "Person",
							variables: {
								var1: {
									name: "category",
									type: "categorical",
									options: [
										{ label: "Option A", value: "option A" },
										{ label: "Option B", value: "option B" },
									],
								},
							},
						},
					},
				},
				stages: [],
			} as ProtocolDocument<3>;

			const result = migrationV3toV4.migrate(v3Protocol, {});
			const variables = (result as Record<string, unknown> & { codebook: Record<string, unknown> })
				.codebook.node as Record<string, { variables: Record<string, { options: Array<{ value: string }> }> }>;
			expect(variables.person.variables.var1.options[0].value).toBe("option_A");
			expect(variables.person.variables.var1.options[1].value).toBe("option_B");
		});
	});

	describe("type name sanitization", () => {
		it("sanitizes node type names", () => {
			const v3Protocol = {
				schemaVersion: 3 as const,
				codebook: {
					node: {
						t1: { name: "My Type", variables: {} },
					},
				},
				stages: [],
			} as ProtocolDocument<3>;

			const result = migrationV3toV4.migrate(v3Protocol, {});
			const node = (result as Record<string, unknown> & { codebook: Record<string, unknown> })
				.codebook.node as Record<string, { name: string }>;
			expect(node.t1.name).toBe("My_Type");
		});

		it("deduplicates type names with numerical suffix", () => {
			const v3Protocol = {
				schemaVersion: 3 as const,
				codebook: {
					node: {
						t1: { name: "My Type", variables: {} },
						t2: { name: "My_Type", variables: {} },
					},
				},
				stages: [],
			} as ProtocolDocument<3>;

			const result = migrationV3toV4.migrate(v3Protocol, {});
			const node = (result as Record<string, unknown> & { codebook: Record<string, unknown> })
				.codebook.node as Record<string, { name: string }>;
			expect(node.t1.name).toBe("My_Type");
			expect(node.t2.name).toBe("My_Type2");
		});
	});

	describe("additionalAttributes filtering", () => {
		it("removes non-boolean additionalAttributes from prompts", () => {
			const v3Protocol = {
				schemaVersion: 3 as const,
				codebook: { node: {}, edge: {} },
				stages: [
					{
						id: "stage1",
						type: "NameGenerator",
						prompts: [
							{
								id: "prompt1",
								text: "Test",
								additionalAttributes: [
									{ variable: "v1", value: true },
									{ variable: "v2", value: "text value" },
									{ variable: "v3", value: false },
									{ variable: "v4", value: 42 },
								],
							},
						],
					},
				],
			} as ProtocolDocument<3>;

			const result = migrationV3toV4.migrate(v3Protocol, {});
			const stages = (result as Record<string, unknown>).stages as Array<{
				prompts: Array<{ additionalAttributes?: Array<{ value: unknown }> }>;
			}>;
			const attrs = stages[0].prompts[0].additionalAttributes;
			expect(attrs).toHaveLength(2);
			expect(attrs![0].value).toBe(true);
			expect(attrs![1].value).toBe(false);
		});

		it("removes additionalAttributes entirely if no boolean values remain", () => {
			const v3Protocol = {
				schemaVersion: 3 as const,
				codebook: { node: {}, edge: {} },
				stages: [
					{
						id: "stage1",
						type: "NameGenerator",
						prompts: [
							{
								id: "prompt1",
								text: "Test",
								additionalAttributes: [
									{ variable: "v1", value: "text" },
									{ variable: "v2", value: 42 },
								],
							},
						],
					},
				],
			} as ProtocolDocument<3>;

			const result = migrationV3toV4.migrate(v3Protocol, {});
			const stages = (result as Record<string, unknown>).stages as Array<{
				prompts: Array<{ additionalAttributes?: unknown }>;
			}>;
			expect(stages[0].prompts[0]).not.toHaveProperty("additionalAttributes");
		});
	});

	describe("schema version", () => {
		it("bumps schemaVersion to 4", () => {
			const v3Protocol = {
				schemaVersion: 3 as const,
				codebook: { node: {}, edge: {} },
				stages: [],
			} as ProtocolDocument<3>;

			const result = migrationV3toV4.migrate(v3Protocol, {});
			expect(result.schemaVersion).toBe(4);
		});
	});

	describe("metadata", () => {
		it("has correct from and to versions", () => {
			expect(migrationV3toV4.from).toBe(3);
			expect(migrationV3toV4.to).toBe(4);
		});

		it("has migration notes", () => {
			expect(migrationV3toV4.notes).toBeDefined();
			expect(migrationV3toV4.notes!.length).toBeGreaterThan(0);
		});
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @codaco/protocol-validation test -- --run`
Expected: FAIL — import doesn't exist

**Step 3: Implement the migration**

Create `packages/protocol-validation/src/schemas/4/migration.ts`. Port the sanitization logic from old `4.js`, converted to TypeScript:

Key functions to port:
- `getSafeValue(value, existing)` — sanitize string (spaces→`_`, remove special chars), deduplicate with suffix
- `getNextSafeValue(value, existing, inc)` — find next unique value with numerical suffix
- `migrateOptionValues(options)` — sanitize option values
- `migrateVariable(variable, acc)` — sanitize variable name and options
- `migrateVariables(variables)` — iterate variables
- `migrateType(type, acc)` — sanitize type name and its variables
- `migrateTypes(types)` — iterate types
- `migratePrompt(prompt)` — filter non-boolean additionalAttributes
- `migrateStage(stage)` — apply prompt migration
- `migrateStages(stages)` — iterate stages

Wrap in `createMigration({ from: 3, to: 4, ... })`. Include the notes from old `4.js`.

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @codaco/protocol-validation test -- --run`
Expected: PASS

**Step 5: Commit**

```
feat(protocol-validation): add v3→v4 migration (sanitize names, filter additionalAttributes)
```

---

### Task 5: Create v5→v6 migration (merge NameGenerator types)

**Files:**
- Create: `packages/protocol-validation/src/schemas/6/migration.ts`
- Create: `packages/protocol-validation/src/schemas/6/__tests__/migration.test.ts`

**Step 1: Write tests**

Create `packages/protocol-validation/src/schemas/6/__tests__/migration.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { ProtocolDocument } from "~/migration";
import migrationV5toV6 from "../migration";

describe("Migration V5 to V6", () => {
	it("renames NameGeneratorAutoComplete to NameGeneratorRoster", () => {
		const v5Protocol = {
			schemaVersion: 5 as const,
			codebook: { node: {}, edge: {} },
			stages: [
				{ id: "s1", type: "NameGeneratorAutoComplete", prompts: [] },
			],
		} as ProtocolDocument<5>;

		const result = migrationV5toV6.migrate(v5Protocol, {});
		const stages = (result as Record<string, unknown>).stages as Array<{ type: string }>;
		expect(stages[0].type).toBe("NameGeneratorRoster");
	});

	it("renames NameGeneratorList to NameGeneratorRoster", () => {
		const v5Protocol = {
			schemaVersion: 5 as const,
			codebook: { node: {}, edge: {} },
			stages: [
				{ id: "s1", type: "NameGeneratorList", prompts: [] },
			],
		} as ProtocolDocument<5>;

		const result = migrationV5toV6.migrate(v5Protocol, {});
		const stages = (result as Record<string, unknown>).stages as Array<{ type: string }>;
		expect(stages[0].type).toBe("NameGeneratorRoster");
	});

	it("does not modify other stage types", () => {
		const v5Protocol = {
			schemaVersion: 5 as const,
			codebook: { node: {}, edge: {} },
			stages: [
				{ id: "s1", type: "NameGenerator", prompts: [] },
				{ id: "s2", type: "Sociogram", prompts: [] },
			],
		} as ProtocolDocument<5>;

		const result = migrationV5toV6.migrate(v5Protocol, {});
		const stages = (result as Record<string, unknown>).stages as Array<{ type: string }>;
		expect(stages[0].type).toBe("NameGenerator");
		expect(stages[1].type).toBe("Sociogram");
	});

	it("bumps schemaVersion to 6", () => {
		const v5Protocol = {
			schemaVersion: 5 as const,
			codebook: { node: {}, edge: {} },
			stages: [],
		} as ProtocolDocument<5>;

		const result = migrationV5toV6.migrate(v5Protocol, {});
		expect(result.schemaVersion).toBe(6);
	});

	it("has migration notes", () => {
		expect(migrationV5toV6.notes).toBeDefined();
		expect(migrationV5toV6.notes!.length).toBeGreaterThan(0);
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @codaco/protocol-validation test -- --run`
Expected: FAIL

**Step 3: Implement the migration**

Create `packages/protocol-validation/src/schemas/6/migration.ts`:

```typescript
import { createMigration, type ProtocolDocument } from "~/migration";

const migrationV5toV6 = createMigration({
	from: 5,
	to: 6,
	dependencies: {},
	notes: `
- Replace roster-based name generators (small and large) with a single new interface that combines the functionality of both. This will change the interview experience, and may impact your data collection!
- Enable support for using the automatic node positioning feature on the Sociogram interface.
`,
	migrate: (doc) => {
		const protocol = doc as Record<string, unknown>;
		const stages = (protocol.stages as Array<Record<string, unknown>>) ?? [];

		const migratedStages = stages.map((stage) => {
			if (stage.type !== "NameGeneratorAutoComplete" && stage.type !== "NameGeneratorList") {
				return stage;
			}
			return { ...stage, type: "NameGeneratorRoster" };
		});

		return {
			...protocol,
			schemaVersion: 6 as const,
			stages: migratedStages,
		} as ProtocolDocument<6>;
	},
});

export default migrationV5toV6;
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @codaco/protocol-validation test -- --run`
Expected: PASS

**Step 5: Commit**

```
feat(protocol-validation): add v5→v6 migration (merge NameGenerator types into NameGeneratorRoster)
```

---

### Task 6: Register all migrations and update tests

**Files:**
- Modify: `packages/protocol-validation/src/migration/migrate-protocol.ts`
- Modify: `packages/protocol-validation/src/migration/__tests__/migrations.test.ts`
- Modify: `packages/protocol-validation/src/migration/__tests__/migrate-protocol-extended.test.ts`

**Step 1: Register all migrations**

In `migrate-protocol.ts`, import and register all migration files:

```typescript
import migrationV1toV2 from "../schemas/2/migration";
import migrationV2toV3 from "../schemas/3/migration";
import migrationV3toV4 from "../schemas/4/migration";
import migrationV4toV5 from "../schemas/5/migration";
import migrationV5toV6 from "../schemas/6/migration";
import migrationV6toV7 from "../schemas/7/migration";
import migrationV7toV8 from "../schemas/8/migration";

protocolMigrations.register(migrationV1toV2);
protocolMigrations.register(migrationV2toV3);
protocolMigrations.register(migrationV3toV4);
protocolMigrations.register(migrationV4toV5);
protocolMigrations.register(migrationV5toV6);
protocolMigrations.register(migrationV6toV7);
protocolMigrations.register(migrationV7toV8);
```

**Step 2: Update existing tests**

In `migrations.test.ts`:
- Change the test `"throws error for unknown versions"` to use `schemaVersion: 0` instead of `6`
- Change `"throws error for unknown version"` in migrateProtocol to use `schemaVersion: 0`
- Add `getMigrationInfo` tests for v1→v8

In `migrate-protocol-extended.test.ts`:
- Change `getMigrationInfo(6 as never, 8)` test to use `0 as never`
- Update `"should throw error for string schemaVersion"` — `"8"` will now be coerced, so use a non-version string like `"abc"` instead

**Step 3: Add integration test for full v1→v8 migration**

Add to `migrations.test.ts`:

```typescript
describe("full migration chain", () => {
	it("migrates a v1 protocol to v8", () => {
		const v1Protocol = {
			schemaVersion: 1,
			codebook: {
				node: {
					person: {
						name: "Person",
						color: "node-color-seq-1",
						variables: {
							name: { name: "name", type: "text" },
						},
					},
				},
				edge: {},
				ego: {},
			},
			stages: [],
		};

		const migrated = migrateProtocol(v1Protocol, undefined, { name: "Test Protocol" });
		expect(migrated.schemaVersion).toBe(8);
		expect(migrated).toHaveProperty("experiments");
		expect(migrated.name).toBe("Test Protocol");
	});

	it("migrates a v3 protocol with dirty names to v8", () => {
		const v3Protocol = {
			schemaVersion: 3,
			codebook: {
				node: {
					person: {
						name: "My Type",
						color: "node-color-seq-1",
						variables: {
							var1: { name: "first name", type: "text" },
						},
					},
				},
				edge: {},
				ego: {},
			},
			stages: [],
		};

		const migrated = migrateProtocol(v3Protocol, undefined, { name: "Test Protocol" });
		expect(migrated.schemaVersion).toBe(8);
	});

	it("migrates a v5 protocol with old NameGenerator types to v8", () => {
		const v5Protocol = {
			schemaVersion: 5,
			codebook: {
				node: {
					person: {
						name: "Person",
						color: "node-color-seq-1",
						variables: {
							name: { name: "name", type: "text" },
						},
					},
				},
				edge: {},
				ego: {},
			},
			stages: [
				{
					id: "stage1",
					type: "NameGeneratorAutoComplete",
					label: "Test",
					subject: { entity: "node", type: "person" },
					prompts: [{ id: "p1", text: "Test" }],
					panels: [],
				},
			],
		};

		const migrated = migrateProtocol(v5Protocol, undefined, { name: "Test Protocol" });
		expect(migrated.schemaVersion).toBe(8);
	});

	it("reports correct migration path from v1 to v8", () => {
		const info = getMigrationInfo(1, 8);
		expect(info.canMigrate).toBe(true);
		expect(info.path).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
		expect(info.stepsRequired).toBe(7);
	});
});
```

**Step 4: Run all tests**

Run: `pnpm --filter @codaco/protocol-validation test -- --run`
Expected: ALL PASS

**Step 5: Run typecheck and lint**

Run: `pnpm --filter @codaco/protocol-validation typecheck && pnpm lint:fix`
Expected: PASS

**Step 6: Commit**

```
feat(protocol-validation): register all legacy migrations and add integration tests
```

---

### Task 7: Final verification

**Step 1: Run full test suite**

Run: `pnpm test -- --run`
Expected: ALL PASS across the monorepo

**Step 2: Run typecheck across monorepo**

Run: `pnpm typecheck`
Expected: PASS — no type errors from SchemaVersion expansion

**Step 3: Verify no downstream breakage**

The `SchemaVersion` type is used in other packages (architect-vite, etc.). The expansion from `7 | 8` to `1-8` is additive, so existing code that handles `7 | 8` will still compile. But verify:

Run: `pnpm build`
Expected: PASS

**Step 4: Commit any final fixes if needed**
