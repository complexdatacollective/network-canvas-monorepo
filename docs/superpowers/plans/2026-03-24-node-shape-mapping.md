# Node Shape Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shape support to NodeDefinition with optional variable-to-shape mapping (discrete and breakpoint types), including schema, migration, validation, and Architect UI.

**Architecture:** Extend the Zod schema for NodeDefinition to include a required `shape` object with `default` and optional `dynamic` mapping. Rename `iconVariant` → `icon`. Add migration steps to the existing v8 migration. Build new UI components in the Architect TypeEditor for shape selection and variable mapping.

**Tech Stack:** Zod, Vitest, React, Redux Form, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-24-node-shape-mapping-design.md`

---

### Task 1: Add NodeShapes constant and ShapeMapping schemas to definitions.ts

**Files:**
- Modify: `packages/protocol-validation/src/schemas/8/codebook/definitions.ts`

- [ ] **Step 1: Add NodeShapes constant and NodeShape type**

Add after the `NodeColorSequence` block:

```typescript
export const NodeShapes = ["circle", "square", "diamond"] as const;
export type NodeShape = (typeof NodeShapes)[number];
```

- [ ] **Step 2: Add ShapeMapping schemas**

Add before `NodeDefinitionSchema`:

```typescript
const DiscreteShapeMappingSchema = z.strictObject({
	variable: z.string(),
	type: z.literal("discrete"),
	map: z.array(
		z.strictObject({
			value: z.union([z.string(), z.number(), z.boolean()]),
			shape: z.enum(NodeShapes),
		}),
	),
});

const BreakpointShapeMappingSchema = z.strictObject({
	variable: z.string(),
	type: z.literal("breakpoints"),
	thresholds: z
		.array(
			z.strictObject({
				value: z.number(),
				shape: z.enum(NodeShapes),
			}),
		)
		.min(1)
		.max(2),
});

const ShapeMappingSchema = z.union([DiscreteShapeMappingSchema, BreakpointShapeMappingSchema]);

const ShapeSchema = z.strictObject({
	default: z.enum(NodeShapes),
	dynamic: ShapeMappingSchema.optional(),
});
```

- [ ] **Step 3: Update NodeDefinitionSchema**

Replace the existing `NodeDefinitionSchema` with:

```typescript
const NodeDefinitionSchema = z.strictObject({
	name: z.string(),
	icon: z
		.string()
		.optional()
		.generateMock(() => "add-a-person"),
	variables: VariablesSchema.optional().generateMock(() => VariablesSchema.generateMock()),
	color: z
		.union(NodeColorSequence.map((color) => z.literal(color)))
		.generateMock(() => faker.helpers.arrayElement(NodeColorSequence)),
	shape: ShapeSchema.generateMock(() => ({ default: "circle" as const })),
});
```

Key changes: `iconVariant` → `icon`, added `shape` field.

- [ ] **Step 4: Run tests to verify schema changes don't break mock generation**

Run: `pnpm --filter @codaco/protocol-validation test`

Expected: The mock-protocol-generation test may fail because `createBaseProtocol` in test-utils doesn't include `shape` yet. That's expected — we fix it in the next task.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-validation/src/schemas/8/codebook/definitions.ts
git commit -m "feat: add NodeShapes, ShapeMapping schemas and rename iconVariant to icon"
```

---

### Task 2: Update test utilities and fix breaking tests

**Files:**
- Modify: `packages/protocol-validation/src/utils/test-utils.ts`

- [ ] **Step 1: Add `shape` and rename `iconVariant` to `icon` in createBaseProtocol**

In `createBaseProtocol`, update both node definitions:

For the `person` node type, add after `color: "node-color-seq-1"`:
```typescript
shape: { default: "circle" as const },
```

For the `colleague` node type, add after `color: "node-color-seq-2"`:
```typescript
shape: { default: "circle" as const },
```

- [ ] **Step 2: Run all protocol-validation tests**

