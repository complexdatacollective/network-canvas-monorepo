# Timeline Data Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `stages` array in Network Canvas protocols with a hierarchical directed graph ("timeline") supporting branches, collections, and multiple finish screens (schema v9).

**Architecture:** New schema version 9 in `protocol-validation` with Zod schemas for Stage/Collection/Branch entities, graph validation utilities, and a v8->v9 migration. Unchanged sub-schemas (codebook, variables, assets, filters) are imported from v8. The architect-vite app gets a new Redux timeline reducer and a graph-based timeline UI component.

**Tech Stack:** Zod (schemas + validation), Vitest (testing), Redux Toolkit (state), React + motion/react (UI), custom DAG layout algorithm.

**Spec:** `docs/superpowers/specs/2026-03-29-timeline-data-structure-design.md`

---

## File Structure

### New files to create

```
packages/protocol-validation/src/schemas/9/
├── schema.ts                          # ProtocolSchemaV9 top-level + superRefine
├── migration.ts                       # V8→V9 migration
├── timeline/
│   ├── index.ts                       # Re-exports
│   ├── timeline.ts                    # TimelineSchema
│   ├── entity.ts                      # EntitySchema union
│   ├── stage.ts                       # Stage entity base + FinishInterview
│   ├── collection.ts                  # CollectionEntitySchema
│   └── branch.ts                      # BranchEntitySchema + SlotSchema
├── stages/
│   ├── index.ts                       # stageEntitySchema union of all 18 types
│   ├── base.ts                        # baseStageEntitySchema
│   ├── finish-interview.ts            # FinishInterview stage
│   ├── ego-form.ts                    # Adapted from v8
│   ├── alter-form.ts                  # Adapted from v8
│   ├── alter-edge-form.ts             # Adapted from v8
│   ├── name-generator.ts              # Adapted from v8
│   ├── name-generator-quick-add.ts    # Adapted from v8
│   ├── name-generator-roster.ts       # Adapted from v8
│   ├── sociogram.ts                   # Adapted from v8
│   ├── dyad-census.ts                 # Adapted from v8
│   ├── tie-strength-census.ts         # Adapted from v8
│   ├── ordinal-bin.ts                 # Adapted from v8
│   ├── categorical-bin.ts             # Adapted from v8
│   ├── narrative.ts                   # Adapted from v8
│   ├── information.ts                 # Adapted from v8
│   ├── anonymisation.ts               # Adapted from v8
│   ├── one-to-many-dyad-census.ts     # Adapted from v8
│   ├── family-pedigree.ts             # Adapted from v8
│   └── geospatial.ts                  # Adapted from v8
├── validation/
│   ├── index.ts                       # Re-exports
│   ├── flatten.ts                     # Flatten timeline to entity list/index
│   ├── graph.ts                       # DAG validation (cycles, reachability, termination)
│   ├── references.ts                  # ID uniqueness, target validity
│   └── collections.ts                 # Collection + branch constraint checking
└── __tests__/
    ├── timeline-schema.test.ts        # Entity + timeline schema tests
    ├── graph-validation.test.ts       # Graph integrity tests
    ├── migration.test.ts              # V8→V9 migration tests
    └── codebook-validation.test.ts    # Cross-reference validation tests

apps/architect-vite/src/
├── ducks/modules/protocol/
│   └── timeline.ts                    # New timeline reducer (replaces stages.ts)
├── selectors/
│   └── timeline.ts                    # New timeline selectors
├── utils/
│   └── timeline-graph.ts             # Graph rewiring utilities
├── components/Timeline/
│   ├── TimelineGraph.tsx              # New graph-based timeline component
│   ├── StageNode.tsx                  # Stage entity rendering
│   ├── CollectionNode.tsx             # Collection container rendering
│   ├── BranchNode.tsx                 # Branch diamond + slot lines
│   ├── InsertPoint.tsx                # "+" between entities
│   └── layout.ts                     # Deterministic layout algorithm
```

### Files to modify

```
packages/protocol-validation/src/schemas/index.ts        # Add v9, update CURRENT_SCHEMA_VERSION
packages/protocol-validation/src/migration/migrate-protocol.ts  # Register v8→v9 migration
packages/protocol-validation/src/index.ts                 # Export v9 types
apps/architect-vite/src/ducks/modules/activeProtocol.ts   # Use timeline reducer instead of stages
apps/architect-vite/src/selectors/protocol.ts             # Update for timeline structure
apps/architect-vite/src/components/Timeline/Timeline.tsx   # Replace with graph-based rendering
```

---

## Milestone 1: V9 Schema Foundation

### Task 1: Base Stage Entity Schema

Create the v9 base stage schema that all stage types extend. This replaces the v8 `baseStageSchema` with entity-aware fields.

**Files:**
- Create: `packages/protocol-validation/src/schemas/9/stages/base.ts`
- Test: `packages/protocol-validation/src/schemas/9/__tests__/timeline-schema.test.ts`

- [ ] **Step 1: Create test file with base schema tests**

```typescript
// packages/protocol-validation/src/schemas/9/__tests__/timeline-schema.test.ts
import { describe, expect, it } from "vitest";
import { baseStageEntitySchema } from "../stages/base";

describe("v9 baseStageEntitySchema", () => {
	it("accepts a valid stage entity", () => {
		const result = baseStageEntitySchema.safeParse({
			id: "stage-1",
			type: "Stage",
			label: "Welcome",
			target: "stage-2",
		});
		expect(result.success).toBe(true);
	});

	it("accepts a stage with no target (terminal)", () => {
		const result = baseStageEntitySchema.safeParse({
			id: "stage-1",
			type: "Stage",
			label: "Finish",
		});
		expect(result.success).toBe(true);
	});

	it("accepts optional interviewScript", () => {
		const result = baseStageEntitySchema.safeParse({
			id: "stage-1",
			type: "Stage",
			label: "Welcome",
			target: "stage-2",
			interviewScript: "Please read this aloud",
		});
		expect(result.success).toBe(true);
	});

	it("rejects missing type", () => {
		const result = baseStageEntitySchema.safeParse({
			id: "stage-1",
			label: "Welcome",
		});
		expect(result.success).toBe(false);
	});

	it("rejects wrong type value", () => {
		const result = baseStageEntitySchema.safeParse({
			id: "stage-1",
			type: "Collection",
			label: "Welcome",
		});
		expect(result.success).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/timeline-schema.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Create the base schema**

```typescript
// packages/protocol-validation/src/schemas/9/stages/base.ts
import { z } from "~/utils/zod-mock-extension";

