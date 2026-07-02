# Network Composer — Schema Implementation Plan (1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `NetworkComposer` stage type to the schema-8 protocol
validation, with full Zod parse validation and automatic cross-reference
(variable-existence) validation.

**Architecture:** A single new stage schema file extending `baseStageSchema`,
registered into the existing `z.discriminatedUnion('type', …)`. Cross-reference
validation needs **no new wiring**: `collectEntityAttributeReferences` walks the
static Zod tree via the `.meta()` brand on `entityAttributeReference(...)`, so the
new `quickAdd`, `layoutVariable`, node-form, and edge-form variable references are
discovered and existence-checked automatically by `ProtocolSchemaV8`.

**Tech Stack:** TypeScript, Zod v4, Vitest, pnpm workspace. The `~` import alias
maps to the package `src/` root (`packages/protocol-validation/src`).

## Global Constraints

- This is **additive to schema 8** — no `CURRENT_SCHEMA_VERSION` bump, no
  migration, no fixture enumerating all stage types to update.
- The stage `type` literal is exactly `'NetworkComposer'`.
- **No `any` types.** Match existing conventions verbatim: `entityAttributeReference({ subject: 'stageSubject' })` for variable references (no `requireType`, matching Narrative's `layoutVariable` and QuickAdd's `quickAdd`); `TitlelessFormSchema` for attribute forms; `findDuplicateName` for duplicate detection; `.strictObject(...)` for nested objects.
- **Edges are modelled as `{ subject: EdgeStageSubjectSchema, form? }`** (not `{ type, form? }`). This makes each edge entry a `subject` carrier, so `collectEntityAttributeReferences`'s `stageSubjectOf` resolves an edge form's `fields[].variable` against the **edge type**, not the node stage subject — correct validation with zero extractor changes. (This refines the design spec's illustrative `{ type, form? }`.)
- Do **not** add per-stage path wiring anywhere — cross-ref discovery is automatic.
- Pre-commit hooks run `oxfmt` + `oxlint` on staged files automatically; tasks do not run the formatter/linter manually. Defer `pnpm typecheck`, the full test suite, and `knip` to the single final verification task.
- Unused destructured bindings use a leading underscore (e.g. `const { quickAdd: _quickAdd, ...rest }`), matching `base-stage-label.test.ts`.

---

## File Structure

- **Create:** `packages/protocol-validation/src/schemas/8/stages/network-composer.ts`
  — the `networkComposerStage` Zod schema (sole responsibility: define + export the stage shape).
- **Modify:** `packages/protocol-validation/src/schemas/8/stages/index.ts`
  — import, re-export, and add `networkComposerStage` to the `stageSchemas` union array.
- **Create:** `packages/protocol-validation/src/schemas/8/__tests__/network-composer.test.ts`
  — parse-level unit tests for the stage schema + the discriminated-union test.
- **Create:** `packages/protocol-validation/src/schemas/8/__tests__/network-composer-cross-reference.test.ts`
  — cross-reference (variable-existence) tests via `ProtocolSchemaV8`.

---

## Task 1: Define the `networkComposerStage` schema

**Files:**

- Create: `packages/protocol-validation/src/schemas/8/stages/network-composer.ts`
- Test: `packages/protocol-validation/src/schemas/8/__tests__/network-composer.test.ts`

**Interfaces:**

- Consumes: `baseStageSchema` (from `./base`); `NodeStageSubjectSchema`, `EdgeStageSubjectSchema`, `TitlelessFormSchema` (from `../common`); `entityAttributeReference` (from `../entity-attribute-reference`); `findDuplicateName` (from `~/utils/validation-helpers`).
- Produces: `export const networkComposerStage` — a `z.ZodObject` whose inferred type has `type: 'NetworkComposer'`, `subject: { entity: 'node'; type: string }`, `quickAdd` + `layoutVariable` (branded `EntityAttributeReference` strings), optional `nodeForm: TitlelessForm`, optional `background`, optional `behaviours.automaticLayout.enabled`, and `edges: { subject: { entity: 'edge'; type: string }; form?: TitlelessForm }[]` (min 1).

- [ ] **Step 1: Write the failing tests**

Create `packages/protocol-validation/src/schemas/8/__tests__/network-composer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { networkComposerStage } from '../stages/network-composer';

const validStage = {
  id: 'nc1',
  label: 'Build the network',
  type: 'NetworkComposer',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  layoutVariable: 'layoutPosition',
  edges: [{ subject: { entity: 'edge', type: 'knows' } }],
};

describe('networkComposerStage schema', () => {
  it('accepts a minimal valid stage', () => {
    expect(networkComposerStage.safeParse(validStage).success).toBe(true);
  });

  it('requires quickAdd', () => {
    const { quickAdd: _quickAdd, ...withoutQuickAdd } = validStage;
    const result = networkComposerStage.safeParse(withoutQuickAdd);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.includes('quickAdd')),
      ).toBe(true);
    }
  });

  it('requires layoutVariable', () => {
    const { layoutVariable: _layoutVariable, ...withoutLayout } = validStage;
    const result = networkComposerStage.safeParse(withoutLayout);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.path.includes('layoutVariable'),
        ),
      ).toBe(true);
    }
  });

  it('requires at least one edge type', () => {
    const result = networkComposerStage.safeParse({ ...validStage, edges: [] });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate edge types', () => {
    const result = networkComposerStage.safeParse({
      ...validStage,
      edges: [
        { subject: { entity: 'edge', type: 'knows' } },
        { subject: { entity: 'edge', type: 'knows' } },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('duplicate'),
        ),
      ).toBe(true);
    }
  });

  it('accepts optional forms, background and behaviours', () => {
    const result = networkComposerStage.safeParse({
      ...validStage,
      nodeForm: { fields: [{ variable: 'age', prompt: 'Age?' }] },
      edges: [
        {
          subject: { entity: 'edge', type: 'knows' },
          form: { fields: [{ variable: 'closeness', prompt: 'How close?' }] },
        },
      ],
      background: { concentricCircles: 4, skewedTowardCenter: true },
      behaviours: { automaticLayout: { enabled: false } },
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8/__tests__/network-composer.test.ts`
Expected: FAIL — cannot resolve `../stages/network-composer` (module does not exist yet).

- [ ] **Step 3: Write the schema**

Create `packages/protocol-validation/src/schemas/8/stages/network-composer.ts`:

```ts
import { z } from 'zod';

import { findDuplicateName } from '~/utils/validation-helpers';

import {
  EdgeStageSubjectSchema,
  NodeStageSubjectSchema,
  TitlelessFormSchema,
} from '../common';
import { entityAttributeReference } from '../entity-attribute-reference';
import { baseStageSchema } from './base';

export const networkComposerStage = baseStageSchema.extend({
  type: z.literal('NetworkComposer'),
  subject: NodeStageSubjectSchema,
  // The text variable populated by the inline quick-add field when a node is
  // dropped on the canvas.
  quickAdd: entityAttributeReference({ subject: 'stageSubject' }),
  // The layout variable that stores each node's { x, y } position.
  layoutVariable: entityAttributeReference({ subject: 'stageSubject' }),
  // Attribute form shown in the inspector when a node is selected.
  nodeForm: TitlelessFormSchema.optional(),
  background: z
    .strictObject({
      image: z.string().optional(),
      concentricCircles: z.number().int().optional(),
      skewedTowardCenter: z.boolean().optional(),
    })
    .optional(),
  behaviours: z
    .strictObject({
      automaticLayout: z.strictObject({ enabled: z.boolean() }).optional(),
    })
    .optional(),
  // Each entry is a drawable edge type. `subject` carries the edge type so an
  // edge form's fields resolve their variable references against that edge type
  // (via collectEntityAttributeReferences' stageSubjectOf), not the node subject.
  edges: z
    .array(
      z.strictObject({
        subject: EdgeStageSubjectSchema,
        form: TitlelessFormSchema.optional(),
      }),
    )
    .min(1)
    .superRefine((edges, ctx) => {
      const duplicateType = findDuplicateName(
        edges.map((edge) => edge.subject.type),
      );
      if (duplicateType) {
        ctx.addIssue({
          code: 'custom' as const,
          message: `Network Composer edges contain duplicate type "${duplicateType}"`,
          path: [],
        });
      }
    }),
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8/__tests__/network-composer.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-validation/src/schemas/8/stages/network-composer.ts \
        packages/protocol-validation/src/schemas/8/__tests__/network-composer.test.ts
git commit -m "feat(protocol-validation): add NetworkComposer stage schema"
```

---

## Task 2: Register `NetworkComposer` in the stage discriminated union

**Files:**

- Modify: `packages/protocol-validation/src/schemas/8/stages/index.ts`
- Test: `packages/protocol-validation/src/schemas/8/__tests__/network-composer.test.ts` (append)

**Interfaces:**

- Consumes: `networkComposerStage` (from `./network-composer`), `stageSchema` (the exported `z.discriminatedUnion` from `../stages`).
- Produces: `NetworkComposer` becomes a member of `stageSchema`; `StageType` (`z.infer<typeof stageSchema>['type']`) now includes `'NetworkComposer'`.

- [ ] **Step 1: Write the failing test**

Append to `packages/protocol-validation/src/schemas/8/__tests__/network-composer.test.ts`:

```ts
import { stageSchema } from '../stages';

describe('stage discriminated union', () => {
  it('discriminates a NetworkComposer stage', () => {
    const result = stageSchema.safeParse(validStage);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('NetworkComposer');
    }
  });
});
```

(Place the `import { stageSchema } from '../stages';` line with the other imports at the top of the file.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8/__tests__/network-composer.test.ts -t "discriminates a NetworkComposer stage"`
Expected: FAIL — `stageSchema` rejects the unknown discriminator value `'NetworkComposer'`.

- [ ] **Step 3: Register the stage**

In `packages/protocol-validation/src/schemas/8/stages/index.ts`, make three edits.

Add the import alongside the other stage imports (keep alphabetical grouping near `narrativeStage`):

```ts
import { networkComposerStage } from './network-composer';
```

Add the re-export alongside the other `export *` lines:

```ts
export * from './network-composer';
```

Add `networkComposerStage` to the `stageSchemas` array (after `sociogramStage` reads naturally, but any position works):

```ts
const stageSchemas = [
  egoFormStage,
  alterFormStage,
  alterEdgeFormStage,
  nameGeneratorStage,
  nameGeneratorQuickAddStage,
  nameGeneratorRosterStage,
  sociogramStage,
  networkComposerStage,
  dyadCensusStage,
  tieStrengthCensusStage,
  ordinalBinStage,
  categoricalBinStage,
  narrativeStage,
  informationStage,
  anonymisationStage,
  oneToManyDyadCensusStage,
  familyPedigreeStage,
  geospatialStage,
] as const;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8/__tests__/network-composer.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-validation/src/schemas/8/stages/index.ts \
        packages/protocol-validation/src/schemas/8/__tests__/network-composer.test.ts
git commit -m "feat(protocol-validation): register NetworkComposer in stage union"
```

---

## Task 3: Cross-reference (variable-existence) validation

**Files:**

- Create: `packages/protocol-validation/src/schemas/8/__tests__/network-composer-cross-reference.test.ts`

**Interfaces:**

- Consumes: `ProtocolSchemaV8` (default export of `../schema` — the schema that runs cross-reference refinements including `validateEntityAttributeReferences`), `createBaseProtocol` (from `~/utils/test-utils`).
- Produces: nothing new — this task proves the automatic cross-ref discovery from Tasks 1–2 works, including that **edge form fields resolve against the edge type**.

`createBaseProtocol()` supplies node `person` (variables: `name`/text, `age`/number, `category`/categorical, `strength`/ordinal, `layoutPosition`/layout) and edges `knows` (variables: `closeness`/ordinal, `duration`/number) and `collaborates`. No codebook edits are needed.

- [ ] **Step 1: Write the failing tests**

Create `packages/protocol-validation/src/schemas/8/__tests__/network-composer-cross-reference.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { createBaseProtocol } from '~/utils/test-utils';

import ProtocolSchemaV8 from '../schema';

const baseStage = {
  id: 'nc1',
  label: 'Build the network',
  type: 'NetworkComposer',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  layoutVariable: 'layoutPosition',
  nodeForm: { fields: [{ variable: 'age', prompt: 'Age?' }] },
  edges: [
    {
      subject: { entity: 'edge', type: 'knows' },
      form: { fields: [{ variable: 'closeness', prompt: 'How close?' }] },
    },
  ],
};

const composerProtocol = (stage: Record<string, unknown>) => ({
  ...createBaseProtocol(),
  stages: [stage],
});

describe('NetworkComposer cross-reference validation', () => {
  it('accepts a stage whose references all exist (control)', () => {
    const result = ProtocolSchemaV8.safeParse(composerProtocol(baseStage));
    expect(result.success).toBe(true);
  });

  it('rejects a quickAdd referencing a missing node variable', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocol({ ...baseStage, quickAdd: 'missing' }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a layoutVariable referencing a missing node variable', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocol({ ...baseStage, layoutVariable: 'missing' }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a node form field referencing a missing node variable', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocol({
        ...baseStage,
        nodeForm: { fields: [{ variable: 'missing', prompt: 'x' }] },
      }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects an edge form field referencing a variable not on that edge type', () => {
    // `age` exists on the person node but NOT on the `knows` edge. If the edge
    // form resolved against the node subject this would wrongly pass.
    const result = ProtocolSchemaV8.safeParse(
      composerProtocol({
        ...baseStage,
        edges: [
          {
            subject: { entity: 'edge', type: 'knows' },
            form: { fields: [{ variable: 'age', prompt: 'x' }] },
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8/__tests__/network-composer-cross-reference.test.ts`
Expected: PASS (5 tests). All five should pass immediately because Tasks 1–2 wired the schema and cross-ref discovery is automatic. If the **control** test fails, inspect `result.error.issues` — a failing control usually means a typo in a reference value vs. the `createBaseProtocol` codebook. If the **edge form** test fails (i.e. it _passes_ validation), the edge `subject` carrier is not being picked up — re-check that `edges[].subject` uses `EdgeStageSubjectSchema` exactly.

- [ ] **Step 3: Commit**

```bash
git add packages/protocol-validation/src/schemas/8/__tests__/network-composer-cross-reference.test.ts
git commit -m "test(protocol-validation): cross-reference validation for NetworkComposer"
```

---

## Task 4: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full protocol-validation test suite**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run`
Expected: PASS — all existing tests plus the 12 new tests. Adding a discriminated-union member is additive; no existing test should change.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @codaco/protocol-validation typecheck`
Expected: no errors. (If the package has no `typecheck` script, run the root `pnpm typecheck`.)

- [ ] **Step 3: Knip (unused-export check)**

Run: `pnpm knip`
Expected: no new findings. `networkComposerStage` is consumed by `stages/index.ts`, so it must not be reported unused. If knip reports it, confirm the import was added to `stageSchemas` in Task 2.

- [ ] **Step 4: Confirm green and stop**

This completes the schema layer. The `NetworkComposer` stage type now validates structurally and by cross-reference. Proceed to plan 2 (interview runtime) and plan 3 (Architect editor), which both depend on this `type` literal and stage shape.

```

```