Run: `pnpm --filter @codaco/protocol-validation test`

Expected: Migration tests will fail because the v7→v8 migration doesn't add `shape` or rename `iconVariant` yet. The mock generation and superrefine tests should pass now.

- [ ] **Step 3: Commit**

```bash
git add packages/protocol-validation/src/utils/test-utils.ts
git commit -m "test: add shape field to test protocol fixtures"
```

---

### Task 3: Update v8 migration to add shape and rename iconVariant

**Files:**
- Modify: `packages/protocol-validation/src/schemas/8/migration.ts`

- [ ] **Step 1: Add migration step for iconVariant → icon rename and shape addition**

Add a new entry to the `traverseAndTransform` array, before the schema version update step:

```typescript
{
	// Rename 'iconVariant' to 'icon' and add 'shape' to node definitions
	paths: ["codebook.node.*"],
	fn: <V>(entityDefinition: V) => {
		if (typeof entityDefinition === "object" && entityDefinition !== null) {
			const typedEntity = entityDefinition as Record<string, unknown>;
			if ("iconVariant" in typedEntity) {
				typedEntity.icon = typedEntity.iconVariant;
				delete typedEntity.iconVariant;
			}
			typedEntity.shape = { default: "circle" };
		}
		return entityDefinition;
	},
},
```

Also update the migration `notes` string to include:
```
- Renamed 'iconVariant' to 'icon' on node definitions.
- Added 'shape' property with default 'circle' to all node definitions.
```

- [ ] **Step 2: Run all protocol-validation tests**

Run: `pnpm --filter @codaco/protocol-validation test`

Expected: All tests should pass. The migration tests that use `ProtocolSchemaV8.parse(migratedRaw)` will now require the migrated data to have `shape`.

- [ ] **Step 3: Commit**

```bash
git add packages/protocol-validation/src/schemas/8/migration.ts
git commit -m "feat: add iconVariant→icon rename and shape field to v8 migration"
```

---

### Task 4: Add migration tests for shape and icon rename

**Files:**
- Modify: `packages/protocol-validation/src/schemas/8/__tests__/migration.test.ts`

- [ ] **Step 1: Add test for iconVariant → icon rename**

Add a new `describe` block:

```typescript
describe("iconVariant to icon rename", () => {
	it("renames iconVariant to icon on node definitions", () => {
		const v7Protocol = {
			schemaVersion: 7 as const,
			codebook: {
				node: {
					person: {
						name: "Person",
						color: "node-color-seq-1",
						iconVariant: "add-a-person",
					},
				},
				edge: {},
				ego: {},
			},
			stages: [],
		} as Protocol<7>;

		const migratedRaw = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });
		const parsed = ProtocolSchemaV8.parse(migratedRaw);

		expect(parsed.codebook.node?.person).not.toHaveProperty("iconVariant");
		expect(parsed.codebook.node?.person?.icon).toBe("add-a-person");
	});

	it("handles node definitions without iconVariant", () => {
		const v7Protocol = {
			schemaVersion: 7 as const,
			codebook: {
				node: {
					person: {
						name: "Person",
						color: "node-color-seq-1",
					},
				},
				edge: {},
				ego: {},
			},
			stages: [],
		} as Protocol<7>;

		const migratedRaw = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });
		const parsed = ProtocolSchemaV8.parse(migratedRaw);

		expect(parsed.codebook.node?.person).not.toHaveProperty("iconVariant");
		expect(parsed.codebook.node?.person?.icon).toBeUndefined();
	});
});
```

- [ ] **Step 2: Add test for shape field addition**