export const baseStageEntitySchema = z.object({
	id: z.string(),
	type: z.literal("Stage"),
	label: z.string(),
	interviewScript: z.string().optional(),
	target: z.string().optional(),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/timeline-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-validation/src/schemas/9/stages/base.ts packages/protocol-validation/src/schemas/9/__tests__/timeline-schema.test.ts
git commit -m "feat(protocol-validation): add v9 base stage entity schema"
```

---

### Task 2: FinishInterview Stage Schema

Create the new FinishInterview stage type - a terminal stage with no target.

**Files:**
- Create: `packages/protocol-validation/src/schemas/9/stages/finish-interview.ts`
- Modify: `packages/protocol-validation/src/schemas/9/__tests__/timeline-schema.test.ts`

- [ ] **Step 1: Add FinishInterview tests**

Append to `timeline-schema.test.ts`:

```typescript
import { finishInterviewStageEntity } from "../stages/finish-interview";

describe("v9 finishInterviewStageEntity", () => {
	it("accepts a valid FinishInterview stage", () => {
		const result = finishInterviewStageEntity.safeParse({
			id: "finish-1",
			type: "Stage",
			stageType: "FinishInterview",
			label: "Thank you for participating",
		});
		expect(result.success).toBe(true);
	});

	it("accepts optional message content", () => {
		const result = finishInterviewStageEntity.safeParse({
			id: "finish-1",
			type: "Stage",
			stageType: "FinishInterview",
			label: "Thank you",
			message: "Your responses have been recorded.",
		});
		expect(result.success).toBe(true);
	});

	it("rejects if target is present", () => {
		const result = finishInterviewStageEntity.safeParse({
			id: "finish-1",
			type: "Stage",
			stageType: "FinishInterview",
			label: "Finish",
			target: "some-stage",
		});
		expect(result.success).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/timeline-schema.test.ts`
Expected: FAIL

- [ ] **Step 3: Create the FinishInterview schema**

```typescript
// packages/protocol-validation/src/schemas/9/stages/finish-interview.ts
import { z } from "~/utils/zod-mock-extension";
import { baseStageEntitySchema } from "./base";

export const finishInterviewStageEntity = baseStageEntitySchema
	.omit({ target: true })
	.extend({
		stageType: z.literal("FinishInterview"),
		message: z.string().optional(),
	});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/timeline-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-validation/src/schemas/9/stages/finish-interview.ts packages/protocol-validation/src/schemas/9/__tests__/timeline-schema.test.ts
git commit -m "feat(protocol-validation): add v9 FinishInterview stage schema"
```

---

### Task 3: Branch Entity Schema

Create the Branch entity with slots, filters, and default slot support.

**Files:**
- Create: `packages/protocol-validation/src/schemas/9/timeline/branch.ts`
- Modify: `packages/protocol-validation/src/schemas/9/__tests__/timeline-schema.test.ts`

- [ ] **Step 1: Add Branch entity tests**

Append to `timeline-schema.test.ts`:

```typescript
import { branchEntitySchema } from "../timeline/branch";

describe("v9 branchEntitySchema", () => {
	it("accepts a valid branch with 2 slots", () => {
		const result = branchEntitySchema.safeParse({
			id: "branch-1",
			type: "Branch",
			name: "Age Check",
			slots: [
				{
					id: "slot-1",
					label: "Under 18",
					filter: {
						join: "AND",
						rules: [
							{
								id: "rule-1",
								type: "ego",
								options: { attribute: "age", operator: "LESS_THAN", value: 18 },
							},
						],
					},
					target: "youth-path",
				},
				{
					id: "slot-2",
					label: "Default",
					default: true,
					target: "adult-path",
				},
			],
		});
		expect(result.success).toBe(true);
	});

	it("rejects a branch with fewer than 2 slots", () => {
		const result = branchEntitySchema.safeParse({
			id: "branch-1",
			type: "Branch",
			name: "Bad Branch",
			slots: [{ id: "slot-1", label: "Only one", default: true, target: "x" }],
		});
		expect(result.success).toBe(false);
	});

	it("rejects a branch with no default slot", () => {
		const result = branchEntitySchema.safeParse({
			id: "branch-1",
			type: "Branch",
			name: "No Default",
			slots: [
				{
					id: "slot-1",
					label: "A",
					filter: { join: "AND", rules: [] },
					target: "x",
				},
				{
					id: "slot-2",
					label: "B",
					filter: { join: "AND", rules: [] },
					target: "y",
				},
			],
		});
		expect(result.success).toBe(false);
	});

	it("rejects a branch with multiple default slots", () => {
		const result = branchEntitySchema.safeParse({
			id: "branch-1",
			type: "Branch",
			name: "Two Defaults",
			slots: [
				{ id: "slot-1", label: "A", default: true, target: "x" },
				{ id: "slot-2", label: "B", default: true, target: "y" },
			],
		});
		expect(result.success).toBe(false);
	});

	it("rejects duplicate slot IDs", () => {
		const result = branchEntitySchema.safeParse({
			id: "branch-1",
			type: "Branch",
			name: "Dup Slots",
			slots: [
				{ id: "same-id", label: "A", filter: { join: "AND", rules: [] }, target: "x" },
				{ id: "same-id", label: "B", default: true, target: "y" },
			],
		});
		expect(result.success).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/timeline-schema.test.ts`
Expected: FAIL

- [ ] **Step 3: Create the Branch schema**

```typescript
// packages/protocol-validation/src/schemas/9/timeline/branch.ts
import { findDuplicateId } from "~/utils/validation-helpers";
import { z } from "~/utils/zod-mock-extension";
import { FilterSchema } from "../../8/filters";

const BranchSlotSchema = z.strictObject({
	id: z.string(),
	label: z.string(),
	filter: FilterSchema.optional(),
	default: z.literal(true).optional(),
	target: z.string(),
});

export type BranchSlot = z.infer<typeof BranchSlotSchema>;

export const branchEntitySchema = z
	.strictObject({
		id: z.string(),
		type: z.literal("Branch"),
		name: z.string(),
		slots: z.array(BranchSlotSchema).min(2).superRefine((slots, ctx) => {
			// Check for duplicate slot IDs
			const duplicateId = findDuplicateId(slots);
			if (duplicateId) {
				ctx.addIssue({
					code: "custom",
					message: `Branch slots contain duplicate ID "${duplicateId}"`,
				});
			}

			// Exactly one default slot
			const defaultSlots = slots.filter((s) => s.default === true);
			if (defaultSlots.length === 0) {
				ctx.addIssue({
					code: "custom",
					message: "Branch must have exactly one default slot",
				});
			}
			if (defaultSlots.length > 1) {
				ctx.addIssue({
					code: "custom",
					message: "Branch must have exactly one default slot, found multiple",
				});
			}

			// Non-default slots must have a filter
			for (const slot of slots) {
				if (!slot.default && !slot.filter) {
					ctx.addIssue({
						code: "custom",
						message: `Non-default slot "${slot.id}" must have a filter`,
					});
				}
			}
		}),
	});

export type BranchEntity = z.infer<typeof branchEntitySchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/timeline-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-validation/src/schemas/9/timeline/branch.ts packages/protocol-validation/src/schemas/9/__tests__/timeline-schema.test.ts
git commit -m "feat(protocol-validation): add v9 Branch entity schema with slots"
```

---

### Task 4: Collection Entity Schema

Create the Collection entity that contains children (stages, branches, nested collections).

**Files:**
- Create: `packages/protocol-validation/src/schemas/9/timeline/collection.ts`
- Modify: `packages/protocol-validation/src/schemas/9/__tests__/timeline-schema.test.ts`

- [ ] **Step 1: Add Collection entity tests**

Append to `timeline-schema.test.ts`:

```typescript
import { collectionEntitySchema } from "../timeline/collection";

describe("v9 collectionEntitySchema", () => {
	it("accepts a collection with stage children", () => {
		const result = collectionEntitySchema.safeParse({
			id: "coll-1",
			type: "Collection",
			name: "Demographics",
			children: [
				{ id: "s1", type: "Stage", stageType: "EgoForm", label: "Age", form: { fields: [] }, introductionPanel: { title: "Test", text: "Test" }, target: "s2" },
				{ id: "s2", type: "Stage", stageType: "EgoForm", label: "Gender", form: { fields: [] }, introductionPanel: { title: "Test", text: "Test" }, target: "outside" },
			],
		});
		expect(result.success).toBe(true);
	});

	it("rejects an empty collection", () => {
		const result = collectionEntitySchema.safeParse({
			id: "coll-1",
			type: "Collection",
			name: "Empty",
			children: [],
		});
		expect(result.success).toBe(false);
	});

	it("accepts nested collections", () => {
		const result = collectionEntitySchema.safeParse({
			id: "coll-outer",
			type: "Collection",
			name: "Outer",
			children: [
				{
					id: "coll-inner",
					type: "Collection",
					name: "Inner",
					children: [
						{ id: "s1", type: "Stage", stageType: "Information", label: "Info", items: [], target: "outside" },
					],
				},
			],
		});
		expect(result.success).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/timeline-schema.test.ts`
Expected: FAIL

- [ ] **Step 3: Create the Collection schema**

The collection schema needs to reference the entity union (which references collection), creating a recursive type. Use `z.lazy()` for this.

```typescript
// packages/protocol-validation/src/schemas/9/timeline/collection.ts
import { z } from "~/utils/zod-mock-extension";
import type { Entity } from "./entity";

export const collectionEntitySchema: z.ZodType<{
	id: string;
	type: "Collection";
	name: string;
	children: Entity[];
}> = z.strictObject({
	id: z.string(),
	type: z.literal("Collection"),
	name: z.string(),
	children: z.lazy(() => {
		// Import here to break circular dependency
		const { entitySchema } = require("./entity") as { entitySchema: z.ZodType<Entity> };
		return z.array(entitySchema).min(1);
	}),
});

export type CollectionEntity = z.infer<typeof collectionEntitySchema>;
```

**Note:** The circular dependency between collection and entity requires `z.lazy()`. The implementing engineer should verify this works with the project's module system. An alternative approach is to define the entity union in a single file that includes the collection definition inline, avoiding the circular import:

```typescript
// packages/protocol-validation/src/schemas/9/timeline/entity.ts
import { z } from "~/utils/zod-mock-extension";
import { branchEntitySchema } from "./branch";
import { stageEntitySchema } from "../stages";

// Forward-declare the entity type for recursive collection
type EntityInput = z.infer<typeof branchEntitySchema> | z.infer<typeof stageEntitySchema> | {
	id: string;
	type: "Collection";
	name: string;
	children: EntityInput[];
};

export const collectionEntitySchema: z.ZodType<{
	id: string;
	type: "Collection";
	name: string;
	children: EntityInput[];
}> = z.lazy(() =>
	z.strictObject({
		id: z.string(),
		type: z.literal("Collection"),
		name: z.string(),
		children: z.array(entitySchema).min(1),
	})
);

export const entitySchema: z.ZodType<EntityInput> = z.lazy(() =>
	z.union([stageEntitySchema, collectionEntitySchema, branchEntitySchema])
);

export type Entity = z.infer<typeof entitySchema>;
export type CollectionEntity = z.infer<typeof collectionEntitySchema>;
```

The second approach (single file with `z.lazy`) is preferred. If using this approach, create `collection.ts` as a simple re-export from `entity.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/timeline-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-validation/src/schemas/9/timeline/ packages/protocol-validation/src/schemas/9/__tests__/timeline-schema.test.ts
git commit -m "feat(protocol-validation): add v9 Collection entity and Entity union schemas"
```

---

### Task 5: Adapt V8 Stage Schemas to V9 Format

Transform all 17 existing stage type schemas from v8 format to v9. The change for each is:
- Replace `baseStageSchema` with `baseStageEntitySchema`
- Rename `type: z.literal("X")` to `stageType: z.literal("X")`
- Remove `skipLogic` (it's no longer in the base)

**Files:**
- Create: `packages/protocol-validation/src/schemas/9/stages/ego-form.ts` (and 16 more)
- Create: `packages/protocol-validation/src/schemas/9/stages/index.ts`

- [ ] **Step 1: Create the stage index with a test**

Add to `timeline-schema.test.ts`:

```typescript
import { stageEntitySchema } from "../stages";

describe("v9 stageEntitySchema", () => {
	it("discriminates by stageType", () => {
		const egoForm = stageEntitySchema.safeParse({
			id: "s1",
			type: "Stage",
			stageType: "EgoForm",
			label: "Test",
			target: "s2",
			form: { fields: [] },
			introductionPanel: { title: "Test", text: "Test" },
		});
		expect(egoForm.success).toBe(true);

		const info = stageEntitySchema.safeParse({
			id: "s2",
			type: "Stage",
			stageType: "Information",
			label: "Info",
			target: "s3",
			items: [],
		});
		expect(info.success).toBe(true);

		const finish = stageEntitySchema.safeParse({
			id: "s3",
			type: "Stage",
			stageType: "FinishInterview",
			label: "Done",
		});
		expect(finish.success).toBe(true);
	});

	it("rejects unknown stageType", () => {
		const result = stageEntitySchema.safeParse({
			id: "s1",
			type: "Stage",
			stageType: "NonExistent",
			label: "Bad",
		});
		expect(result.success).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/timeline-schema.test.ts`
Expected: FAIL

- [ ] **Step 3: Create adapted stage schemas**

For each of the 17 v8 stage files, create a v9 version. The pattern is identical for each. Here are representative examples:

```typescript
// packages/protocol-validation/src/schemas/9/stages/ego-form.ts
import { getEgoVariableId } from "~/utils/mock-seeds";
import { z } from "~/utils/zod-mock-extension";
import { FormSchema, IntroductionPanelSchema } from "../../8/common";
import { baseStageEntitySchema } from "./base";

export const egoFormStageEntity = baseStageEntitySchema
	.extend({
		stageType: z.literal("EgoForm"),
		form: FormSchema,
		introductionPanel: IntroductionPanelSchema,
	})
	.generateMock((base) => ({
		...base,
		form: {
			fields: [
				{ variable: getEgoVariableId(0), prompt: "What is your first name?" },
				{ variable: getEgoVariableId(1), prompt: "What is your age?" },
				{ variable: getEgoVariableId(2), prompt: "What is your date of birth?" },
			],
		},
	}));
```

```typescript
// packages/protocol-validation/src/schemas/9/stages/information.ts
import { faker } from "@faker-js/faker";
import { findDuplicateId } from "~/utils/validation-helpers";
import { z } from "~/utils/zod-mock-extension";
import { baseStageEntitySchema } from "./base";

const ItemSchema = z.strictObject({
	id: z.string(),
	type: z.enum(["text", "asset"]),
	content: z.string().generateMock(() =>
		faker.helpers.arrayElement([
			"Welcome to our research study.",
			"On the next screen, you will be asked to provide some information.",
			"Please read through this information.",
		]),
	),
	description: z.string().optional(),
	size: z.string().optional().generateMock(() => faker.helpers.arrayElement(["SMALL", "MEDIUM", "LARGE"])),
	loop: z.boolean().optional(),
});

export type Item = z.infer<typeof ItemSchema>;

export const informationStageEntity = baseStageEntitySchema.extend({
	stageType: z.literal("Information"),
	title: z.string().optional().generateMock(() =>
		faker.helpers.arrayElement(["Welcome to the Study", "Information Interface"]),
	),
	items: z.array(ItemSchema).superRefine((items, ctx) => {
		const duplicateItemId = findDuplicateId(items);
		if (duplicateItemId) {
			ctx.addIssue({
				code: "custom" as const,
				message: `Items contain duplicate ID "${duplicateItemId}"`,
				path: [],
			});
		}
	}),
});
```

**Apply the same transformation to all 17 stage files.** For each v8 file in `packages/protocol-validation/src/schemas/8/stages/`:
1. Copy to `packages/protocol-validation/src/schemas/9/stages/`
2. Change import of `baseStageSchema` to `baseStageEntitySchema` from `"./base"`
3. Change `type: z.literal("X")` to `stageType: z.literal("X")`
4. Change import paths for common/filter schemas to point to `"../../8/common"` and `"../../8/filters"` (they're unchanged)
5. Rename the export from `xyzStage` to `xyzStageEntity` for clarity

Complete list of files to adapt (v8 export name → v9 export name):
- `alter-edge-form.ts`: `alterEdgeFormStage` → `alterEdgeFormStageEntity`
- `alter-form.ts`: `alterFormStage` → `alterFormStageEntity`
- `anonymisation.ts`: `anonymisationStage` → `anonymisationStageEntity`
- `categorical-bin.ts`: `categoricalBinStage` → `categoricalBinStageEntity`
- `dyad-census.ts`: `dyadCensusStage` → `dyadCensusStageEntity`
- `ego-form.ts`: `egoFormStage` → `egoFormStageEntity`
- `family-pedigree.ts`: `familyPedigreeStage` → `familyPedigreeStageEntity`
- `geospatial.ts`: `geospatialStage` → `geospatialStageEntity`
- `information.ts`: `informationStage` → `informationStageEntity`
- `name-generator.ts`: `nameGeneratorStage` → `nameGeneratorStageEntity`
- `name-generator-quick-add.ts`: `nameGeneratorQuickAddStage` → `nameGeneratorQuickAddStageEntity`
- `name-generator-roster.ts`: `nameGeneratorRosterStage` → `nameGeneratorRosterStageEntity`
- `narrative.ts`: `narrativeStage` → `narrativeStageEntity`
- `one-to-many-dyad-census.ts`: `oneToManyDyadCensusStage` → `oneToManyDyadCensusStageEntity`
- `ordinal-bin.ts`: `ordinalBinStage` → `ordinalBinStageEntity`
- `sociogram.ts`: `sociogramStage` → `sociogramStageEntity`
- `tie-strength-census.ts`: `tieStrengthCensusStage` → `tieStrengthCensusStageEntity`

- [ ] **Step 4: Create the stages index**

```typescript
// packages/protocol-validation/src/schemas/9/stages/index.ts
import { z } from "~/utils/zod-mock-extension";
import { faker } from "@faker-js/faker";

export * from "./base";

import { alterEdgeFormStageEntity } from "./alter-edge-form";
import { alterFormStageEntity } from "./alter-form";
import { anonymisationStageEntity } from "./anonymisation";
import { categoricalBinStageEntity } from "./categorical-bin";
import { dyadCensusStageEntity } from "./dyad-census";
import { egoFormStageEntity } from "./ego-form";
import { familyPedigreeStageEntity } from "./family-pedigree";
import { finishInterviewStageEntity } from "./finish-interview";
import { geospatialStageEntity } from "./geospatial";
import { informationStageEntity } from "./information";
import { nameGeneratorStageEntity } from "./name-generator";
import { nameGeneratorQuickAddStageEntity } from "./name-generator-quick-add";
import { nameGeneratorRosterStageEntity } from "./name-generator-roster";
import { narrativeStageEntity } from "./narrative";
import { oneToManyDyadCensusStageEntity } from "./one-to-many-dyad-census";
import { ordinalBinStageEntity } from "./ordinal-bin";
import { sociogramStageEntity } from "./sociogram";
import { tieStrengthCensusStageEntity } from "./tie-strength-census";

export * from "./alter-edge-form";
export * from "./alter-form";
export * from "./anonymisation";
export * from "./categorical-bin";
export * from "./dyad-census";
export * from "./ego-form";
export * from "./family-pedigree";
export * from "./finish-interview";
export * from "./geospatial";
export * from "./information";
export * from "./name-generator";
export * from "./name-generator-quick-add";
export * from "./name-generator-roster";
export * from "./narrative";
export * from "./one-to-many-dyad-census";
export * from "./ordinal-bin";
export * from "./sociogram";
export * from "./tie-strength-census";

const stageEntitySchemas = [
	egoFormStageEntity,
	alterFormStageEntity,
	alterEdgeFormStageEntity,
	nameGeneratorStageEntity,
	nameGeneratorQuickAddStageEntity,
	nameGeneratorRosterStageEntity,
	sociogramStageEntity,
	dyadCensusStageEntity,
	tieStrengthCensusStageEntity,
	ordinalBinStageEntity,
	categoricalBinStageEntity,
	narrativeStageEntity,
	informationStageEntity,
	anonymisationStageEntity,
	oneToManyDyadCensusStageEntity,
	familyPedigreeStageEntity,
	geospatialStageEntity,
	finishInterviewStageEntity,
] as const;

export const stageEntitySchema = z.discriminatedUnion("stageType", stageEntitySchemas).generateMock(() => {
	const schema = faker.helpers.arrayElement(stageEntitySchemas);
	return schema.generateMock();
});

export type StageType = z.infer<typeof stageEntitySchema>["stageType"];
export type StageEntity = z.infer<typeof stageEntitySchema>;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/timeline-schema.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/protocol-validation/src/schemas/9/stages/
git commit -m "feat(protocol-validation): add all v9 stage entity schemas"
```

---

### Task 6: Timeline Schema + Protocol Schema V9

Create the top-level Timeline schema and the Protocol schema v9.

**Files:**
- Create: `packages/protocol-validation/src/schemas/9/timeline/timeline.ts`
- Create: `packages/protocol-validation/src/schemas/9/timeline/index.ts`
- Create: `packages/protocol-validation/src/schemas/9/schema.ts`
- Modify: `packages/protocol-validation/src/schemas/9/__tests__/timeline-schema.test.ts`

- [ ] **Step 1: Add Timeline + Protocol schema tests**

Append to `timeline-schema.test.ts`:

```typescript
import { timelineSchema } from "../timeline/timeline";
import ProtocolSchemaV9 from "../schema";

describe("v9 timelineSchema", () => {
	it("accepts a minimal linear timeline", () => {
		const result = timelineSchema.safeParse({
			start: "s1",
			entities: [
				{ id: "s1", type: "Stage", stageType: "Information", label: "Welcome", target: "s2", items: [] },
				{ id: "s2", type: "Stage", stageType: "FinishInterview", label: "Done" },
			],
		});
		expect(result.success).toBe(true);
	});

	it("accepts a timeline with branches", () => {
		const result = timelineSchema.safeParse({
			start: "s1",
			entities: [
				{ id: "s1", type: "Stage", stageType: "Information", label: "Welcome", target: "b1", items: [] },
				{
					id: "b1",
					type: "Branch",
					name: "Split",
					slots: [
						{ id: "slot-1", label: "Path A", filter: { join: "AND", rules: [] }, target: "s2" },
						{ id: "slot-2", label: "Default", default: true, target: "s3" },
					],
				},
				{ id: "s2", type: "Stage", stageType: "FinishInterview", label: "Finish A" },
				{ id: "s3", type: "Stage", stageType: "FinishInterview", label: "Finish B" },
			],
		});
		expect(result.success).toBe(true);
	});

	it("rejects empty entities", () => {
		const result = timelineSchema.safeParse({
			start: "s1",
			entities: [],
		});
		expect(result.success).toBe(false);
	});
});

describe("v9 ProtocolSchemaV9", () => {
	it("accepts a minimal valid v9 protocol", () => {
		const result = ProtocolSchemaV9.safeParse({
			name: "Test Protocol",
			schemaVersion: 9,
			codebook: { node: {}, edge: {} },
			timeline: {
				start: "s1",
				entities: [
					{ id: "s1", type: "Stage", stageType: "FinishInterview", label: "Done" },
				],
			},
		});
		expect(result.success).toBe(true);
	});

	it("rejects a protocol with stages array (v8 format)", () => {
		const result = ProtocolSchemaV9.safeParse({
			name: "Test",
			schemaVersion: 9,
			codebook: { node: {}, edge: {} },
			stages: [],
		});
		expect(result.success).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/timeline-schema.test.ts`
Expected: FAIL

- [ ] **Step 3: Create Timeline schema**

```typescript
// packages/protocol-validation/src/schemas/9/timeline/timeline.ts
import { z } from "~/utils/zod-mock-extension";
import { entitySchema } from "./entity";

export const timelineSchema = z.strictObject({
	start: z.string(),
	entities: z.array(entitySchema).min(1),
});

export type Timeline = z.infer<typeof timelineSchema>;
```

```typescript
// packages/protocol-validation/src/schemas/9/timeline/index.ts
export * from "./branch";
export * from "./collection";
export * from "./entity";
export * from "./timeline";
```

- [ ] **Step 4: Create Protocol schema V9**

```typescript
// packages/protocol-validation/src/schemas/9/schema.ts
import { z } from "zod";

// Re-export unchanged schemas from v8
export * from "../8/assets";
export * from "../8/codebook";
export * from "../8/common/experiments";
export * from "../8/common/forms";
export * from "../8/common/introductionPanel";
export * from "../8/common/panels";
export * from "../8/common/prompts";
export * from "../8/common/subjects";
export * from "../8/filters";
export * from "../8/variables";

// Export new v9 schemas
export * from "./stages";
export * from "./timeline";

// Import what we need for the ProtocolSchema
import { assetSchema } from "../8/assets";
import { CodebookSchema } from "../8/codebook";
import { ExperimentsSchema } from "../8/common";
import { timelineSchema } from "./timeline/timeline";

const ProtocolSchema = z.strictObject({
	name: z.string().min(1),
	description: z.string().optional(),
	experiments: ExperimentsSchema.optional(),
	lastModified: z
		.string()
		.datetime()
		.optional()
		.generateMock(() => new Date().toISOString()),
	schemaVersion: z.literal(9),
	codebook: CodebookSchema,
	assetManifest: z.record(z.string(), assetSchema).optional(),
	timeline: timelineSchema,
});

export default ProtocolSchema;
```

Note: The `.generateMock()` call on `lastModified` uses the custom zod extension. If this causes an import issue (since the top-level import is from plain `"zod"`), change the import to `import { z } from "~/utils/zod-mock-extension"`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/timeline-schema.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/protocol-validation/src/schemas/9/timeline/ packages/protocol-validation/src/schemas/9/schema.ts packages/protocol-validation/src/schemas/9/__tests__/timeline-schema.test.ts
git commit -m "feat(protocol-validation): add v9 Timeline and Protocol schemas"
```

---

## Milestone 2: Graph Validation

### Task 7: Timeline Flatten + Index Utilities

Create utility functions to traverse the timeline hierarchy and build a flat index for validation.

**Files:**
- Create: `packages/protocol-validation/src/schemas/9/validation/flatten.ts`
- Create: `packages/protocol-validation/src/schemas/9/validation/index.ts`
- Create: `packages/protocol-validation/src/schemas/9/__tests__/graph-validation.test.ts`

- [ ] **Step 1: Write tests for flatten utilities**

```typescript
// packages/protocol-validation/src/schemas/9/__tests__/graph-validation.test.ts
import { describe, expect, it } from "vitest";
import { buildEntityIndex, flattenAllEntities, flattenStageEntities } from "../validation/flatten";
import type { Entity } from "../timeline/entity";

const linearTimeline: Entity[] = [
	{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "s2", items: [] } as Entity,
	{ id: "s2", type: "Stage", stageType: "FinishInterview", label: "B" } as Entity,
];

const nestedTimeline: Entity[] = [
	{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "coll-1", items: [] } as Entity,
	{
		id: "coll-1",
		type: "Collection",
		name: "Group",
		children: [
			{ id: "s2", type: "Stage", stageType: "EgoForm", label: "B", target: "s3", form: { fields: [] }, introductionPanel: { title: "T", text: "T" } } as Entity,
			{ id: "s3", type: "Stage", stageType: "FinishInterview", label: "C" } as Entity,
		],
	} as Entity,
];

describe("flattenAllEntities", () => {
	it("returns all entities from a flat timeline", () => {
		const result = flattenAllEntities(linearTimeline);
		expect(result).toHaveLength(2);
		expect(result.map((e) => e.id)).toEqual(["s1", "s2"]);
	});

	it("includes collection and its children", () => {
		const result = flattenAllEntities(nestedTimeline);
		expect(result).toHaveLength(4); // s1, coll-1, s2, s3
		expect(result.map((e) => e.id)).toEqual(["s1", "coll-1", "s2", "s3"]);
	});
});

describe("flattenStageEntities", () => {
	it("returns only Stage entities", () => {
		const result = flattenStageEntities(nestedTimeline);
		expect(result).toHaveLength(3); // s1, s2, s3 (no coll-1)
	});
});

describe("buildEntityIndex", () => {
	it("creates a map from ID to entity", () => {
		const index = buildEntityIndex(linearTimeline);
		expect(index.get("s1")?.type).toBe("Stage");
		expect(index.get("s2")?.type).toBe("Stage");
		expect(index.size).toBe(2);
	});

	it("includes nested entities", () => {
		const index = buildEntityIndex(nestedTimeline);
		expect(index.size).toBe(4);
		expect(index.get("coll-1")?.type).toBe("Collection");
		expect(index.get("s2")?.type).toBe("Stage");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/graph-validation.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement flatten utilities**

```typescript
// packages/protocol-validation/src/schemas/9/validation/flatten.ts
import type { Entity } from "../timeline/entity";
import type { StageEntity } from "../stages";
import type { CollectionEntity } from "../timeline/collection";

export function flattenAllEntities(entities: Entity[]): Entity[] {
	const result: Entity[] = [];
	for (const entity of entities) {
		result.push(entity);
		if (entity.type === "Collection") {
			result.push(...flattenAllEntities((entity as CollectionEntity).children));
		}
	}
	return result;
}

export function flattenStageEntities(entities: Entity[]): StageEntity[] {
	return flattenAllEntities(entities).filter(
		(e): e is StageEntity => e.type === "Stage",
	);
}

export function buildEntityIndex(entities: Entity[]): Map<string, Entity> {
	const index = new Map<string, Entity>();
	for (const entity of flattenAllEntities(entities)) {
		index.set(entity.id, entity);
	}
	return index;
}
```

```typescript
// packages/protocol-validation/src/schemas/9/validation/index.ts
export * from "./flatten";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/graph-validation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-validation/src/schemas/9/validation/
git commit -m "feat(protocol-validation): add v9 timeline flatten and index utilities"
```

---

### Task 8: Graph Integrity Validation

Implement ID uniqueness, target validity, cycle detection, reachability, and termination checks.

**Files:**
- Create: `packages/protocol-validation/src/schemas/9/validation/references.ts`
- Create: `packages/protocol-validation/src/schemas/9/validation/graph.ts`
- Modify: `packages/protocol-validation/src/schemas/9/__tests__/graph-validation.test.ts`

- [ ] **Step 1: Write tests for reference and graph validation**

Append to `graph-validation.test.ts`:

```typescript
import { validateIdUniqueness, validateTargetReferences, validateStartReference } from "../validation/references";
import { validateNoCycles, validateAllPathsTerminate, validateNoOrphans } from "../validation/graph";
import type { Timeline } from "../timeline/timeline";

describe("validateIdUniqueness", () => {
	it("passes with unique IDs", () => {
		const errors = validateIdUniqueness(linearTimeline);
		expect(errors).toHaveLength(0);
	});

	it("detects duplicate IDs", () => {
		const duped: Entity[] = [
			{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "s1", items: [] } as Entity,
			{ id: "s1", type: "Stage", stageType: "FinishInterview", label: "B" } as Entity,
		];
		const errors = validateIdUniqueness(duped);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain("s1");
	});
});

describe("validateTargetReferences", () => {
	it("passes with valid targets", () => {
		const errors = validateTargetReferences(linearTimeline);
		expect(errors).toHaveLength(0);
	});

	it("detects invalid target reference", () => {
		const bad: Entity[] = [
			{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "nonexistent", items: [] } as Entity,
		];
		const errors = validateTargetReferences(bad);
		expect(errors.length).toBeGreaterThan(0);
	});

	it("detects self-referencing target", () => {
		const selfRef: Entity[] = [
			{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "s1", items: [] } as Entity,
		];
		const errors = validateTargetReferences(selfRef);
		expect(errors.length).toBeGreaterThan(0);
	});
});

describe("validateStartReference", () => {
	it("passes when start references a valid entity", () => {
		const timeline: Timeline = { start: "s1", entities: linearTimeline };
		const errors = validateStartReference(timeline);
		expect(errors).toHaveLength(0);
	});

	it("fails when start references nonexistent entity", () => {
		const timeline: Timeline = { start: "nope", entities: linearTimeline };
		const errors = validateStartReference(timeline);
		expect(errors.length).toBeGreaterThan(0);
	});
});

describe("validateNoCycles", () => {
	it("passes for a DAG", () => {
		const timeline: Timeline = { start: "s1", entities: linearTimeline };
		const errors = validateNoCycles(timeline);
		expect(errors).toHaveLength(0);
	});

	it("detects a cycle", () => {
		const cyclic: Entity[] = [
			{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "s2", items: [] } as Entity,
			{ id: "s2", type: "Stage", stageType: "Information", label: "B", target: "s1", items: [] } as Entity,
		];
		const timeline: Timeline = { start: "s1", entities: cyclic };
		const errors = validateNoCycles(timeline);
		expect(errors.length).toBeGreaterThan(0);
	});
});

describe("validateAllPathsTerminate", () => {
	it("passes when all paths reach FinishInterview", () => {
		const timeline: Timeline = { start: "s1", entities: linearTimeline };
		const errors = validateAllPathsTerminate(timeline);
		expect(errors).toHaveLength(0);
	});

	it("fails when a path has no FinishInterview", () => {
		const noFinish: Entity[] = [
			{ id: "s1", type: "Stage", stageType: "Information", label: "A", items: [] } as Entity,
		];
		const timeline: Timeline = { start: "s1", entities: noFinish };
		const errors = validateAllPathsTerminate(timeline);
		expect(errors.length).toBeGreaterThan(0);
	});
});

describe("validateNoOrphans", () => {
	it("passes when all entities are reachable", () => {
		const timeline: Timeline = { start: "s1", entities: linearTimeline };
		const errors = validateNoOrphans(timeline);
		expect(errors).toHaveLength(0);
	});

	it("detects unreachable entities", () => {
		const withOrphan: Entity[] = [
			...linearTimeline,
			{ id: "orphan", type: "Stage", stageType: "Information", label: "Lost", items: [] } as Entity,
		];
		const timeline: Timeline = { start: "s1", entities: withOrphan };
		const errors = validateNoOrphans(timeline);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain("orphan");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/graph-validation.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement reference validation**

```typescript
// packages/protocol-validation/src/schemas/9/validation/references.ts
import type { BranchEntity } from "../timeline/branch";
import type { CollectionEntity } from "../timeline/collection";
import type { Entity } from "../timeline/entity";
import type { Timeline } from "../timeline/timeline";
import { buildEntityIndex, flattenAllEntities } from "./flatten";

export function validateIdUniqueness(entities: Entity[]): string[] {
	const errors: string[] = [];
	const seen = new Set<string>();
	for (const entity of flattenAllEntities(entities)) {
		if (seen.has(entity.id)) {
			errors.push(`Duplicate entity ID "${entity.id}"`);
		}
		seen.add(entity.id);

		// Check slot IDs for branches
		if (entity.type === "Branch") {
			for (const slot of (entity as BranchEntity).slots) {
				if (seen.has(slot.id)) {
					errors.push(`Duplicate slot ID "${slot.id}" in branch "${entity.id}"`);
				}
				seen.add(slot.id);
			}
		}
	}
	return errors;
}

function getAllTargets(entity: Entity): { targetId: string; sourceId: string }[] {
	if (entity.type === "Stage" && "target" in entity && entity.target) {
		return [{ targetId: entity.target as string, sourceId: entity.id }];
	}
	if (entity.type === "Branch") {
		return (entity as BranchEntity).slots.map((slot) => ({
			targetId: slot.target,
			sourceId: entity.id,
		}));
	}
	return [];
}

export function validateTargetReferences(entities: Entity[]): string[] {
	const errors: string[] = [];
	const index = buildEntityIndex(entities);
	const allEntities = flattenAllEntities(entities);

	for (const entity of allEntities) {
		for (const { targetId, sourceId } of getAllTargets(entity)) {
			if (targetId === sourceId) {
				errors.push(`Entity "${sourceId}" targets itself`);
			} else if (!index.has(targetId)) {
				errors.push(`Entity "${sourceId}" targets nonexistent entity "${targetId}"`);
			}
		}
	}
	return errors;
}

export function validateStartReference(timeline: Timeline): string[] {
	const errors: string[] = [];
	const topLevelIds = new Set(timeline.entities.map((e) => e.id));
	if (!topLevelIds.has(timeline.start)) {
		errors.push(`Timeline start "${timeline.start}" does not reference a top-level entity`);
	}
	return errors;
}
```

- [ ] **Step 4: Implement graph validation**

```typescript
// packages/protocol-validation/src/schemas/9/validation/graph.ts
import type { BranchEntity } from "../timeline/branch";
import type { CollectionEntity } from "../timeline/collection";
import type { Entity } from "../timeline/entity";
import type { StageEntity } from "../stages";
import type { Timeline } from "../timeline/timeline";
import { buildEntityIndex, flattenAllEntities } from "./flatten";

function getSuccessorIds(entity: Entity, index: Map<string, Entity>): string[] {
	if (entity.type === "Stage") {
		const stage = entity as StageEntity;
		if ("target" in stage && stage.target) {
			return [resolveTarget(stage.target as string, index)];
		}
		return [];
	}
	if (entity.type === "Branch") {
		return (entity as BranchEntity).slots.map((slot) => resolveTarget(slot.target, index));
	}
	if (entity.type === "Collection") {
		const children = (entity as CollectionEntity).children;
		if (children.length > 0) {
			return [children[0].id];
		}
		return [];
	}
	return [];
}

function resolveTarget(targetId: string, index: Map<string, Entity>): string {
	const target = index.get(targetId);
	if (target?.type === "Collection") {
		const children = (target as CollectionEntity).children;
		if (children.length > 0) {
			return children[0].id;
		}
	}
	return targetId;
}

export function validateNoCycles(timeline: Timeline): string[] {
	const index = buildEntityIndex(timeline.entities);
	const errors: string[] = [];
	const visited = new Set<string>();
	const inStack = new Set<string>();

	function dfs(entityId: string): boolean {
		if (inStack.has(entityId)) {
			errors.push(`Cycle detected involving entity "${entityId}"`);
			return true;
		}
		if (visited.has(entityId)) return false;

		visited.add(entityId);
		inStack.add(entityId);

		const entity = index.get(entityId);
		if (entity) {
			for (const successorId of getSuccessorIds(entity, index)) {
				if (dfs(successorId)) return true;
			}
		}

		inStack.delete(entityId);
		return false;
	}

	const startEntity = index.get(timeline.start);
	if (startEntity) {
		const resolvedStart = startEntity.type === "Collection"
			? (startEntity as CollectionEntity).children[0]?.id ?? timeline.start
			: timeline.start;
		dfs(resolvedStart);
	}

	return errors;
}

export function validateAllPathsTerminate(timeline: Timeline): string[] {
	const index = buildEntityIndex(timeline.entities);
	const errors: string[] = [];
	const checked = new Map<string, boolean>();

	function pathTerminates(entityId: string, path: Set<string>): boolean {
		if (path.has(entityId)) return false; // cycle - handled by validateNoCycles
		if (checked.has(entityId)) return checked.get(entityId)!;

		const entity = index.get(entityId);
		if (!entity) {
			checked.set(entityId, false);
			return false;
		}

		if (entity.type === "Stage") {
			const stage = entity as StageEntity;
			if (stage.stageType === "FinishInterview") {
				checked.set(entityId, true);
				return true;
			}
			if (!("target" in stage) || !stage.target) {
				errors.push(`Non-FinishInterview stage "${entityId}" has no target (dead end)`);
				checked.set(entityId, false);
				return false;
			}
			const nextPath = new Set(path).add(entityId);
			const resolved = resolveTarget(stage.target as string, index);
			const result = pathTerminates(resolved, nextPath);
			checked.set(entityId, result);
			return result;
		}

		if (entity.type === "Branch") {
			const branch = entity as BranchEntity;
			const nextPath = new Set(path).add(entityId);
			let allTerminate = true;
			for (const slot of branch.slots) {
				const resolved = resolveTarget(slot.target, index);
				if (!pathTerminates(resolved, nextPath)) {
					errors.push(`Branch "${entityId}" slot "${slot.id}" does not terminate at FinishInterview`);
					allTerminate = false;
				}
			}
			checked.set(entityId, allTerminate);
			return allTerminate;
		}

		if (entity.type === "Collection") {
			const children = (entity as CollectionEntity).children;
			if (children.length > 0) {
				const nextPath = new Set(path).add(entityId);
				const result = pathTerminates(children[0].id, nextPath);
				checked.set(entityId, result);
				return result;
			}
			checked.set(entityId, false);
			return false;
		}

		checked.set(entityId, false);
		return false;
	}

	pathTerminates(timeline.start, new Set());
	return errors;
}

export function validateNoOrphans(timeline: Timeline): string[] {
	const index = buildEntityIndex(timeline.entities);
	const reachable = new Set<string>();

	function walk(entityId: string) {
		if (reachable.has(entityId)) return;
		reachable.add(entityId);

		const entity = index.get(entityId);
		if (!entity) return;

		if (entity.type === "Collection") {
			for (const child of (entity as CollectionEntity).children) {
				walk(child.id);
			}
		}

		for (const successorId of getSuccessorIds(entity, index)) {
			walk(successorId);
		}
	}

	walk(timeline.start);

	const errors: string[] = [];
	for (const [id] of index) {
		if (!reachable.has(id)) {
			errors.push(`Entity "${id}" is not reachable from timeline start`);
		}
	}
	return errors;
}
```

- [ ] **Step 5: Update validation index**

```typescript
// packages/protocol-validation/src/schemas/9/validation/index.ts
export * from "./flatten";
export * from "./graph";
export * from "./references";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/graph-validation.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/protocol-validation/src/schemas/9/validation/
git commit -m "feat(protocol-validation): add v9 graph validation (cycles, reachability, termination)"
```

---

### Task 9: Collection + Branch Constraint Validation

Validate collection-specific rules (target scoping, last-child type) and integrate all validation into the protocol's `superRefine`.

**Files:**
- Create: `packages/protocol-validation/src/schemas/9/validation/collections.ts`
- Modify: `packages/protocol-validation/src/schemas/9/__tests__/graph-validation.test.ts`

- [ ] **Step 1: Write collection constraint tests**

Append to `graph-validation.test.ts`:

```typescript
import { validateCollectionConstraints } from "../validation/collections";

describe("validateCollectionConstraints", () => {
	it("passes for valid internal targeting", () => {
		const entities: Entity[] = [
			{
				id: "coll-1",
				type: "Collection",
				name: "Group",
				children: [
					{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "s2", items: [] } as Entity,
					{ id: "s2", type: "Stage", stageType: "EgoForm", label: "B", target: "outside", form: { fields: [] }, introductionPanel: { title: "T", text: "T" } } as Entity,
				],
			} as Entity,
		];
		const allEntities: Entity[] = [
			...entities,
			{ id: "outside", type: "Stage", stageType: "FinishInterview", label: "End" } as Entity,
		];
		const errors = validateCollectionConstraints(allEntities);
		expect(errors).toHaveLength(0);
	});

	it("rejects non-last child targeting outside collection", () => {
		const entities: Entity[] = [
			{
				id: "coll-1",
				type: "Collection",
				name: "Group",
				children: [
					{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "outside", items: [] } as Entity,
					{ id: "s2", type: "Stage", stageType: "FinishInterview", label: "B" } as Entity,
				],
			} as Entity,
			{ id: "outside", type: "Stage", stageType: "FinishInterview", label: "End" } as Entity,
		];
		const errors = validateCollectionConstraints(entities);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain("s1");
	});

	it("rejects branch as last child of collection", () => {
		const entities: Entity[] = [
			{
				id: "coll-1",
				type: "Collection",
				name: "Group",
				children: [
					{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "b1", items: [] } as Entity,
					{
						id: "b1",
						type: "Branch",
						name: "Bad",
						slots: [
							{ id: "slot-1", label: "A", filter: { join: "AND", rules: [] }, target: "outside1" },
							{ id: "slot-2", label: "B", default: true, target: "outside2" },
						],
					} as Entity,
				],
			} as Entity,
		];
		const errors = validateCollectionConstraints(entities);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain("last child");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/graph-validation.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement collection constraints**

```typescript
// packages/protocol-validation/src/schemas/9/validation/collections.ts
import type { BranchEntity } from "../timeline/branch";
import type { CollectionEntity } from "../timeline/collection";
import type { Entity } from "../timeline/entity";
import type { StageEntity } from "../stages";
import { flattenAllEntities } from "./flatten";

function getTargetsForEntity(entity: Entity): string[] {
	if (entity.type === "Stage" && "target" in entity && (entity as StageEntity).target) {
		return [(entity as StageEntity).target as string];
	}
	if (entity.type === "Branch") {
		return (entity as BranchEntity).slots.map((s) => s.target);
	}
	return [];
}

export function validateCollectionConstraints(topLevelEntities: Entity[]): string[] {
	const errors: string[] = [];

	function checkCollection(collection: CollectionEntity) {
		const children = collection.children;
		const siblingIds = new Set(children.map((c) => c.id));
		const lastChild = children[children.length - 1];

		// Last child must not be a Branch
		if (lastChild.type === "Branch") {
			errors.push(
				`Collection "${collection.id}" has a Branch ("${lastChild.id}") as its last child, which would create multiple exits`,
			);
		}

		// Non-last children can only target siblings
		for (let i = 0; i < children.length - 1; i++) {
			const child = children[i];
			const targets = getTargetsForEntity(child);
			for (const targetId of targets) {
				if (!siblingIds.has(targetId)) {
					errors.push(
						`Non-last child "${child.id}" in collection "${collection.id}" targets "${targetId}" outside the collection`,
					);
				}
			}
		}

		// First child cannot be targeted by siblings
		if (children.length > 1) {
			const firstChildId = children[0].id;
			for (let i = 1; i < children.length; i++) {
				const targets = getTargetsForEntity(children[i]);
				if (targets.includes(firstChildId)) {
					errors.push(
						`Sibling "${children[i].id}" targets first child "${firstChildId}" in collection "${collection.id}"`,
					);
				}
			}
		}

		// Recurse into nested collections
		for (const child of children) {
			if (child.type === "Collection") {
				checkCollection(child as CollectionEntity);
			}
		}
	}

	for (const entity of flattenAllEntities(topLevelEntities)) {
		if (entity.type === "Collection") {
			checkCollection(entity as CollectionEntity);
		}
	}

	return errors;
}
```

- [ ] **Step 4: Update validation index export**

Add to `packages/protocol-validation/src/schemas/9/validation/index.ts`:

```typescript
export * from "./collections";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/graph-validation.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/protocol-validation/src/schemas/9/validation/
git commit -m "feat(protocol-validation): add v9 collection constraint validation"
```

---

### Task 10: Integrate Validation into Protocol SuperRefine

Wire all graph validation + codebook cross-reference validation into the v9 protocol schema's `superRefine`. The codebook validation is adapted from v8's superRefine but operates on `flattenStageEntities()` instead of `protocol.stages`.

**Files:**
- Modify: `packages/protocol-validation/src/schemas/9/schema.ts`
- Create: `packages/protocol-validation/src/schemas/9/__tests__/codebook-validation.test.ts`

- [ ] **Step 1: Write codebook cross-reference tests**

```typescript
// packages/protocol-validation/src/schemas/9/__tests__/codebook-validation.test.ts
import { describe, expect, it } from "vitest";
import ProtocolSchemaV9 from "../schema";

describe("v9 protocol superRefine validation", () => {
	const validCodebook = {
		node: {
			person: {
				name: "Person",
				color: "coral",
				icon: "add-a-person",
				shape: { default: "circle" },
				variables: {
					age: { name: "age", type: "number" },
				},
			},
		},
		edge: {},
	};

	it("rejects duplicate entity IDs", () => {
		const result = ProtocolSchemaV9.safeParse({
			name: "Test",
			schemaVersion: 9,
			codebook: validCodebook,
			timeline: {
				start: "s1",
				entities: [
					{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "s1", items: [] },
					{ id: "s1", type: "Stage", stageType: "FinishInterview", label: "B" },
				],
			},
		});
		expect(result.success).toBe(false);
	});

	it("rejects invalid stage subject reference", () => {
		const result = ProtocolSchemaV9.safeParse({
			name: "Test",
			schemaVersion: 9,
			codebook: validCodebook,
			timeline: {
				start: "s1",
				entities: [
					{
						id: "s1",
						type: "Stage",
						stageType: "NameGenerator",
						label: "NG",
						target: "s2",
						subject: { entity: "node", type: "nonexistent" },
						prompts: [{ id: "p1", text: "Name someone" }],
						behaviours: { minNodes: 0, maxNodes: 0 },
					},
					{ id: "s2", type: "Stage", stageType: "FinishInterview", label: "Done" },
				],
			},
		});
		expect(result.success).toBe(false);
	});

	it("rejects cycle in timeline", () => {
		const result = ProtocolSchemaV9.safeParse({
			name: "Test",
			schemaVersion: 9,
			codebook: validCodebook,
			timeline: {
				start: "s1",
				entities: [
					{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "s2", items: [] },
					{ id: "s2", type: "Stage", stageType: "Information", label: "B", target: "s1", items: [] },
				],
			},
		});
		expect(result.success).toBe(false);
	});

	it("accepts a valid v9 protocol with branches", () => {
		const result = ProtocolSchemaV9.safeParse({
			name: "Test",
			schemaVersion: 9,
			codebook: validCodebook,
			timeline: {
				start: "s1",
				entities: [
					{ id: "s1", type: "Stage", stageType: "Information", label: "Welcome", target: "b1", items: [] },
					{
						id: "b1",
						type: "Branch",
						name: "Split",
						slots: [
							{ id: "slot-1", label: "A", filter: { join: "AND", rules: [] }, target: "s2" },
							{ id: "slot-2", label: "Default", default: true, target: "s3" },
						],
					},
					{ id: "s2", type: "Stage", stageType: "FinishInterview", label: "End A" },
					{ id: "s3", type: "Stage", stageType: "FinishInterview", label: "End B" },
				],
			},
		});
		expect(result.success).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/codebook-validation.test.ts`
Expected: FAIL (superRefine not yet added)

- [ ] **Step 3: Add superRefine to protocol schema**

Update `packages/protocol-validation/src/schemas/9/schema.ts` to add a `.superRefine()` that:
1. Calls `validateIdUniqueness`, `validateTargetReferences`, `validateStartReference`
2. Calls `validateNoCycles`, `validateAllPathsTerminate`, `validateNoOrphans`
3. Calls `validateCollectionConstraints`
4. Iterates `flattenStageEntities()` for codebook cross-reference checks (adapted from v8 `schema.ts:54-462`)

The codebook cross-reference validation logic should be copied from v8's `schema.ts` lines 54-462, but the stage iteration changes from `protocol.stages.forEach(...)` to:

```typescript
import { flattenStageEntities } from "./validation/flatten";
import { validateIdUniqueness, validateTargetReferences, validateStartReference } from "./validation/references";
import { validateNoCycles, validateAllPathsTerminate, validateNoOrphans } from "./validation/graph";
import { validateCollectionConstraints } from "./validation/collections";

// In the .superRefine((protocol, ctx) => { ... }):

// Graph validation
const graphErrors = [
	...validateIdUniqueness(protocol.timeline.entities),
	...validateTargetReferences(protocol.timeline.entities),
	...validateStartReference(protocol.timeline),
	...validateNoCycles(protocol.timeline),
	...validateAllPathsTerminate(protocol.timeline),
	...validateNoOrphans(protocol.timeline),
	...validateCollectionConstraints(protocol.timeline.entities),
];

for (const error of graphErrors) {
	ctx.addIssue({ code: "custom", message: error, path: ["timeline"] });
}

// Codebook cross-reference validation (same logic as v8, using flattenStageEntities)
const allStages = flattenStageEntities(protocol.timeline.entities);
allStages.forEach((stage, stageIndex) => {
	// ... same validation as v8 schema.ts lines 56-462 but using stage.stageType for type checks
	// and "stageType" instead of "type" where the stage type literal is referenced
});
```

The implementing engineer should read `packages/protocol-validation/src/schemas/8/schema.ts` lines 54-462 in full and adapt each validation block for:
- `protocol.stages` → `allStages` (from `flattenStageEntities`)
- `stage.type` checks → `stage.stageType` checks
- `skipLogic` validation removed (no longer on stages)
- Branch slot filter validation added (validate filter rules on branch slots the same way skip logic filters were validated)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/codebook-validation.test.ts`
Expected: PASS

- [ ] **Step 5: Run full v9 test suite**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add packages/protocol-validation/src/schemas/9/schema.ts packages/protocol-validation/src/schemas/9/__tests__/codebook-validation.test.ts
git commit -m "feat(protocol-validation): integrate v9 graph + codebook validation into superRefine"
```

---

## Milestone 3: Migration & Integration

### Task 11: V8 to V9 Migration

Create the migration that converts v8 protocols (flat stages array with skip logic) to v9 (timeline with branches).

**Files:**
- Create: `packages/protocol-validation/src/schemas/9/migration.ts`
- Create: `packages/protocol-validation/src/schemas/9/__tests__/migration.test.ts`

- [ ] **Step 1: Write migration tests**

```typescript
// packages/protocol-validation/src/schemas/9/__tests__/migration.test.ts
import { describe, expect, it } from "vitest";
import migrationV8toV9 from "../migration";

describe("v8 to v9 migration", () => {
	it("converts a simple linear protocol", () => {
		const v8 = {
			schemaVersion: 8,
			name: "Test",
			codebook: { node: {}, edge: {} },
			stages: [
				{ id: "s1", type: "Information", label: "Welcome", items: [] },
				{ id: "s2", type: "EgoForm", label: "Demographics", form: { fields: [] }, introductionPanel: { title: "T", text: "T" } },
			],
		};

		const result = migrationV8toV9.migrate(v8 as never, {});

		expect(result.schemaVersion).toBe(9);
		expect(result).not.toHaveProperty("stages");
		expect(result).toHaveProperty("timeline");

		const timeline = (result as Record<string, unknown>).timeline as {
			start: string;
			entities: Array<Record<string, unknown>>;
		};

		expect(timeline.start).toBe("s1");
		// Original 2 stages + appended FinishInterview
		expect(timeline.entities).toHaveLength(3);

		// First entity should be s1 with target s2
		expect(timeline.entities[0]).toMatchObject({
			id: "s1",
			type: "Stage",
			stageType: "Information",
			target: "s2",
		});

		// Last entity should be FinishInterview
		const lastEntity = timeline.entities[timeline.entities.length - 1];
		expect(lastEntity).toMatchObject({
			type: "Stage",
			stageType: "FinishInterview",
		});
		expect(lastEntity).not.toHaveProperty("target");
	});

	it("converts skip logic to branches", () => {
		const v8 = {
			schemaVersion: 8,
			name: "Test",
			codebook: { node: {}, edge: {} },
			stages: [
				{ id: "s1", type: "Information", label: "Welcome", items: [] },
				{
					id: "s2",
					type: "EgoForm",
					label: "Demographics",
					form: { fields: [] },
					introductionPanel: { title: "T", text: "T" },
					skipLogic: {
						action: "SKIP",
						filter: { join: "AND", rules: [{ id: "r1", type: "ego", options: { attribute: "age", operator: "LESS_THAN", value: 18 } }] },
					},
				},
				{ id: "s3", type: "Information", label: "Thank You", items: [] },
			],
		};

		const result = migrationV8toV9.migrate(v8 as never, {});
		const timeline = (result as Record<string, unknown>).timeline as {
			start: string;
			entities: Array<Record<string, unknown>>;
		};

		// Should have: s1, branch, s2, s3, FinishInterview
		const branchEntity = timeline.entities.find((e) => e.type === "Branch");
		expect(branchEntity).toBeDefined();
		expect((branchEntity as Record<string, unknown>).name).toContain("Demographics");

		// s1 should target the branch
		expect(timeline.entities[0]).toMatchObject({ id: "s1", target: branchEntity!.id });

		// Verify no entity has skipLogic
		for (const entity of timeline.entities) {
			expect(entity).not.toHaveProperty("skipLogic");
		}
	});

	it("handles SHOW skip logic action", () => {
		const v8 = {
			schemaVersion: 8,
			name: "Test",
			codebook: { node: {}, edge: {} },
			stages: [
				{ id: "s1", type: "Information", label: "Welcome", items: [] },
				{
					id: "s2",
					type: "EgoForm",
					label: "Optional Form",
					form: { fields: [] },
					introductionPanel: { title: "T", text: "T" },
					skipLogic: {
						action: "SHOW",
						filter: { join: "AND", rules: [] },
					},
				},
				{ id: "s3", type: "Information", label: "End", items: [] },
			],
		};

		const result = migrationV8toV9.migrate(v8 as never, {});
		const timeline = (result as Record<string, unknown>).timeline as {
			start: string;
			entities: Array<Record<string, unknown>>;
		};

		const branchEntity = timeline.entities.find((e) => e.type === "Branch") as Record<string, unknown>;
		const slots = branchEntity.slots as Array<Record<string, unknown>>;

		// SHOW: condition match → show (target s2), default → skip (target s3)
		const conditionSlot = slots.find((s) => !s.default);
		const defaultSlot = slots.find((s) => s.default);
		expect(conditionSlot?.target).toBe("s2");

		// Default should skip to s3 or the finish stage
		const s3OrFinish = timeline.entities.find(
			(e) => e.id === defaultSlot?.target,
		);
		expect(s3OrFinish).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/migration.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the migration**

```typescript
// packages/protocol-validation/src/schemas/9/migration.ts
import { v4 as uuidv4 } from "uuid";
import { createMigration, type ProtocolDocument } from "~/migration";

type V8Stage = {
	id: string;
	type: string;
	label: string;
	skipLogic?: {
		action: "SHOW" | "SKIP";
		filter: Record<string, unknown>;
	};
	[key: string]: unknown;
};

function convertStageToEntity(stage: V8Stage, target: string | undefined): Record<string, unknown> {
	const { type, skipLogic, ...rest } = stage;
	const entity: Record<string, unknown> = {
		...rest,
		type: "Stage",
		stageType: type,
	};
	if (target) {
		entity.target = target;
	}
	return entity;
}

const migrationV8toV9 = createMigration({
	from: 8,
	to: 9,
	dependencies: {},
	notes: `
- Replaced flat 'stages' array with hierarchical 'timeline' data structure supporting branches, collections, and multiple routes through the interview.
- Stage 'type' field renamed to 'stageType'. New 'type' field is the entity discriminator ("Stage", "Collection", "Branch").
- Skip logic on stages converted to Branch entities with conditional slots.
- Explicit FinishInterview stage appended (previously auto-injected).
- New entity types: Branch (decision points with filter-based slots), Collection (grouped entities).
`,
	migrate: (doc, _deps) => {
		const v8 = doc as unknown as {
			schemaVersion: 8;
			stages: V8Stage[];
			[key: string]: unknown;
		};

		const { stages, schemaVersion, ...restProtocol } = v8;

		// Generate FinishInterview stage
		const finishStageId = uuidv4();
		const finishStage: Record<string, unknown> = {
			id: finishStageId,
			type: "Stage",
			stageType: "FinishInterview",
			label: "Finish Interview",
		};

		// Build v9 entities, inserting branches for skip logic
		const entities: Record<string, unknown>[] = [];

		for (let i = 0; i < stages.length; i++) {
			const stage = stages[i];
			const nextStageId = i < stages.length - 1 ? stages[i + 1].id : finishStageId;

			if (stage.skipLogic) {
				const { action, filter } = stage.skipLogic;
				const branchId = uuidv4();
				const conditionSlotId = uuidv4();
				const defaultSlotId = uuidv4();

				// Update previous entity's target to point to the branch
				if (entities.length > 0) {
					const prev = entities[entities.length - 1];
					if (prev.target === stage.id) {
						prev.target = branchId;
					}
				}

				let conditionTarget: string;
				let defaultTarget: string;

				if (action === "SKIP") {
					// SKIP: condition matches → skip to next, default → proceed to this stage
					conditionTarget = nextStageId;
					defaultTarget = stage.id;
				} else {
					// SHOW: condition matches → show this stage, default → skip to next
					conditionTarget = stage.id;
					defaultTarget = nextStageId;
				}

				const branch: Record<string, unknown> = {
					id: branchId,
					type: "Branch",
					name: `${action === "SKIP" ? "Skip" : "Show"}: ${stage.label}`,
					slots: [
						{
							id: conditionSlotId,
							label: action === "SKIP" ? "Skip" : "Show",
							filter,
							target: conditionTarget,
						},
						{
							id: defaultSlotId,
							label: "Default",
							default: true,
							target: defaultTarget,
						},
					],
				};

				entities.push(branch);
				entities.push(convertStageToEntity(stage, nextStageId));
			} else {
				entities.push(convertStageToEntity(stage, nextStageId));
			}
		}

		// Fix: first entity should target correctly if it was preceded by a branch insertion
		// Update start reference
		const startId = entities.length > 0 ? (entities[0].id as string) : finishStageId;

		// Append FinishInterview
		entities.push(finishStage);

		const result = {
			...restProtocol,
			schemaVersion: 9 as const,
			timeline: {
				start: startId,
				entities,
			},
		};

		return result as ProtocolDocument<9>;
	},
});

export default migrationV8toV9;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @codaco/protocol-validation test -- --run src/schemas/9/__tests__/migration.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-validation/src/schemas/9/migration.ts packages/protocol-validation/src/schemas/9/__tests__/migration.test.ts
git commit -m "feat(protocol-validation): add v8→v9 migration with skip logic → branch conversion"
```

---

### Task 12: Update Schema Index + Package Exports

Wire v9 into the schema version system and register the migration.

**Files:**
- Modify: `packages/protocol-validation/src/schemas/index.ts`
- Modify: `packages/protocol-validation/src/migration/migrate-protocol.ts`
- Modify: `packages/protocol-validation/src/migration/index.ts`

- [ ] **Step 1: Update the schema index**

Edit `packages/protocol-validation/src/schemas/index.ts`:

```typescript
import { z } from "zod";
import ProtocolSchemaV7 from "./7/schema";
import ProtocolSchemaV8 from "./8/schema";
import ProtocolSchemaV9 from "./9/schema";

export const SchemaVersionSchema = z.union([
	z.literal(1),
	z.literal(2),
	z.literal(3),
	z.literal(4),
	z.literal(5),
	z.literal(6),
	z.literal(7),
	z.literal(8),
	z.literal(9),
]);

export type SchemaVersion = z.infer<typeof SchemaVersionSchema>;
export const CURRENT_SCHEMA_VERSION = 9 as const;

export const VersionedProtocolSchema = z.discriminatedUnion("schemaVersion", [
	ProtocolSchemaV7,
	ProtocolSchemaV8,
	ProtocolSchemaV9,
]);
export const CurrentProtocolSchema = ProtocolSchemaV9;

export type VersionedProtocol = z.infer<typeof VersionedProtocolSchema>;
export type CurrentProtocol = z.infer<typeof CurrentProtocolSchema>;

export type Protocol<V extends SchemaVersion> = Extract<VersionedProtocol, { schemaVersion: V }>;

export * from "./7/schema";
export * from "./8/schema";
export * from "./9/schema";
```

- [ ] **Step 2: Update ProtocolTypeMap in migration/index.ts**

Add v9 to the `ProtocolTypeMap` in `packages/protocol-validation/src/migration/index.ts`:

```typescript
import type ProtocolSchemaV9 from "../schemas/9/schema";

type ProtocolTypeMap = {
	7: z.infer<typeof ProtocolSchemaV7>;
	8: z.infer<typeof ProtocolSchemaV8>;
	9: z.infer<typeof ProtocolSchemaV9>;
};
```

- [ ] **Step 3: Register v8→v9 migration**

Add to `packages/protocol-validation/src/migration/migrate-protocol.ts`:

```typescript
import migrationV8toV9 from "../schemas/9/migration";

// After the existing registrations:
protocolMigrations.register(migrationV8toV9);
```

- [ ] **Step 4: Run full test suite**

Run: `pnpm --filter @codaco/protocol-validation test`
Expected: All PASS

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @codaco/protocol-validation typecheck`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/protocol-validation/src/schemas/index.ts packages/protocol-validation/src/migration/
git commit -m "feat(protocol-validation): register v9 schema and migration, update CURRENT_SCHEMA_VERSION to 9"
```

---

## Milestone 4: Architect Redux

### Task 13: Timeline Reducer

Create a new Redux slice for the timeline structure, replacing the flat stages reducer with entity-aware CRUD operations.

**Files:**
- Create: `apps/architect-vite/src/ducks/modules/protocol/timeline.ts`
- Create: `apps/architect-vite/src/ducks/modules/protocol/__tests__/timeline.test.ts`

- [ ] **Step 1: Write timeline reducer tests**

```typescript
// apps/architect-vite/src/ducks/modules/protocol/__tests__/timeline.test.ts
import { describe, expect, it } from "vitest";
import timelineReducer, { timelineActions } from "../timeline";
import type { Timeline } from "@codaco/protocol-validation";

const initialTimeline: Timeline = {
	start: "s1",
	entities: [
		{ id: "s1", type: "Stage", stageType: "Information", label: "Welcome", target: "s2", items: [] },
		{ id: "s2", type: "Stage", stageType: "FinishInterview", label: "Done" },
	],
};

describe("timeline reducer", () => {
	describe("insertEntity", () => {
		it("inserts a stage between two entities and rewires targets", () => {
			const newStage = {
				id: "s-new",
				type: "Stage" as const,
				stageType: "EgoForm" as const,
				label: "New",
				form: { fields: [] },
				introductionPanel: { title: "T", text: "T" },
			};
			const result = timelineReducer(
				initialTimeline,
				timelineActions.insertEntity({ entity: newStage, afterEntityId: "s1" }),
			);
			// s1 should now target s-new
			const s1 = result.entities.find((e) => e.id === "s1");
			expect(s1 && "target" in s1 && s1.target).toBe("s-new");
			// s-new should target s2
			const sNew = result.entities.find((e) => e.id === "s-new");
			expect(sNew && "target" in sNew && sNew.target).toBe("s2");
		});
	});

	describe("deleteEntity", () => {
		it("removes an entity and rewires parent to target", () => {
			const threeStages: Timeline = {
				start: "s1",
				entities: [
					{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "s2", items: [] },
					{ id: "s2", type: "Stage", stageType: "Information", label: "B", target: "s3", items: [] },
					{ id: "s3", type: "Stage", stageType: "FinishInterview", label: "C" },
				],
			};
			const result = timelineReducer(threeStages, timelineActions.deleteEntity("s2"));
			expect(result.entities).toHaveLength(2);
			const s1 = result.entities.find((e) => e.id === "s1");
			expect(s1 && "target" in s1 && s1.target).toBe("s3");
		});
	});

	describe("updateEntity", () => {
		it("updates entity properties", () => {
			const result = timelineReducer(
				initialTimeline,
				timelineActions.updateEntity({ entityId: "s1", updates: { label: "Updated" } }),
			);
			const s1 = result.entities.find((e) => e.id === "s1");
			expect(s1?.label ?? (s1 as Record<string, unknown>)?.label).toBe("Updated");
		});
	});

	describe("moveEntity", () => {
		it("moves entity to new position and rewires targets", () => {
			const threeStages: Timeline = {
				start: "s1",
				entities: [
					{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "s2", items: [] },
					{ id: "s2", type: "Stage", stageType: "Information", label: "B", target: "s3", items: [] },
					{ id: "s3", type: "Stage", stageType: "FinishInterview", label: "C" },
				],
			};
			const result = timelineReducer(
				threeStages,
				timelineActions.moveEntity({ entityId: "s2", afterEntityId: null }),
			);
			// s2 should now be first, targeting s1
			expect(result.start).toBe("s2");
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter architect-vite test -- --run src/ducks/modules/protocol/__tests__/timeline.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the timeline reducer**

```typescript
// apps/architect-vite/src/ducks/modules/protocol/timeline.ts
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Timeline, Entity, BranchEntity, StageEntity, CollectionEntity } from "@codaco/protocol-validation";

type TimelineState = Timeline;

function findAndUpdateTarget(entities: Entity[], sourceId: string, newTarget: string) {
	for (const entity of entities) {
		if (entity.type === "Stage" && entity.id === sourceId && "target" in entity) {
			(entity as Record<string, unknown>).target = newTarget;
			return;
		}
		if (entity.type === "Branch" && entity.id === sourceId) {
			// For branches, caller should specify which slot - this is a simple rewire for non-branch entities
			return;
		}
		if (entity.type === "Collection") {
			findAndUpdateTarget((entity as CollectionEntity).children, sourceId, newTarget);
		}
	}
}

function findParentTargetingEntity(
	entities: Entity[],
	targetId: string,
): { entity: Entity; slotIndex?: number } | null {
	for (const entity of entities) {
		if (entity.type === "Stage" && "target" in entity && (entity as StageEntity).target === targetId) {
			return { entity };
		}
		if (entity.type === "Branch") {
			const branch = entity as BranchEntity;
			const slotIndex = branch.slots.findIndex((s) => s.target === targetId);
			if (slotIndex >= 0) return { entity, slotIndex };
		}
		if (entity.type === "Collection") {
			const found = findParentTargetingEntity((entity as CollectionEntity).children, targetId);
			if (found) return found;
		}
	}
	return null;
}

function getEntityTarget(entity: Entity): string | undefined {
	if (entity.type === "Stage" && "target" in entity) {
		return (entity as StageEntity).target as string | undefined;
	}
	return undefined;
}

const timelineSlice = createSlice({
	name: "timeline",
	initialState: { start: "", entities: [] } as TimelineState,
	reducers: {
		setTimeline: (_state, action: PayloadAction<TimelineState>) => {
			return action.payload;
		},
		insertEntity: (state, action: PayloadAction<{ entity: Entity; afterEntityId: string }>) => {
			const { entity, afterEntityId } = action.payload;
			const afterEntity = state.entities.find((e) => e.id === afterEntityId);
			if (!afterEntity) return;

			const oldTarget = getEntityTarget(afterEntity);
			// Wire: afterEntity → new entity → oldTarget
			findAndUpdateTarget(state.entities, afterEntityId, entity.id);
			if (oldTarget && entity.type === "Stage") {
				(entity as Record<string, unknown>).target = oldTarget;
			}

			const afterIndex = state.entities.findIndex((e) => e.id === afterEntityId);
			state.entities.splice(afterIndex + 1, 0, entity);
		},
		deleteEntity: (state, action: PayloadAction<string>) => {
			const entityId = action.payload;
			const entityIndex = state.entities.findIndex((e) => e.id === entityId);
			if (entityIndex < 0) return;

			const entity = state.entities[entityIndex];
			const entityTarget = getEntityTarget(entity);

			// Rewire parent to skip deleted entity
			const parent = findParentTargetingEntity(state.entities, entityId);
			if (parent && entityTarget) {
				if (parent.slotIndex !== undefined) {
					(parent.entity as BranchEntity).slots[parent.slotIndex].target = entityTarget;
				} else {
					findAndUpdateTarget(state.entities, parent.entity.id, entityTarget);
				}
			}

			// Update start if needed
			if (state.start === entityId && entityTarget) {
				state.start = entityTarget;
			}

			state.entities.splice(entityIndex, 1);
		},
		updateEntity: (state, action: PayloadAction<{ entityId: string; updates: Partial<Entity> }>) => {
			const { entityId, updates } = action.payload;
			const entityIndex = state.entities.findIndex((e) => e.id === entityId);
			if (entityIndex >= 0) {
				state.entities[entityIndex] = { ...state.entities[entityIndex], ...updates } as Entity;
			}
		},
		moveEntity: (state, action: PayloadAction<{ entityId: string; afterEntityId: string | null }>) => {
			const { entityId, afterEntityId } = action.payload;
			const entityIndex = state.entities.findIndex((e) => e.id === entityId);
			if (entityIndex < 0) return;

			const entity = state.entities[entityIndex];
			const entityTarget = getEntityTarget(entity);

			// Remove from current position (rewire parent)
			const parent = findParentTargetingEntity(state.entities, entityId);
			if (parent && entityTarget) {
				if (parent.slotIndex !== undefined) {
					(parent.entity as BranchEntity).slots[parent.slotIndex].target = entityTarget;
				} else {
					findAndUpdateTarget(state.entities, parent.entity.id, entityTarget);
				}
			} else if (state.start === entityId && entityTarget) {
				state.start = entityTarget;
			}

			state.entities.splice(entityIndex, 1);

			// Insert at new position
			if (afterEntityId === null) {
				// Move to start
				const oldStart = state.start;
				state.start = entityId;
				(entity as Record<string, unknown>).target = oldStart;
				state.entities.unshift(entity);
			} else {
				const afterIndex = state.entities.findIndex((e) => e.id === afterEntityId);
				const afterEntity = state.entities[afterIndex];
				const afterTarget = getEntityTarget(afterEntity);

				findAndUpdateTarget(state.entities, afterEntityId, entityId);
				(entity as Record<string, unknown>).target = afterTarget;
				state.entities.splice(afterIndex + 1, 0, entity);
			}
		},
	},
});

export const timelineActions = timelineSlice.actions;
export default timelineSlice.reducer;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter architect-vite test -- --run src/ducks/modules/protocol/__tests__/timeline.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/architect-vite/src/ducks/modules/protocol/timeline.ts apps/architect-vite/src/ducks/modules/protocol/__tests__/timeline.test.ts
git commit -m "feat(architect): add timeline reducer with entity CRUD and graph rewiring"
```

---

### Task 14: Update Selectors + Integrate Timeline Reducer

Replace stage selectors with timeline-aware selectors and wire the timeline reducer into the active protocol state.

**Files:**
- Create: `apps/architect-vite/src/selectors/timeline.ts`
- Modify: `apps/architect-vite/src/ducks/modules/activeProtocol.ts`
- Modify: `apps/architect-vite/src/selectors/protocol.ts`

- [ ] **Step 1: Create timeline selectors**

```typescript
// apps/architect-vite/src/selectors/timeline.ts
import { createSelector } from "@reduxjs/toolkit";
import type { Entity, StageEntity, BranchEntity, CollectionEntity } from "@codaco/protocol-validation";
import { getProtocol } from "./protocol";

export const getTimeline = createSelector(getProtocol, (protocol) => protocol?.timeline ?? null);

export const getTimelineEntities = createSelector(getTimeline, (timeline) => timeline?.entities ?? []);

export const getTimelineStart = createSelector(getTimeline, (timeline) => timeline?.start ?? null);

type EntityListItem = {
	id: string;
	type: "Stage" | "Collection" | "Branch";
	label: string;
	stageType?: string;
	hasFilter?: boolean;
};

function flattenToList(entities: Entity[]): EntityListItem[] {
	const result: EntityListItem[] = [];
	for (const entity of entities) {
		if (entity.type === "Stage") {
			const stage = entity as StageEntity;
			result.push({
				id: stage.id,
				type: "Stage",
				label: stage.label,
				stageType: stage.stageType,
			});
		} else if (entity.type === "Branch") {
			const branch = entity as BranchEntity;
			result.push({
				id: branch.id,
				type: "Branch",
				label: branch.name,
				hasFilter: true,
			});
		} else if (entity.type === "Collection") {
			const collection = entity as CollectionEntity;
			result.push({
				id: collection.id,
				type: "Collection",
				label: collection.name,
			});
			// Include children flattened
			result.push(...flattenToList(collection.children));
		}
	}
	return result;
}

export const getEntityList = createSelector(getTimelineEntities, flattenToList);

export const getEntity = createSelector(
	[getTimelineEntities, (_state: unknown, entityId: string) => entityId],
	(entities, entityId): Entity | null => {
		function find(list: Entity[]): Entity | null {
			for (const entity of list) {
				if (entity.id === entityId) return entity;
				if (entity.type === "Collection") {
					const found = find((entity as CollectionEntity).children);
					if (found) return found;
				}
			}
			return null;
		}
		return find(entities);
	},
);
```

- [ ] **Step 2: Update activeProtocol to use timeline reducer**

In `apps/architect-vite/src/ducks/modules/activeProtocol.ts`, add the timeline reducer to the extra reducers alongside the existing stages reducer. The stages reducer should be kept temporarily for backwards compatibility during the transition but the timeline reducer should be the primary one.

The implementing engineer should:
1. Import `timelineReducer` and `timelineActions` from `./protocol/timeline`
2. Add matcher for `timeline/` actions in the `extraReducers` builder, delegating to `timelineReducer` for the `timeline` field of the protocol state
3. Ensure `getProtocol` selector still works (it returns `state.activeProtocol.present`)

- [ ] **Step 3: Update protocol selectors**

Update `apps/architect-vite/src/selectors/protocol.ts` to export timeline selectors and deprecate stage-specific ones:
- `getStageList` should delegate to `getEntityList` from the new timeline selectors
- `getStage` should delegate to `getEntity`
- Keep `getProtocol`, `getCodebook`, `getAssetManifest` unchanged

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter architect-vite typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/architect-vite/src/selectors/timeline.ts apps/architect-vite/src/ducks/modules/activeProtocol.ts apps/architect-vite/src/selectors/protocol.ts
git commit -m "feat(architect): add timeline selectors and integrate timeline reducer"
```

---

## Milestone 5: Timeline UI

### Task 15: Layout Algorithm

Create a deterministic layout algorithm that computes (row, column) positions for each entity from the timeline graph structure.

**Files:**
- Create: `apps/architect-vite/src/components/Timeline/layout.ts`
- Create: `apps/architect-vite/src/components/Timeline/__tests__/layout.test.ts`

- [ ] **Step 1: Write layout algorithm tests**

```typescript
// apps/architect-vite/src/components/Timeline/__tests__/layout.test.ts
import { describe, expect, it } from "vitest";
import { computeLayout, type LayoutNode } from "../layout";
import type { Timeline } from "@codaco/protocol-validation";

describe("computeLayout", () => {
	it("assigns sequential rows for linear timeline", () => {
		const timeline: Timeline = {
			start: "s1",
			entities: [
				{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "s2", items: [] },
				{ id: "s2", type: "Stage", stageType: "FinishInterview", label: "B" },
			],
		};
		const layout = computeLayout(timeline);
		expect(layout.get("s1")).toMatchObject({ row: 0, column: 0 });
		expect(layout.get("s2")).toMatchObject({ row: 1, column: 0 });
	});

	it("splits into columns at branches", () => {
		const timeline: Timeline = {
			start: "s1",
			entities: [
				{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "b1", items: [] },
				{
					id: "b1",
					type: "Branch",
					name: "Split",
					slots: [
						{ id: "slot-1", label: "Left", filter: { join: "AND", rules: [] }, target: "s2" },
						{ id: "slot-2", label: "Right", default: true, target: "s3" },
					],
				},
				{ id: "s2", type: "Stage", stageType: "FinishInterview", label: "End A" },
				{ id: "s3", type: "Stage", stageType: "FinishInterview", label: "End B" },
			],
		};
		const layout = computeLayout(timeline);
		expect(layout.get("b1")?.row).toBe(1);
		// s2 and s3 should be in different columns
		const s2 = layout.get("s2")!;
		const s3 = layout.get("s3")!;
		expect(s2.column).not.toBe(s3.column);
		expect(s2.row).toBe(2);
		expect(s3.row).toBe(2);
	});

	it("places convergence point after longest path", () => {
		const timeline: Timeline = {
			start: "s1",
			entities: [
				{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "b1", items: [] },
				{
					id: "b1",
					type: "Branch",
					name: "Split",
					slots: [
						{ id: "slot-1", label: "Long", filter: { join: "AND", rules: [] }, target: "s2" },
						{ id: "slot-2", label: "Short", default: true, target: "s4" },
					],
				},
				{ id: "s2", type: "Stage", stageType: "Information", label: "B", target: "s3", items: [] },
				{ id: "s3", type: "Stage", stageType: "Information", label: "C", target: "s4", items: [] },
				{ id: "s4", type: "Stage", stageType: "FinishInterview", label: "Converge" },
			],
		};
		const layout = computeLayout(timeline);
		// s4 should be placed after the longest path (s2 → s3 → s4)
		expect(layout.get("s4")!.row).toBeGreaterThan(layout.get("s3")!.row);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter architect-vite test -- --run src/components/Timeline/__tests__/layout.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the layout algorithm**

```typescript
// apps/architect-vite/src/components/Timeline/layout.ts
import type { Timeline, Entity, BranchEntity, CollectionEntity, StageEntity } from "@codaco/protocol-validation";

export type LayoutNode = {
	row: number;
	column: number;
	entityId: string;
	type: "Stage" | "Branch" | "Collection";
};

function buildIndex(entities: Entity[]): Map<string, Entity> {
	const index = new Map<string, Entity>();
	function walk(list: Entity[]) {
		for (const entity of list) {
			index.set(entity.id, entity);
			if (entity.type === "Collection") {
				walk((entity as CollectionEntity).children);
			}
		}
	}
	walk(entities);
	return index;
}

function resolveTarget(targetId: string, index: Map<string, Entity>): string {
	const target = index.get(targetId);
	if (target?.type === "Collection") {
		const children = (target as CollectionEntity).children;
		if (children.length > 0) return children[0].id;
	}
	return targetId;
}

function getSuccessors(entity: Entity, index: Map<string, Entity>): string[] {
	if (entity.type === "Stage") {
		const target = (entity as StageEntity).target as string | undefined;
		return target ? [resolveTarget(target, index)] : [];
	}
	if (entity.type === "Branch") {
		return (entity as BranchEntity).slots.map((s) => resolveTarget(s.target, index));
	}
	if (entity.type === "Collection") {
		const children = (entity as CollectionEntity).children;
		return children.length > 0 ? [children[0].id] : [];
	}
	return [];
}

export function computeLayout(timeline: Timeline): Map<string, LayoutNode> {
	const index = buildIndex(timeline.entities);
	const layout = new Map<string, LayoutNode>();
	const rowAssignment = new Map<string, number>();

	// BFS with column tracking
	// Each branch slot gets a different column offset
	type QueueItem = { entityId: string; row: number; column: number };
	const queue: QueueItem[] = [{ entityId: timeline.start, row: 0, column: 0 }];
	const visited = new Set<string>();

	while (queue.length > 0) {
		const item = queue.shift()!;
		const { entityId, column } = item;
		let { row } = item;

		// Resolve collection to first child
		const resolved = resolveTarget(entityId, index);
		const actualId = resolved;

		if (visited.has(actualId)) {
			// Convergence: update row to max
			const existing = layout.get(actualId);
			if (existing && row > existing.row) {
				existing.row = row;
				// Re-process successors with updated row
				const entity = index.get(actualId);
				if (entity) {
					const successors = getSuccessors(entity, index);
					for (const successor of successors) {
						const successorLayout = layout.get(successor);
						if (successorLayout && row + 1 > successorLayout.row) {
							queue.push({ entityId: successor, row: row + 1, column: successorLayout.column });
						}
					}
				}
			}
			continue;
		}

		visited.add(actualId);

		const entity = index.get(actualId);
		if (!entity) continue;

		// Also place the collection itself if entityId was a collection
		if (entityId !== actualId) {
			layout.set(entityId, { row, column, entityId, type: "Collection" });
		}

		layout.set(actualId, {
			row,
			column,
			entityId: actualId,
			type: entity.type as "Stage" | "Branch" | "Collection",
		});

		if (entity.type === "Branch") {
			const branch = entity as BranchEntity;
			const slotCount = branch.slots.length;
			const startCol = column - Math.floor((slotCount - 1) / 2);
			for (let i = 0; i < branch.slots.length; i++) {
				const slot = branch.slots[i];
				const slotCol = startCol + i;
				queue.push({ entityId: slot.target, row: row + 1, column: slotCol });
			}
		} else {
			const successors = getSuccessors(entity, index);
			for (const successor of successors) {
				queue.push({ entityId: successor, row: row + 1, column });
			}
		}
	}

	return layout;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter architect-vite test -- --run src/components/Timeline/__tests__/layout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/architect-vite/src/components/Timeline/layout.ts apps/architect-vite/src/components/Timeline/__tests__/layout.test.ts
git commit -m "feat(architect): add deterministic timeline layout algorithm"
```

---

### Task 16: Entity Node Components

Create the individual rendering components for each entity type in the timeline graph.

**Files:**
- Create: `apps/architect-vite/src/components/Timeline/StageNode.tsx`
- Create: `apps/architect-vite/src/components/Timeline/CollectionNode.tsx`
- Create: `apps/architect-vite/src/components/Timeline/BranchNode.tsx`
- Create: `apps/architect-vite/src/components/Timeline/InsertPoint.tsx`

- [ ] **Step 1: Create StageNode component**

```tsx
// apps/architect-vite/src/components/Timeline/StageNode.tsx
import type { StageEntity } from "@codaco/protocol-validation";

type StageNodeProps = {
	entity: StageEntity;
	stageNumber: number;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
};

export default function StageNode({ entity, stageNumber, onEdit, onDelete }: StageNodeProps) {
	return (
		<div className="timeline-stage" data-entity-id={entity.id}>
			<button
				type="button"
				className="timeline-stage__edit-stage"
				onClick={() => onEdit(entity.id)}
			>
				<img
					src={`/images/timeline/stage--${entity.stageType}.png`}
					alt={entity.stageType}
				/>
			</button>
			<div className="timeline-stage__notch">{stageNumber}</div>
			<div className="timeline-stage__label">{entity.label}</div>
			<div className="timeline-stage__controls">
				<button type="button" onClick={() => onDelete(entity.id)}>
					Delete
				</button>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Create BranchNode component**

```tsx
// apps/architect-vite/src/components/Timeline/BranchNode.tsx
import type { BranchEntity } from "@codaco/protocol-validation";

type BranchNodeProps = {
	entity: BranchEntity;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
};

export default function BranchNode({ entity, onEdit, onDelete }: BranchNodeProps) {
	return (
		<div className="timeline-branch" data-entity-id={entity.id}>
			<div className="timeline-branch__diamond" onClick={() => onEdit(entity.id)}>
				<span className="timeline-branch__name">{entity.name}</span>
			</div>
			<div className="timeline-branch__slots">
				{entity.slots.map((slot) => (
					<div key={slot.id} className="timeline-branch__slot">
						<span>{slot.label}</span>
						{slot.default && <span className="timeline-branch__default-badge">default</span>}
					</div>
				))}
			</div>
			<div className="timeline-branch__controls">
				<button type="button" onClick={() => onDelete(entity.id)}>
					Delete
				</button>
			</div>
		</div>
	);
}
```

- [ ] **Step 3: Create CollectionNode component**

```tsx
// apps/architect-vite/src/components/Timeline/CollectionNode.tsx
import type { CollectionEntity } from "@codaco/protocol-validation";
import type { LayoutNode } from "./layout";

type CollectionNodeProps = {
	entity: CollectionEntity;
	childLayouts: Map<string, LayoutNode>;
	renderEntity: (entity: CollectionEntity["children"][number], layout: LayoutNode) => React.ReactNode;
};

export default function CollectionNode({ entity, childLayouts, renderEntity }: CollectionNodeProps) {
	return (
		<div className="timeline-collection" data-entity-id={entity.id}>
			<div className="timeline-collection__header">{entity.name}</div>
			<div className="timeline-collection__children">
				{entity.children.map((child) => {
					const layout = childLayouts.get(child.id);
					return layout ? <div key={child.id}>{renderEntity(child, layout)}</div> : null;
				})}
			</div>
		</div>
	);
}
```

- [ ] **Step 4: Create InsertPoint component**

```tsx
// apps/architect-vite/src/components/Timeline/InsertPoint.tsx
type InsertPointProps = {
	afterEntityId: string;
	onInsert: (afterEntityId: string) => void;
};

export default function InsertPoint({ afterEntityId, onInsert }: InsertPointProps) {
	return (
		<button
			type="button"
			className="timeline__insert"
			onClick={() => onInsert(afterEntityId)}
			aria-label="Insert entity"
		>
			+
		</button>
	);
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/architect-vite/src/components/Timeline/StageNode.tsx apps/architect-vite/src/components/Timeline/BranchNode.tsx apps/architect-vite/src/components/Timeline/CollectionNode.tsx apps/architect-vite/src/components/Timeline/InsertPoint.tsx
git commit -m "feat(architect): add entity node components (Stage, Branch, Collection, InsertPoint)"
```

---

### Task 17: Timeline Graph Component

Create the main TimelineGraph component that composes the layout algorithm and entity nodes into the full graph visualization.

**Files:**
- Create: `apps/architect-vite/src/components/Timeline/TimelineGraph.tsx`
- Modify: `apps/architect-vite/src/components/Timeline/Timeline.tsx`

- [ ] **Step 1: Create TimelineGraph component**

```tsx
// apps/architect-vite/src/components/Timeline/TimelineGraph.tsx
import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation } from "wouter";
import type { Entity, StageEntity, BranchEntity, CollectionEntity } from "@codaco/protocol-validation";
import { getTimeline } from "../../selectors/timeline";
import { timelineActions } from "../../ducks/modules/protocol/timeline";
import { computeLayout, type LayoutNode } from "./layout";
import StageNode from "./StageNode";
import BranchNode from "./BranchNode";
import CollectionNode from "./CollectionNode";
import InsertPoint from "./InsertPoint";

export default function TimelineGraph() {
	const dispatch = useDispatch();
	const [, setLocation] = useLocation();
	const timeline = useSelector(getTimeline);

	const handleEdit = useCallback(
		(entityId: string) => {
			setLocation(`/protocol/entity/${entityId}`);
		},
		[setLocation],
	);

	const handleDelete = useCallback(
		(entityId: string) => {
			dispatch(timelineActions.deleteEntity(entityId));
		},
		[dispatch],
	);

	const handleInsert = useCallback(
		(afterEntityId: string) => {
			setLocation(`/protocol/entity/new?afterEntityId=${afterEntityId}`);
		},
		[setLocation],
	);

	if (!timeline) return null;

	const layout = computeLayout(timeline);

	function renderEntity(entity: Entity, layoutNode: LayoutNode, stageCounter: { count: number }) {
		const style = {
			gridRow: layoutNode.row + 1,
			gridColumn: layoutNode.column + 1,
		};

		switch (entity.type) {
			case "Stage": {
				stageCounter.count++;
				return (
					<div key={entity.id} style={style}>
						<InsertPoint afterEntityId={entity.id} onInsert={handleInsert} />
						<StageNode
							entity={entity as StageEntity}
							stageNumber={stageCounter.count}
							onEdit={handleEdit}
							onDelete={handleDelete}
						/>
					</div>
				);
			}
			case "Branch":
				return (
					<div key={entity.id} style={style}>
						<BranchNode
							entity={entity as BranchEntity}
							onEdit={handleEdit}
							onDelete={handleDelete}
						/>
					</div>
				);
			case "Collection":
				return (
					<div key={entity.id} style={style}>
						<CollectionNode
							entity={entity as CollectionEntity}
							childLayouts={layout}
							renderEntity={(child, childLayout) =>
								renderEntity(child, childLayout, stageCounter)
							}
						/>
					</div>
				);
			default:
				return null;
		}
	}

	const stageCounter = { count: 0 };

	return (
		<div className="timeline-graph">
			{timeline.entities.map((entity) => {
				const layoutNode = layout.get(entity.id);
				if (!layoutNode) return null;
				return renderEntity(entity, layoutNode, stageCounter);
			})}
		</div>
	);
}
```

- [ ] **Step 2: Update Timeline.tsx to use TimelineGraph**

Replace the existing Timeline component's stage list rendering with the new TimelineGraph. Keep the outer container, dialog management, and new-stage screen. Replace the `Reorder.Group` section with `<TimelineGraph />`.

The implementing engineer should read the current `Timeline.tsx` and preserve:
- The `NewStageScreen` dialog integration
- The delete confirmation dialog
- The overall container structure

But replace the `Reorder.Group` / stage mapping with the `TimelineGraph` component.

- [ ] **Step 3: Run the dev server and verify rendering**

Run: `pnpm --filter architect-vite dev`
Expected: Timeline renders with the new graph layout. Open an existing protocol to verify stages display correctly.

- [ ] **Step 4: Commit**

```bash
git add apps/architect-vite/src/components/Timeline/TimelineGraph.tsx apps/architect-vite/src/components/Timeline/Timeline.tsx
git commit -m "feat(architect): add TimelineGraph component with graph-based rendering"
```

---

### Task 18: Drag and Drop + Entity Operations

Add drag-and-drop reordering to the timeline graph for stages and branch slot reordering.

**Files:**
- Modify: `apps/architect-vite/src/components/Timeline/TimelineGraph.tsx`
- Modify: `apps/architect-vite/src/components/Timeline/StageNode.tsx`
- Modify: `apps/architect-vite/src/components/Timeline/BranchNode.tsx`

- [ ] **Step 1: Add drag-and-drop to StageNode**

Update `StageNode.tsx` to use `Reorder.Item` from `motion/react` for draggable stages:

```tsx
import { Reorder, useDragControls } from "motion/react";

// Wrap the stage div in <Reorder.Item value={entity} id={entity.id}>
// Add onPointerDown/onClick handlers to distinguish click (edit) from drag
// Same pattern as current Timeline.tsx lines 118-127
```

- [ ] **Step 2: Add slot reordering to BranchNode**

Update `BranchNode.tsx` to support reordering slots within a branch using `Reorder.Group` + `Reorder.Item` on the slots array. Dispatch a new `timelineActions.reorderBranchSlots` action on reorder.

Add the `reorderBranchSlots` action to the timeline reducer:

```typescript
reorderBranchSlots: (state, action: PayloadAction<{ branchId: string; slotIds: string[] }>) => {
	const { branchId, slotIds } = action.payload;
	const branch = state.entities.find((e) => e.id === branchId);
	if (branch?.type !== "Branch") return;
	const branchEntity = branch as BranchEntity;
	const slotMap = new Map(branchEntity.slots.map((s) => [s.id, s]));
	branchEntity.slots = slotIds
		.map((id) => slotMap.get(id))
		.filter((s): s is BranchSlot => s !== undefined);
},
```

- [ ] **Step 3: Add stage reordering to TimelineGraph**

Update `TimelineGraph.tsx` to wrap the entity list in a `Reorder.Group` for top-level entities. On reorder, dispatch `timelineActions.moveEntity` with the detected old/new positions. Use the same detection pattern as the current `Timeline.tsx` (compare old and new arrays to find the moved item).

Disable drop targets that would create cycles or violate collection constraints by checking against the validation functions.

- [ ] **Step 4: Test drag-and-drop manually**

Run: `pnpm --filter architect-vite dev`
Expected: Stages can be dragged and dropped to reorder. Branch slots can be reordered. Invalid drops are prevented.

- [ ] **Step 5: Commit**

```bash
git add apps/architect-vite/src/components/Timeline/ apps/architect-vite/src/ducks/modules/protocol/timeline.ts
git commit -m "feat(architect): add drag-and-drop to timeline graph"
```

---

### Task 19: Final Integration + Lint + Typecheck

Run all quality checks, fix any issues, and verify the full build.

**Files:** Various (fixes only)

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Run linter with auto-fix**

Run: `pnpm lint:fix`
Expected: All issues fixed or none remaining

- [ ] **Step 4: Run the build**

Run: `pnpm build`
Expected: All packages build successfully

- [ ] **Step 5: Fix any issues found in steps 1-4**

Address any test failures, type errors, lint issues, or build errors.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: fix lint, types, and build for v9 timeline implementation"
```