```typescript
describe("shape field addition", () => {
	it("adds default circle shape to all node definitions", () => {
		const v7Protocol = {
			schemaVersion: 7 as const,
			codebook: {
				node: {
					person: {
						name: "Person",
						color: "node-color-seq-1",
					},
					place: {
						name: "Place",
						color: "node-color-seq-2",
					},
				},
				edge: {},
				ego: {},
			},
			stages: [],
		} as Protocol<7>;

		const migratedRaw = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });
		const parsed = ProtocolSchemaV8.parse(migratedRaw);

		expect(parsed.codebook.node?.person?.shape).toEqual({ default: "circle" });
		expect(parsed.codebook.node?.place?.shape).toEqual({ default: "circle" });
	});
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @codaco/protocol-validation test`

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add packages/protocol-validation/src/schemas/8/__tests__/migration.test.ts
git commit -m "test: add migration tests for iconVariant rename and shape field"
```

---

### Task 5: Add schema validation tests for shape mapping

**Files:**
- Create: `packages/protocol-validation/src/schemas/8/__tests__/shape-mapping-validation.test.ts`

- [ ] **Step 1: Write schema validation tests**

```typescript
import { describe, expect, it } from "vitest";
import { createBaseProtocol } from "~/utils/test-utils";
import ProtocolSchemaV8 from "../schema";

describe("Shape Mapping Schema Validation", () => {
	const baseProtocol = createBaseProtocol();

	it("accepts a node definition with only a default shape", () => {
		const protocol = {
			...baseProtocol,
			codebook: {
				...baseProtocol.codebook,
				node: {
					person: {
						...baseProtocol.codebook.node.person,
						shape: { default: "circle" },
					},
				},
			},
		};
		const result = ProtocolSchemaV8.safeParse(protocol);
		expect(result.success).toBe(true);
	});

	it("accepts all valid shape values as defaults", () => {
		for (const shape of ["circle", "square", "diamond"] as const) {
			const protocol = {
				...baseProtocol,
				codebook: {
					...baseProtocol.codebook,
					node: {
						person: {
							...baseProtocol.codebook.node.person,
							shape: { default: shape },
						},
					},
				},
			};
			const result = ProtocolSchemaV8.safeParse(protocol);
			expect(result.success).toBe(true);
		}
	});

	it("rejects an invalid default shape", () => {
		const protocol = {
			...baseProtocol,
			codebook: {
				...baseProtocol.codebook,
				node: {
					person: {
						...baseProtocol.codebook.node.person,
						shape: { default: "hexagon" },
					},
				},
			},
		};
		const result = ProtocolSchemaV8.safeParse(protocol);
		expect(result.success).toBe(false);
	});

	it("accepts a discrete shape mapping", () => {
		const protocol = {
			...baseProtocol,
			codebook: {
				...baseProtocol.codebook,
				node: {
					person: {
						...baseProtocol.codebook.node.person,
						shape: {
							default: "circle",
							dynamic: {
								variable: "category",
								type: "discrete",
								map: [
									{ value: "friend", shape: "circle" },
									{ value: "family", shape: "square" },
								],
							},
						},
					},
				},
			},
		};
		const result = ProtocolSchemaV8.safeParse(protocol);
		expect(result.success).toBe(true);
	});

	it("accepts a breakpoint shape mapping with 1 threshold", () => {
		const protocol = {
			...baseProtocol,
			codebook: {
				...baseProtocol.codebook,
				node: {
					person: {
						...baseProtocol.codebook.node.person,
						shape: {
							default: "circle",
							dynamic: {
								variable: "age",
								type: "breakpoints",
								thresholds: [{ value: 18, shape: "square" }],
							},
						},
					},
				},
			},
		};
		const result = ProtocolSchemaV8.safeParse(protocol);
		expect(result.success).toBe(true);
	});

	it("accepts a breakpoint shape mapping with 2 thresholds", () => {
		const protocol = {
			...baseProtocol,
			codebook: {
				...baseProtocol.codebook,
				node: {
					person: {
						...baseProtocol.codebook.node.person,
						shape: {
							default: "circle",
							dynamic: {
								variable: "age",
								type: "breakpoints",
								thresholds: [
									{ value: 18, shape: "square" },
									{ value: 65, shape: "diamond" },
								],
							},
						},
					},
				},
			},
		};
		const result = ProtocolSchemaV8.safeParse(protocol);
		expect(result.success).toBe(true);
	});

	it("rejects a breakpoint shape mapping with 0 thresholds", () => {
		const protocol = {
			...baseProtocol,
			codebook: {
				...baseProtocol.codebook,
				node: {
					person: {
						...baseProtocol.codebook.node.person,
						shape: {
							default: "circle",
							dynamic: {
								variable: "age",
								type: "breakpoints",
								thresholds: [],
							},
						},
					},
				},
			},
		};
		const result = ProtocolSchemaV8.safeParse(protocol);
		expect(result.success).toBe(false);
	});

	it("rejects a breakpoint shape mapping with 3 thresholds", () => {
		const protocol = {
			...baseProtocol,
			codebook: {
				...baseProtocol.codebook,
				node: {
					person: {
						...baseProtocol.codebook.node.person,
						shape: {
							default: "circle",
							dynamic: {
								variable: "age",
								type: "breakpoints",
								thresholds: [
									{ value: 18, shape: "square" },
									{ value: 40, shape: "diamond" },
									{ value: 65, shape: "circle" },
								],
							},
						},
					},
				},
			},
		};
		const result = ProtocolSchemaV8.safeParse(protocol);
		expect(result.success).toBe(false);
	});

	it("rejects a node definition without shape field", () => {
		const protocol = {
			...baseProtocol,
			codebook: {
				...baseProtocol.codebook,
				node: {
					person: {
						name: "Person",
						color: "node-color-seq-1",
						// no shape field
					},
				},
			},
		};
		const result = ProtocolSchemaV8.safeParse(protocol);
		expect(result.success).toBe(false);
	});
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @codaco/protocol-validation test`

Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add packages/protocol-validation/src/schemas/8/__tests__/shape-mapping-validation.test.ts
git commit -m "test: add schema validation tests for shape mapping"
```

---

### Task 6: Update development protocol

**Files:**
- Modify: `packages/development-protocol/protocol.json`

- [ ] **Step 1: Update node definitions in protocol.json**

For each node definition in `codebook.node`:
- Rename `iconVariant` to `icon`
- Add `shape: { "default": "circle" }`

The two node types are `person_node_type` and `venue_node_type`.

- [ ] **Step 2: Run protocol-validation tests to verify the updated protocol is valid**

Run: `pnpm --filter @codaco/protocol-validation test`

Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add packages/development-protocol/protocol.json
git commit -m "chore: update development protocol with icon rename and shape field"
```

---

### Task 7: Update iconVariant → icon references in architect-vite

**Files:**
- Modify: `apps/architect-vite/src/components/TypeEditor/TypeEditor.tsx`
- Modify: `apps/architect-vite/src/components/TypeEditor/getNewTypeTemplate.ts`
- Modify: `apps/architect-vite/src/lib/ProtocolSummary/components/Codebook.tsx`
- Modify: `apps/architect-vite/src/components/TypeEditor/__tests__/convert.test.tsx`

- [ ] **Step 1: Update TypeEditor.tsx**

Replace all `iconVariant` references with `icon`:
- Line 28: `formSelector(state, "iconVariant")` → `formSelector(state, "icon")`
- Line 33: `change(form, "iconVariant", ICON_OPTIONS[0])` → `change(form, "icon", ICON_OPTIONS[0])`
- Line 77: `id={getFieldId("iconVariant")}` → `id={getFieldId("icon")}`
- Line 83: `name="iconVariant"` → `name="icon"`

- [ ] **Step 2: Update getNewTypeTemplate.ts**

Change `iconVariant: "add-a-person"` to `icon: "add-a-person"`, and add shape default:

```typescript
const getNewTypeTemplate = ({ protocol, entity }: { protocol: CurrentProtocol; entity: "node" | "edge" }) => ({
	...(entity === "node" && { icon: "add-a-person" }),
	...(entity === "node" && { shape: { default: "circle" as const } }),
	color: getNextCategoryColor(protocol, entity),
});
```

- [ ] **Step 3: Update Codebook.tsx**

Replace `iconVariant` with `icon` in the type definition and any usage.

- [ ] **Step 4: Update convert.test.tsx**

Replace `iconVariant` with `icon` in test data.

- [ ] **Step 5: Run lint and typecheck**

Run: `pnpm --filter architect-vite typecheck && pnpm lint:fix`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/architect-vite/
git commit -m "refactor: rename iconVariant to icon in architect-vite"
```

---

### Task 8: Update iconVariant → icon references in other apps

**Files:**
- Modify: `apps/interviewer/src/selectors/name-generator.js`
- Modify: `apps/interviewer/src/selectors/__tests__/protocol.test.js`
- Modify: `apps/interviewer/src/selectors/__tests__/interface.test.js`
- Modify: `apps/interviewer/src/selectors/__tests__/name-generator.test.js`
- Modify: `apps/interviewer/src/containers/Interfaces/NameGeneratorRoster/DropOverlay.js`
- Modify: `apps/architect-desktop/src/components/TypeEditor/TypeEditor.jsx`
- Modify: `apps/architect-desktop/src/components/TypeEditor/__tests__/convert.test.js`
- Modify: `apps/architect-desktop/src/components/TypeEditor/getNewTypeTemplate.js`
- Modify: `apps/architect-desktop/src/lib/ProtocolSummary/components/Codebook.jsx`
- Modify: `apps/architect-desktop/development-protocol/protocol.json`

- [ ] **Step 1: Rename all iconVariant → icon references in interviewer app**

Update each file, replacing `iconVariant` with `icon`. In `name-generator.js`, the fallback pattern `iconVariant || 'add-a-person'` becomes `icon || 'add-a-person'`.

- [ ] **Step 2: Rename all iconVariant → icon references in architect-desktop app**

Update each file, replacing `iconVariant` with `icon`. Follow the same pattern as architect-vite changes.

- [ ] **Step 3: Run lint**

Run: `pnpm lint:fix`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/interviewer/ apps/architect-desktop/
git commit -m "refactor: rename iconVariant to icon in interviewer and architect-desktop"
```

---

### Task 9: Add ShapePicker component to TypeEditor

**Files:**
- Create: `apps/architect-vite/src/components/TypeEditor/ShapePicker.tsx`

- [ ] **Step 1: Create the ShapePicker component**

This is a redux-form compatible field component (receives `input` and `meta` props) that renders 3 shape buttons (circle, square, diamond) as visual radio options.

```typescript
import cx from "classnames";

const SHAPES = [
	{ value: "circle", label: "Circle" },
	{ value: "square", label: "Square" },
	{ value: "diamond", label: "Diamond" },
] as const;

type ShapePickerProps = {
	input: {
		value: string;
		onChange: (value: string) => void;
	};
	meta: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
	small?: boolean;
};

const ShapePicker = ({ input, meta, small }: ShapePickerProps) => {
	const size = small ? 28 : 48;
	const showError = meta.invalid && meta.touched && meta.error;

	return (
		<div>
			<div style={{ display: "flex", gap: small ? "0.5rem" : "0.75rem" }}>
				{SHAPES.map(({ value, label }) => (
					<button
						key={value}
						type="button"
						onClick={() => input.onChange(value)}
						className={cx("shape-picker__shape", `shape-picker__shape--${value}`, {
							"shape-picker__shape--selected": input.value === value,
						})}
						style={{ width: size, height: size }}
						title={label}
						aria-label={label}
						aria-pressed={input.value === value}
					>
						<ShapeIcon shape={value} size={size - 8} />
					</button>
				))}
			</div>
			{showError && <p className="shape-picker__error">{meta.error}</p>}
		</div>
	);
};

const ShapeIcon = ({ shape, size }: { shape: string; size: number }) => {
	switch (shape) {
		case "circle":
			return (
				<svg width={size} height={size} viewBox="0 0 24 24">
					<circle cx="12" cy="12" r="10" fill="currentColor" />
				</svg>
			);
		case "square":
			return (
				<svg width={size} height={size} viewBox="0 0 24 24">
					<rect x="2" y="2" width="20" height="20" rx="2" fill="currentColor" />
				</svg>
			);
		case "diamond":
			return (
				<svg width={size} height={size} viewBox="0 0 24 24">
					<rect x="2" y="2" width="20" height="20" rx="2" fill="currentColor" transform="rotate(45 12 12)" />
				</svg>
			);
		default:
			return null;
	}
};

export default ShapePicker;
```

- [ ] **Step 2: Add CSS for ShapePicker**

Create styles in `apps/architect-vite/src/components/TypeEditor/ShapePicker.css`:

```css
.shape-picker__shape {
	display: flex;
	align-items: center;
	justify-content: center;
	border: 2px solid transparent;
	border-radius: 8px;
	background: var(--input-background);
	color: var(--color-platinum--dark);
	cursor: pointer;
	transition: border-color 0.15s, opacity 0.15s;
	opacity: 0.5;
	padding: 0;
}

.shape-picker__shape--selected {
	border-color: var(--color-neon-coral);
	opacity: 1;
	color: var(--color-neon-coral);
}

.shape-picker__shape:hover:not(.shape-picker__shape--selected) {
	opacity: 0.75;
}

.shape-picker__error {
	color: var(--error);
	font-size: 0.75rem;
	margin-top: 0.25rem;
}
```

Import this CSS at the top of `ShapePicker.tsx`:

```typescript
import "./ShapePicker.css";
```

- [ ] **Step 3: Commit**

```bash
git add apps/architect-vite/src/components/TypeEditor/ShapePicker.tsx apps/architect-vite/src/components/TypeEditor/ShapePicker.css
git commit -m "feat: add ShapePicker component for node shape selection"
```

---

### Task 10: Add Shape section to TypeEditor

**Files:**
- Modify: `apps/architect-vite/src/components/TypeEditor/TypeEditor.tsx`

- [ ] **Step 1: Add Shape section between Color and Icon**

Import `ShapePicker` and add a new `Section` for shape. Add a `ValidatedField` for `shape.default` using the `ShapePicker` component:

```tsx
import ShapePicker from "./ShapePicker";
```

Add after the Color section, inside the `{entity === "node" && ...}` guard (or add a new guard):

```tsx
{entity === "node" && (
	<Section
		title="Shape"
		id={getFieldId("shape")}
		summary={<p>Choose a default shape for this node type.</p>}
		layout="vertical"
	>
		<ValidatedField
			component={ShapePicker}
			name="shape.default"
			validation={{ required: true }}
		/>
	</Section>
)}
```

- [ ] **Step 2: Set default shape for new node types**

In the `useEffect` that sets default icon, also set default shape:

```typescript
useEffect(() => {
	if (entity === "node" && !formIcon) {
		dispatch(change(form, "icon", ICON_OPTIONS[0]));
	}
}, [entity, form, formIcon, dispatch]);

// Add shape default
const formShape = useAppSelector((state: RootState) => formSelector(state, "shape.default"));

useEffect(() => {
	if (entity === "node" && !formShape) {
		dispatch(change(form, "shape.default", "circle"));
	}
}, [entity, form, formShape, dispatch]);
```

- [ ] **Step 3: Run typecheck and lint**

Run: `pnpm --filter architect-vite typecheck && pnpm lint:fix`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/architect-vite/src/components/TypeEditor/TypeEditor.tsx
git commit -m "feat: add Shape section to TypeEditor with default shape picker"
```

---

### Task 11: Add ShapeVariableMapping component (discrete mapping)

**Files:**
- Create: `apps/architect-vite/src/components/TypeEditor/ShapeVariableMapping.tsx`
- Create: `apps/architect-vite/src/components/TypeEditor/ShapeVariableMapping.css`

- [ ] **Step 1: Create ShapeVariableMapping component**

This component handles:
- A toggle to enable/disable dynamic mapping
- A variable selector (filtered to eligible types)
- Renders DiscreteMapping or BreakpointMapping based on variable type

The component reads the current node type's variables from the redux form state and filters to eligible types (categorical, ordinal, boolean, number, scalar). When a variable is selected, it renders the appropriate mapping sub-component.

Implementation should use `formValueSelector` to read `shape.dynamic` and `variables` from the form, and `change` to write mapping data back.

This is a complex component — the implementer should follow the existing patterns in TypeEditor for reading/writing form state, and use the `NativeSelect` component for the variable dropdown.

Key behaviors:
- Toggle off → clears `shape.dynamic` from form
- Variable change → resets the mapping
- Discrete: renders a row per option with inline ShapePicker (small variant)
- Breakpoints: renders threshold rows with number inputs and ShapePicker

- [ ] **Step 2: Add CSS**

Style the mapping table, threshold rows, and toggle using the existing design system patterns (BEM naming, CSS custom properties).

- [ ] **Step 3: Integrate into TypeEditor**

Import and render `ShapeVariableMapping` inside the Shape section, after the default ShapePicker:

```tsx
<ShapeVariableMapping form={form} entity={entity} />
```

- [ ] **Step 4: Run typecheck and lint**

Run: `pnpm --filter architect-vite typecheck && pnpm lint:fix`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/architect-vite/src/components/TypeEditor/ShapeVariableMapping.tsx apps/architect-vite/src/components/TypeEditor/ShapeVariableMapping.css apps/architect-vite/src/components/TypeEditor/TypeEditor.tsx
git commit -m "feat: add ShapeVariableMapping component with discrete and breakpoint mapping UI"
```

---

### Task 12: Add superRefine validation for shape mapping cross-references

**Files:**
- Modify: `packages/protocol-validation/src/schemas/8/schema.ts` (or wherever the superRefine validation lives)

- [ ] **Step 1: Find the superRefine validation location**

The superRefine validation that checks cross-references (e.g., stage subjects referencing codebook entries) needs to be extended to validate shape mapping references. Find where this validation lives.

- [ ] **Step 2: Add shape mapping validation**

Add validation that checks:
- `dynamic.variable` references an existing variable in the node type's `variables`
- The referenced variable is an eligible type
- `type` matches the variable kind (discrete types → "discrete", continuous → "breakpoints")

This should produce descriptive error messages.

- [ ] **Step 3: Add tests for the cross-reference validation**

Add to `shape-mapping-validation.test.ts`:
- Test that referencing a non-existent variable produces an error
- Test that using "discrete" type with a number variable produces an error
- Test that using "breakpoints" type with a categorical variable produces an error

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @codaco/protocol-validation test`

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-validation/src/
git commit -m "feat: add superRefine validation for shape mapping variable cross-references"
```

---

### Task 13: Final verification and changeset

**Files:**
- None modified (verification only)

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`

Expected: All pass.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

Expected: No errors.

- [ ] **Step 3: Run lint**

Run: `pnpm lint:fix`

Expected: No errors or all auto-fixed.

- [ ] **Step 4: Create changeset**

Run: `pnpm changeset`

Add a minor changeset for `@codaco/protocol-validation` and `@codaco/development-protocol`:
- `@codaco/protocol-validation`: minor — "Add node shape support with variable-to-shape mapping (discrete and breakpoint types). Rename iconVariant to icon."
- `@codaco/development-protocol`: patch — "Update protocol with icon rename and shape field"

- [ ] **Step 5: Commit changeset**

```bash
git add .changeset/
git commit -m "chore: add changeset for node shape mapping feature"
```
