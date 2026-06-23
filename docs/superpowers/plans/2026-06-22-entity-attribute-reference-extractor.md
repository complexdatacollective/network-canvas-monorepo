# Declarative entity-attribute references — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the v8 protocol schema the single source of truth for entity-attribute (codebook variable) references, driving usage detection, presence validation, and type validity from one per-field declaration.

**Architecture:** A `entityAttributeReference(descriptor)` Zod helper brands a string field and attaches a runtime `.meta()` descriptor (`{ subject, requireType? }`). A `collectEntityAttributeReferences(protocol)` walker traverses the schema's `_zod.def` tree alongside a protocol instance and emits one record per reference with its resolved subject. The schema `superRefine` and architect's usage/where-used selectors both derive from the extractor, replacing three hand-maintained lists.

**Tech Stack:** TypeScript, Zod 4, Vitest, pnpm workspaces, turbo. Architect: Redux + reselect.

## Global Constraints

- **No `any` types.** Use proper typing; avoid `as` assertions (prefer type guards / `satisfies`). **Carve-out:** `as` casts are permitted _strictly_ where traversing Zod's `_zod.def` internals, using the typed `zod/v4/core` def types (`core.$ZodObjectDef`, `core.$ZodArrayDef`, etc.) exactly as the existing `src/utils/zod-mock-extension.ts` does. Forbidden everywhere else. Reviewers must not flag internal-traversal casts that follow this pattern.
- **No barrel files** beyond the existing package entry chain (`src/index.ts` → `schemas` → `8/schema` → `variables`/etc.).
- **TDD:** every behavior change has a failing test first. Use targeted `vitest run <file>`.
- **Run via turbo / rebuild deps:** after changing `@codaco/protocol-validation`, run `pnpm turbo run build --filter=@codaco/protocol-validation` before architect typecheck/tests see the new exports. Typecheck via `pnpm turbo run typecheck --filter=<pkg>` (direct `tsc` misses unbuilt workspace deps).
- **Formatting/lint** handled by oxlint + oxfmt via the pre-commit hook; do not hand-run unless iterating.
- **Scope:** entity-**attribute** (variable) references only. Entity-**type** references (`createEdge`, `EdgeConfig.type`, `subject.type`) and asset references are out of scope; `paths.edges`/`nodes`/`assets` stay as-is.
- **v8 only:** the extractor targets `CurrentProtocolSchema` (ProtocolSchemaV8).
- **Brand constructor (decided during execution):** `entityAttributeReference()` brands the field type, so the field's output type is the branded `EntityAttributeReference`, not `string`. A plain `string` (e.g. from `getNodeVariableId()`) is therefore NOT assignable to it — this breaks `.generateMock(() => getNodeVariableId())` with `TS2769`. Resolution: a brand-boundary constructor `asEntityAttributeReference(id: string): EntityAttributeReference` is added to `entity-attribute-reference.ts` (defined in Task 4 Step 1). **Mock-wrapping rule:** wherever a tagged field keeps a `.generateMock(generator)`, the generator must return branded values — wrap each produced id with `asEntityAttributeReference(...)` (for array mocks, wrap each element). Fields with no `.generateMock` (plain `z.string()` or `z.string().optional()`) need no wrapping. The single `as` inside `asEntityAttributeReference` is the sanctioned brand boundary (branded types require a cast to construct); no other `as` for branding.
- **Unified existence message:** the new validator emits `The variable "<id>" does not exist in the codebook` for presence failures (matches the existing validation-cross-ref message); per-field wordings for the migrated checks are intentionally unified, and their test expectations are updated in Task 8.

---

## Part A — `@codaco/protocol-validation` foundation

### Task 1: The `entityAttributeReference` helper

**Files:**

- Create: `packages/protocol-validation/src/schemas/8/entity-attribute-reference.ts`
- Test: `packages/protocol-validation/src/schemas/8/__tests__/entity-attribute-reference.test.ts`

**Interfaces:**

- Produces:
  - `ENTITY_ATTRIBUTE_REFERENCE: 'entityAttributeReference'`
  - `type SubjectResolution = 'stageSubject' | 'ego' | 'owningVariable' | 'filterRule' | { sibling: string; entity: 'node' | 'edge' }`
  - `type EntityAttributeReferenceDescriptor = { subject: SubjectResolution; requireType?: readonly VariableType[] }`
  - `entityAttributeReference(descriptor): ZodString` (branded, meta-tagged)
  - `type EntityAttributeReference` (branded string)
  - `getEntityAttributeReferenceDescriptor(schema): EntityAttributeReferenceDescriptor | undefined`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ENTITY_ATTRIBUTE_REFERENCE,
  entityAttributeReference,
  getEntityAttributeReferenceDescriptor,
} from '../entity-attribute-reference';

describe('entityAttributeReference', () => {
  it('tags the schema with a retrievable descriptor', () => {
    const schema = entityAttributeReference({ subject: 'stageSubject' });
    expect(getEntityAttributeReferenceDescriptor(schema)).toEqual({
      subject: 'stageSubject',
    });
  });

  it('exposes the descriptor through an optional wrapper (meta on inner type)', () => {
    const schema = entityAttributeReference({ subject: 'ego' }).optional();
    const inner = schema._zod.def.innerType as z.ZodType;
    expect(getEntityAttributeReferenceDescriptor(inner)).toEqual({
      subject: 'ego',
    });
  });

  it('carries requireType and sibling-subject descriptors', () => {
    const schema = entityAttributeReference({
      subject: { sibling: 'createEdge', entity: 'edge' },
      requireType: ['ordinal'],
    });
    expect(getEntityAttributeReferenceDescriptor(schema)).toEqual({
      subject: { sibling: 'createEdge', entity: 'edge' },
      requireType: ['ordinal'],
    });
  });

  it('returns undefined for an untagged schema', () => {
    expect(getEntityAttributeReferenceDescriptor(z.string())).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/protocol-validation && pnpm exec vitest run src/schemas/8/__tests__/entity-attribute-reference.test.ts`
Expected: FAIL — module `../entity-attribute-reference` not found.

- [ ] **Step 3: Write the implementation**

```ts
import { z } from 'zod';

import type { VariableType } from './variables/types';

export const ENTITY_ATTRIBUTE_REFERENCE = 'entityAttributeReference' as const;

export type SubjectResolution =
  | 'stageSubject'
  | 'ego'
  | 'owningVariable'
  | 'filterRule'
  | { sibling: string; entity: 'node' | 'edge' };

export type EntityAttributeReferenceDescriptor = {
  subject: SubjectResolution;
  requireType?: readonly VariableType[];
};

export const entityAttributeReference = (
  descriptor: EntityAttributeReferenceDescriptor,
) =>
  z
    .string()
    .brand<'EntityAttributeReference'>()
    .meta({ [ENTITY_ATTRIBUTE_REFERENCE]: descriptor });

export type EntityAttributeReference = z.infer<
  ReturnType<typeof entityAttributeReference>
>;

export const getEntityAttributeReferenceDescriptor = (
  schema: z.ZodType,
): EntityAttributeReferenceDescriptor | undefined => {
  const meta = schema.meta();
  const descriptor = meta?.[ENTITY_ATTRIBUTE_REFERENCE];
  return descriptor as EntityAttributeReferenceDescriptor | undefined;
};
```

> Note: confirm the exported variable-type union name in `variables/types.ts`. If it is not `VariableType`, import the actual exported name and alias it locally; do not introduce `any`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/protocol-validation && pnpm exec vitest run src/schemas/8/__tests__/entity-attribute-reference.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-validation/src/schemas/8/entity-attribute-reference.ts packages/protocol-validation/src/schemas/8/__tests__/entity-attribute-reference.test.ts
git commit -m "feat(protocol-validation): entityAttributeReference helper"
```

---

### Task 2: The extractor walker

**Files:**

- Create: `packages/protocol-validation/src/utils/collectEntityAttributeReferences.ts`
- Test: `packages/protocol-validation/src/utils/__tests__/collectEntityAttributeReferences.test.ts`

**Interfaces:**

- Consumes: `getEntityAttributeReferenceDescriptor`, `ENTITY_ATTRIBUTE_REFERENCE` (Task 1); `CurrentProtocolSchema` (`packages/protocol-validation/src/schemas/index.ts`); `StageSubject` (`./common`).
- Produces:
  - `type EntityAttributeReferenceHit = { path: (string | number)[]; variableId: string; subject?: StageSubject; requireType?: readonly VariableType[] }`
  - `collectEntityAttributeReferencesFromSchema(schema: z.ZodType, value: unknown): EntityAttributeReferenceHit[]` — the generic walker entry, testable against any tagged schema.
  - `collectEntityAttributeReferences(protocol: unknown): EntityAttributeReferenceHit[]` — thin wrapper binding the generic entry to `CurrentProtocolSchema`.

> **Why a `FromSchema` seam:** this task's test must be **green on its own**, but the real `CurrentProtocolSchema` has no tagged fields until Tasks 4–6. Testing the walker against a small self-contained tagged schema verifies the traversal mechanics now, with no cross-task dependency. The real-protocol-schema integration assertions live in Task 6 (after tagging). `collectEntityAttributeReferencesFromSchema` is a genuinely useful export (the generic core), so this is not test-only surface.

- [ ] **Step 1: Write the failing test** (self-contained tagged schema — no dependency on the real schema being tagged)

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { entityAttributeReference } from '../../schemas/8/entity-attribute-reference';
import { collectEntityAttributeReferencesFromSchema } from '../collectEntityAttributeReferences';

const stageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('OrdinalBin'),
    subject: z.object({ entity: z.string(), type: z.string() }),
    prompts: z.array(
      z.object({
        variable: entityAttributeReference({ subject: 'stageSubject' }),
      }),
    ),
  }),
  z.object({
    type: z.literal('TieStrengthCensus'),
    subject: z.object({ entity: z.string(), type: z.string() }),
    prompts: z.array(
      z.object({
        createEdge: z.string(),
        edgeVariable: entityAttributeReference({
          subject: { sibling: 'createEdge', entity: 'edge' },
          requireType: ['ordinal'],
        }),
      }),
    ),
  }),
]);

const schema = z.object({
  stages: z.array(stageSchema),
  codebook: z.object({
    node: z.record(
      z.string(),
      z.object({
        variables: z.record(
          z.string(),
          z.object({
            validation: z
              .object({
                sameAs: entityAttributeReference({
                  subject: 'owningVariable',
                }).optional(),
              })
              .optional(),
          }),
        ),
      }),
    ),
  }),
});

describe('collectEntityAttributeReferencesFromSchema', () => {
  it('resolves a stageSubject reference with path and subject', () => {
    const value = {
      stages: [
        {
          type: 'OrdinalBin',
          subject: { entity: 'node', type: 'person' },
          prompts: [{ variable: 'age' }],
        },
      ],
      codebook: { node: {} },
    };
    expect(
      collectEntityAttributeReferencesFromSchema(schema, value),
    ).toContainEqual({
      path: ['stages', 0, 'prompts', 0, 'variable'],
      variableId: 'age',
      subject: { entity: 'node', type: 'person' },
      requireType: undefined,
    });
  });

  it('resolves a sibling-field subject and carries requireType', () => {
    const value = {
      stages: [
        {
          type: 'TieStrengthCensus',
          subject: { entity: 'node', type: 'person' },
          prompts: [{ createEdge: 'friend', edgeVariable: 'weight' }],
        },
      ],
      codebook: { node: {} },
    };
    expect(
      collectEntityAttributeReferencesFromSchema(schema, value),
    ).toContainEqual({
      path: ['stages', 0, 'prompts', 0, 'edgeVariable'],
      variableId: 'weight',
      subject: { entity: 'edge', type: 'friend' },
      requireType: ['ordinal'],
    });
  });

  it('resolves owningVariable subject from the codebook path', () => {
    const value = {
      stages: [],
      codebook: {
        node: {
          person: { variables: { end: { validation: { sameAs: 'start' } } } },
        },
      },
    };
    expect(
      collectEntityAttributeReferencesFromSchema(schema, value),
    ).toContainEqual({
      path: [
        'codebook',
        'node',
        'person',
        'variables',
        'end',
        'validation',
        'sameAs',
      ],
      variableId: 'start',
      subject: { entity: 'node', type: 'person' },
      requireType: undefined,
    });
  });

  it('leaves filterRule references with an undefined subject (validated elsewhere)', () => {
    const filterSchema = z.object({
      attribute: entityAttributeReference({ subject: 'filterRule' }),
    });
    expect(
      collectEntityAttributeReferencesFromSchema(filterSchema, {
        attribute: 'x',
      }),
    ).toEqual([
      {
        path: ['attribute'],
        variableId: 'x',
        subject: undefined,
        requireType: undefined,
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/protocol-validation && pnpm exec vitest run src/utils/__tests__/collectEntityAttributeReferences.test.ts`
Expected: FAIL — module `../collectEntityAttributeReferences` not found.

- [ ] **Step 3: Write the walker**

```ts
import { z } from 'zod';

import { CurrentProtocolSchema } from '../schemas';
import {
  type EntityAttributeReferenceDescriptor,
  getEntityAttributeReferenceDescriptor,
  type SubjectResolution,
} from '../schemas/8/entity-attribute-reference';
import type { StageSubject } from '../schemas/8/common';
import type { VariableType } from '../schemas/8/variables/types';

export type EntityAttributeReferenceHit = {
  path: (string | number)[];
  variableId: string;
  subject?: StageSubject;
  requireType?: readonly VariableType[];
};

type WalkContext = {
  stageSubject?: StageSubject;
  parent?: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Peel optional / nullable / default wrappers to reach the meaningful node.
const unwrap = (schema: z.ZodType): z.ZodType => {
  let current = schema;
  for (;;) {
    const type = current._zod.def.type;
    if (type === 'optional' || type === 'nullable' || type === 'default') {
      current = (current._zod.def as { innerType: z.ZodType }).innerType;
      continue;
    }
    return current;
  }
};

const stageSubjectOf = (
  value: Record<string, unknown>,
): StageSubject | undefined => {
  if (value.type === 'EgoForm') return { entity: 'ego' };
  const subject = value.subject;
  if (isRecord(subject) && typeof subject.entity === 'string') {
    return subject as StageSubject;
  }
  return undefined;
};

const resolveSubject = (
  resolution: SubjectResolution,
  path: (string | number)[],
  ctx: WalkContext,
): StageSubject | undefined => {
  if (resolution === 'ego') return { entity: 'ego' };
  if (resolution === 'stageSubject') return ctx.stageSubject;
  if (resolution === 'filterRule') return undefined; // validated by filter rule checks
  if (resolution === 'owningVariable') {
    const cbIndex = path.indexOf('codebook');
    if (cbIndex === -1) return undefined;
    const entity = path[cbIndex + 1];
    if (entity === 'ego') return { entity: 'ego' };
    if (entity === 'node' || entity === 'edge') {
      const type = path[cbIndex + 2];
      return typeof type === 'string' ? { entity, type } : undefined;
    }
    return undefined;
  }
  // { sibling, entity }
  const type = ctx.parent?.[resolution.sibling];
  return typeof type === 'string'
    ? { entity: resolution.entity, type }
    : undefined;
};

const walk = (
  schema: z.ZodType,
  value: unknown,
  path: (string | number)[],
  ctx: WalkContext,
): EntityAttributeReferenceHit[] => {
  if (value === undefined || value === null) return [];
  const node = unwrap(schema);
  const def = node._zod.def;

  switch (def.type) {
    case 'string': {
      const descriptor = getEntityAttributeReferenceDescriptor(node);
      if (!descriptor || typeof value !== 'string') return [];
      return [
        {
          path,
          variableId: value,
          subject: resolveSubject(descriptor.subject, path, ctx),
          requireType: descriptor.requireType,
        },
      ];
    }
    case 'object': {
      if (!isRecord(value)) return [];
      const shape = (def as { shape: Record<string, z.ZodType> }).shape;
      const childCtx: WalkContext = {
        stageSubject: stageSubjectOf(value) ?? ctx.stageSubject,
        parent: value,
      };
      return Object.keys(shape).flatMap((key) =>
        walk(shape[key], value[key], [...path, key], childCtx),
      );
    }
    case 'array': {
      if (!Array.isArray(value)) return [];
      const element = (def as { element: z.ZodType }).element;
      return value.flatMap((item, index) =>
        walk(element, item, [...path, index], ctx),
      );
    }
    case 'record': {
      if (!isRecord(value)) return [];
      const valueType = (def as { valueType: z.ZodType }).valueType;
      return Object.keys(value).flatMap((key) =>
        walk(valueType, value[key], [...path, key], ctx),
      );
    }
    case 'union': {
      const options = (def as { options: z.ZodType[] }).options;
      const match = options.find((option) => option.safeParse(value).success);
      return match ? walk(match, value, path, ctx) : [];
    }
    default:
      return [];
  }
};

export const collectEntityAttributeReferencesFromSchema = (
  schema: z.ZodType,
  value: unknown,
): EntityAttributeReferenceHit[] => walk(schema, value, [], {});

export const collectEntityAttributeReferences = (
  protocol: unknown,
): EntityAttributeReferenceHit[] =>
  collectEntityAttributeReferencesFromSchema(
    CurrentProtocolSchema as unknown as z.ZodType,
    protocol,
  );
```

> Notes for the implementer:
>
> - Use the typed `zod/v4/core` def types for the `_zod.def` casts (`core.$ZodObjectDef`, `core.$ZodArrayDef`, `core.$ZodRecordDef`, `core.$ZodUnionDef`, `core.$ZodOptionalDef`, etc.), mirroring `src/utils/zod-mock-extension.ts`, rather than the inline `{ shape: ... }` shapes shown above. The above is illustrative; follow the existing file's casting style.
> - Confirm `CurrentProtocolSchema`'s top-level `_zod.def.type` is `'object'` (its `.superRefine` checks attach to the object in Zod 4 and do not change the type). If it is wrapped, unwrap accordingly.
> - `union` covers the stage discriminated-union; `safeParse` selects the branch matching the instance.
> - The single `as unknown as z.ZodType` on the protocol schema is the one unavoidable boundary cast (the schema's inferred type is not `ZodType<unknown>`); keep it isolated in the wrapper.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/protocol-validation && pnpm exec vitest run src/utils/__tests__/collectEntityAttributeReferences.test.ts`
Expected: PASS (4 tests — walker mechanics verified against the self-contained tagged schema).

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-validation/src/utils/collectEntityAttributeReferences.ts packages/protocol-validation/src/utils/__tests__/collectEntityAttributeReferences.test.ts
git commit -m "feat(protocol-validation): entity-attribute reference extractor walker"
```

---

### Task 3: The presence + type validator

**Files:**

- Create: `packages/protocol-validation/src/utils/validateEntityAttributeReferences.ts`
- Test: `packages/protocol-validation/src/utils/__tests__/validateEntityAttributeReferences.test.ts`

**Interfaces:**

- Consumes: `collectEntityAttributeReferences`, `EntityAttributeReferenceHit` (Task 2); `variableExists`, `getVariablesForSubject` (`~/utils/validation-helpers`); `Codebook` type (`../schemas`).
- Produces:
  - `type ReferenceIssue = { code: 'custom'; message: string; path: (string | number)[] }`
  - `validateReferences(codebook: Codebook, hits: EntityAttributeReferenceHit[]): ReferenceIssue[]` — the pure presence/type logic, testable with hand-built hits.
  - `validateEntityAttributeReferences(protocol): ReferenceIssue[]` — thin wrapper: `validateReferences(protocol.codebook, collectEntityAttributeReferences(protocol))`.

> **Why split:** the same green-on-its-own requirement as Task 2 — `validateEntityAttributeReferences` can't produce hits until the real schema is tagged (Task 6). Splitting out the pure `validateReferences(codebook, hits)` lets this task test presence + type logic directly against hand-built hits. The protocol-level wrapper is exercised end-to-end in Task 6.

- [ ] **Step 1: Write the failing test** (pure logic, hand-built hits)

```ts
import { describe, expect, it } from 'vitest';
import { validateReferences } from '../validateEntityAttributeReferences';

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        age: { name: 'age', type: 'number' },
        rank: { name: 'rank', type: 'ordinal' },
      },
    },
  },
};

describe('validateReferences', () => {
  it('reports a reference to a non-existent variable', () => {
    const issues = validateReferences(codebook, [
      {
        path: ['stages', 0, 'prompts', 0, 'variable'],
        variableId: 'MISSING',
        subject: { entity: 'node', type: 'person' },
      },
    ]);
    expect(issues).toEqual([
      {
        code: 'custom',
        message: 'The variable "MISSING" does not exist in the codebook',
        path: ['stages', 0, 'prompts', 0, 'variable'],
      },
    ]);
  });

  it('reports a type-invalid reference when requireType excludes the variable type', () => {
    const issues = validateReferences(codebook, [
      {
        path: ['p'],
        variableId: 'age',
        subject: { entity: 'node', type: 'person' },
        requireType: ['ordinal'],
      },
    ]);
    expect(issues.some((i) => i.message.includes('ordinal'))).toBe(true);
  });

  it('accepts a present, type-valid reference', () => {
    const issues = validateReferences(codebook, [
      {
        path: ['p'],
        variableId: 'rank',
        subject: { entity: 'node', type: 'person' },
        requireType: ['ordinal'],
      },
    ]);
    expect(issues).toEqual([]);
  });

  it('skips hits with no resolved subject', () => {
    const issues = validateReferences(codebook, [
      { path: ['f'], variableId: 'whatever', subject: undefined },
    ]);
    expect(issues).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/protocol-validation && pnpm exec vitest run src/utils/__tests__/validateEntityAttributeReferences.test.ts`
Expected: FAIL — module `../validateEntityAttributeReferences` not found.

- [ ] **Step 3: Write the validator**

```ts
import {
  getVariablesForSubject,
  variableExists,
} from '~/utils/validation-helpers';

import type { Codebook, Protocol } from '../schemas';
import {
  collectEntityAttributeReferences,
  type EntityAttributeReferenceHit,
} from './collectEntityAttributeReferences';

export type ReferenceIssue = {
  code: 'custom';
  message: string;
  path: (string | number)[];
};

export const validateReferences = (
  codebook: Codebook,
  hits: EntityAttributeReferenceHit[],
): ReferenceIssue[] => {
  const issues: ReferenceIssue[] = [];

  for (const hit of hits) {
    if (!hit.subject) continue; // filterRule / unresolved: validated elsewhere

    if (!variableExists(codebook, hit.subject, hit.variableId)) {
      issues.push({
        code: 'custom',
        message: `The variable "${hit.variableId}" does not exist in the codebook`,
        path: hit.path,
      });
      continue;
    }

    if (hit.requireType) {
      const variables = getVariablesForSubject(codebook, hit.subject);
      const variable = variables[hit.variableId];
      if (variable && !hit.requireType.includes(variable.type)) {
        issues.push({
          code: 'custom',
          message: `The variable "${hit.variableId}" must be of type ${hit.requireType.join(' or ')}`,
          path: hit.path,
        });
      }
    }
  }

  return issues;
};

export const validateEntityAttributeReferences = (
  protocol: Protocol<8>,
): ReferenceIssue[] =>
  validateReferences(
    protocol.codebook,
    collectEntityAttributeReferences(protocol),
  );
```

> Note: confirm the `Codebook` and `Protocol<8>` import names from `../schemas`. Use the exported v8 types; do not use `any`. If `variableExists`/`getVariablesForSubject` expect a more specific codebook type, match their parameter type.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/protocol-validation && pnpm exec vitest run src/utils/__tests__/validateEntityAttributeReferences.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-validation/src/utils/validateEntityAttributeReferences.ts packages/protocol-validation/src/utils/__tests__/validateEntityAttributeReferences.test.ts
git commit -m "feat(protocol-validation): entity-attribute reference validator"
```

---

### Task 4: Tag the shared prompt/form reference fields

**Files (modify):**

- `packages/protocol-validation/src/schemas/8/common/forms.ts`
- `packages/protocol-validation/src/schemas/8/common/prompts.ts`

**Interfaces:** Consumes `entityAttributeReference` (Task 1); adds and consumes `asEntityAttributeReference` (Step 1 below). Replaces `z.string()` definitions with the helper, **preserving** any `.generateMock(...)` and `.optional()` wrappers (apply `.optional()` to the helper result; keep `.generateMock` chained after, with its generated value(s) wrapped per the Mock-wrapping rule in Global Constraints).

- [ ] **Step 1: Add the brand-boundary constructor.** In `packages/protocol-validation/src/schemas/8/entity-attribute-reference.ts` add:

```ts
export const asEntityAttributeReference = (
  id: string,
): EntityAttributeReference => id as EntityAttributeReference;
```

(If `string`→branded needs it, use `id as unknown as EntityAttributeReference`; pick whichever tsc accepts — this one `as` is the sanctioned brand boundary.) Add a test to `src/schemas/8/__tests__/entity-attribute-reference.test.ts`:

```ts
it('asEntityAttributeReference returns the id unchanged at runtime', () => {
  expect(asEntityAttributeReference('var-1')).toBe('var-1');
});
```

Run: `cd packages/protocol-validation && pnpm exec vitest run src/schemas/8/__tests__/entity-attribute-reference.test.ts` — expect PASS.

Apply these exact substitutions (field → descriptor). Each is `z.string()...` → `entityAttributeReference({ ... })...` keeping existing `.optional`; for fields that keep a `.generateMock`, wrap the generated id(s) with `asEntityAttributeReference(...)` (e.g. `.generateMock(() => getNodeVariableId())` → `.generateMock(() => asEntityAttributeReference(getNodeVariableId()))`):

- `common/forms.ts` `FormFieldSchema.variable` → `entityAttributeReference({ subject: 'stageSubject' })` (keep `.generateMock(() => getNodeVariableId(0))`).
- `common/prompts.ts`:
  - `sociogramPromptSchema.layout.layoutVariable` → `{ subject: 'stageSubject' }`
  - `sociogramPromptSchema.highlight.variable` → `{ subject: 'stageSubject' }` (keep `.optional()`)
  - `tieStrengthCensusPromptSchema.edgeVariable` → `{ subject: { sibling: 'createEdge', entity: 'edge' }, requireType: ['ordinal'] }`
  - `ordinalBinPromptSchema.variable` → `{ subject: 'stageSubject' }`
  - `categoricalBinPromptSchema.variable` → `{ subject: 'stageSubject' }`
  - `categoricalBinPromptSchema.otherVariable` → `{ subject: 'stageSubject' }` (keep `.optional()`)
  - `geospatialPromptSchema.variable` → `{ subject: 'stageSubject' }`
  - `familyPedigreeNominationPromptSchema.variable` → `{ subject: 'stageSubject' }`

- [ ] **Step 2: Confirm `AdditionalAttributesSchema.variable` semantics.** Read `common/prompts.ts` `AdditionalAttributesSchema` and `schema.ts` lines ~277–296 (the `additionalAttributes` existence check). If that check passes `attr.variable` to `variableExists` (i.e., it is treated as an id against `stage.subject`), tag it: `variable: entityAttributeReference({ subject: 'stageSubject' })`. If it is genuinely a display _name_ not existence-checked, leave it untagged and record the decision in the commit message. (Resolves the inventory's `VariableNameSchema` ambiguity.)

- [ ] **Step 3: Apply the substitutions above.** Add `import { entityAttributeReference, asEntityAttributeReference } from '../entity-attribute-reference';` to each file (import only `asEntityAttributeReference` where a `.generateMock` is wrapped). Apply the Mock-wrapping rule (Global Constraints) to every retained `.generateMock`.

- [ ] **Step 4: Typecheck the package**

Run: `pnpm turbo run typecheck --filter=@codaco/protocol-validation`
Expected: PASS (no `TS2769` on the mocks — they now return branded values via `asEntityAttributeReference`).

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-validation/src/schemas/8/entity-attribute-reference.ts packages/protocol-validation/src/schemas/8/__tests__/entity-attribute-reference.test.ts packages/protocol-validation/src/schemas/8/common/forms.ts packages/protocol-validation/src/schemas/8/common/prompts.ts
git commit -m "feat(protocol-validation): tag shared prompt/form attribute references"
```

---

### Task 5: Tag the stage-specific reference fields

**Files (modify):**

- `packages/protocol-validation/src/schemas/8/stages/family-pedigree.ts`
- `packages/protocol-validation/src/schemas/8/stages/name-generator-quick-add.ts`
- `packages/protocol-validation/src/schemas/8/stages/name-generator-roster.ts`
- `packages/protocol-validation/src/schemas/8/stages/narrative.ts`

**Interfaces:** Consumes `entityAttributeReference`. Import it into each file.

Substitutions (entity-attribute references only — leave `EdgeConfigSchema.type` and any entity-type field as plain `z.string()`):

- `family-pedigree.ts` `NodeConfigSchema`:
  - `nodeLabelVariable` → `{ subject: { sibling: 'type', entity: 'node' } }` _(see Step 1 — confirm the node-type sibling field name on `NodeConfigSchema`; if there is no node-type field, use `{ subject: 'stageSubject' }`)_
  - `egoVariable` → `{ subject: 'ego' }`
  - `biologicalSexVariable` → node subject (same resolution as `nodeLabelVariable`)
  - `relationshipVariable` → node subject (same as above)
- `family-pedigree.ts` `EdgeConfigSchema` (subject = `{ sibling: 'type', entity: 'edge' }`, since `EdgeConfigSchema.type` holds the edge type):
  - `relationshipTypeVariable`, `isActiveVariable`, `isGestationalCarrierVariable`
- `name-generator-quick-add.ts` `quickAdd` → `{ subject: 'stageSubject' }`
- `name-generator-roster.ts`:
  - `cardOptions.additionalProperties[].variable` → `{ subject: 'stageSubject' }`
  - `sortOptions.sortableProperties[].variable` → `{ subject: 'stageSubject' }` _(note: this was absent from the old `paths.variables`; tagging it is a deliberate coverage improvement)_
  - `searchOptions.matchProperties[]` → `z.array(entityAttributeReference({ subject: 'stageSubject' }))`
- `narrative.ts` `presets[]`:
  - `layoutVariable` → `{ subject: 'stageSubject' }`
  - `groupVariable` → `{ subject: 'stageSubject' }` (keep `.optional()`)
  - `highlight` → `z.array(entityAttributeReference({ subject: 'stageSubject' })).optional()`

- [ ] **Step 1: Confirm FamilyPedigree node-subject resolution.** Read `NodeConfigSchema` in `family-pedigree.ts`. Determine which sibling field (if any) holds the node type. If `NodeConfigSchema` has a `type` field for the node, use `{ subject: { sibling: 'type', entity: 'node' } }`; otherwise the FamilyPedigree stage's `subject` is the node — use `{ subject: 'stageSubject' }`. Pick one consistently for the four node-config fields and note the choice.

- [ ] **Step 2: Apply the substitutions.** Add the import to each file.

- [ ] **Step 3: Typecheck**

Run: `pnpm turbo run typecheck --filter=@codaco/protocol-validation`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/protocol-validation/src/schemas/8/stages/family-pedigree.ts packages/protocol-validation/src/schemas/8/stages/name-generator-quick-add.ts packages/protocol-validation/src/schemas/8/stages/name-generator-roster.ts packages/protocol-validation/src/schemas/8/stages/narrative.ts
git commit -m "feat(protocol-validation): tag stage-specific attribute references"
```

---

### Task 6: Tag validation cross-refs and filter/sort references; green the extractor + validator

**Files (modify):**

- `packages/protocol-validation/src/schemas/8/variables/validation.ts`
- `packages/protocol-validation/src/schemas/8/filters/filter.ts`
- `packages/protocol-validation/src/schemas/8/filters/sort.ts`

Substitutions:

- `validation.ts` — each of `sameAs`, `differentFrom` → `entityAttributeReference({ subject: 'owningVariable' }).optional()`; each of `greaterThanVariable`, `lessThanVariable`, `greaterThanOrEqualToVariable`, `lessThanOrEqualToVariable` → `entityAttributeReference({ subject: 'owningVariable', requireType: ['number', 'datetime', 'scalar'] }).optional()`.
  - Confirm the exact comparison-compatible types against `components/Validations/options.ts` (`number`/`datetime`/`scalar`). Keep `VARIABLE_REFERENCE_VALIDATIONS` for now (Task 11 decides its fate).
- `filter.ts` `attributeLevelOptionsSchema.attribute` → `entityAttributeReference({ subject: 'filterRule' })` (keep `.generateMock`). `'filterRule'` marks it for usage extraction but defers validation to the existing filter-rule checks.
- `sort.ts` `SortRuleSchema.property` → `entityAttributeReference({ subject: 'stageSubject' })`.

- [ ] **Step 1: Apply the substitutions.** Add the `entityAttributeReference` import to each file.

- [ ] **Step 2: Write the real-schema integration test** (the assertions deferred from Tasks 2 & 3 — now that the fields are tagged, exercise the protocol-bound `collectEntityAttributeReferences` and `validateEntityAttributeReferences` end-to-end).

Create `packages/protocol-validation/src/utils/__tests__/entity-attribute-reference-integration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { collectEntityAttributeReferences } from '../collectEntityAttributeReferences';
import { validateEntityAttributeReferences } from '../validateEntityAttributeReferences';

const protocol = {
  schemaVersion: 8,
  name: 'p',
  stages: [
    {
      id: 's1',
      type: 'OrdinalBin',
      label: 'bin',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', variable: 'age', bucketSortOrder: [] }],
    },
  ],
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: {
          age: { name: 'age', type: 'number' },
          end: {
            name: 'end',
            type: 'datetime',
            validation: { greaterThanOrEqualToVariable: 'start' },
          },
          start: { name: 'start', type: 'datetime' },
        },
      },
    },
  },
};

describe('entity-attribute references against the real v8 schema', () => {
  it('extracts a tagged prompt reference with its resolved subject', () => {
    const hits = collectEntityAttributeReferences(protocol);
    expect(hits).toContainEqual({
      path: ['stages', 0, 'prompts', 0, 'variable'],
      variableId: 'age',
      subject: { entity: 'node', type: 'person' },
      requireType: undefined,
    });
  });

  it('extracts a validation cross-reference with the owning-variable subject', () => {
    const hits = collectEntityAttributeReferences(protocol);
    const ref = hits.find((h) => h.variableId === 'start');
    expect(ref?.subject).toEqual({ entity: 'node', type: 'person' });
  });

  it('accepts a valid protocol and flags a removed referenced variable', () => {
    expect(validateEntityAttributeReferences(protocol)).toEqual([]);
    const broken = {
      ...protocol,
      codebook: {
        node: {
          person: {
            ...protocol.codebook.node.person,
            variables: {
              age: protocol.codebook.node.person.variables.age,
              end: protocol.codebook.node.person.variables.end,
            },
          },
        },
      },
    };
    const issues = validateEntityAttributeReferences(broken);
    expect(issues).toContainEqual({
      code: 'custom',
      message: 'The variable "start" does not exist in the codebook',
      path: [
        'codebook',
        'node',
        'person',
        'variables',
        'end',
        'validation',
        'greaterThanOrEqualToVariable',
      ],
    });
  });
});
```

Run: `cd packages/protocol-validation && pnpm exec vitest run src/utils/__tests__/entity-attribute-reference-integration.test.ts`
Expected: PASS. (If the extractor finds nothing, a tag from Tasks 4–6 is missing — fix the tag, not the test.)

- [ ] **Step 3: Re-run the Task 2 and Task 3 unit suites** to confirm tagging didn't regress them.

Run: `cd packages/protocol-validation && pnpm exec vitest run src/utils/__tests__/collectEntityAttributeReferences.test.ts src/utils/__tests__/validateEntityAttributeReferences.test.ts`
Expected: PASS (unchanged — they use self-contained schemas).

- [ ] **Step 4: Export the extractor from the package root.** Architect (Task 9) imports `collectEntityAttributeReferences` from `@codaco/protocol-validation`, so it must be on the public surface. Add it to `packages/protocol-validation/src/index.ts` following that file's explicit import-then-export pattern (it does NOT use `export *` for `utils/`):

```ts
import { collectEntityAttributeReferences } from './utils/collectEntityAttributeReferences';
// ...add `collectEntityAttributeReferences` (and `type EntityAttributeReferenceHit`) to the existing export block.
```

Do not export `collectEntityAttributeReferencesFromSchema` or the validator — those stay package-internal (relative imports). (It will read as unused to knip until Task 9 lands; the knip gate runs in Task 11, after architect consumes it.)

- [ ] **Step 5: Rebuild package + typecheck**

Run: `pnpm turbo run build typecheck --filter=@codaco/protocol-validation`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/protocol-validation/src/schemas/8/variables/validation.ts packages/protocol-validation/src/schemas/8/filters/filter.ts packages/protocol-validation/src/schemas/8/filters/sort.ts packages/protocol-validation/src/utils/__tests__/entity-attribute-reference-integration.test.ts packages/protocol-validation/src/index.ts
git commit -m "feat(protocol-validation): tag validation, filter, and sort attribute references"
```

---

### Task 7: Coverage guard test

**Files:**

- Test: `packages/protocol-validation/src/utils/__tests__/entity-attribute-reference-coverage.test.ts`

Guards against a tagged field that the walker can never reach (e.g. a new wrapper the `unwrap`/`switch` doesn't handle), and documents the full tagged surface.

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CurrentProtocolSchema } from '../../schemas';
import { getEntityAttributeReferenceDescriptor } from '../../schemas/8/entity-attribute-reference';

// Count every meta-tagged node reachable by the same traversal the extractor uses.
const countTagged = (
  schema: z.ZodType,
  seen = new Set<z.ZodType>(),
): number => {
  if (seen.has(schema)) return 0;
  seen.add(schema);
  const def = schema._zod.def as Record<string, unknown>;
  let count = getEntityAttributeReferenceDescriptor(schema) ? 1 : 0;
  if (
    def.type === 'optional' ||
    def.type === 'nullable' ||
    def.type === 'default'
  ) {
    count += countTagged(def.innerType as z.ZodType, seen);
  } else if (def.type === 'object') {
    for (const child of Object.values(
      (def as { shape: Record<string, z.ZodType> }).shape,
    )) {
      count += countTagged(child, seen);
    }
  } else if (def.type === 'array') {
    count += countTagged(def.element as z.ZodType, seen);
  } else if (def.type === 'record') {
    count += countTagged(def.valueType as z.ZodType, seen);
  } else if (def.type === 'union') {
    for (const opt of def.options as z.ZodType[])
      count += countTagged(opt, seen);
  }
  return count;
};

describe('entity-attribute reference coverage', () => {
  it('has tagged the expected number of reference fields', () => {
    // Update this number deliberately when adding/removing a tagged field.
    expect(countTagged(CurrentProtocolSchema as unknown as z.ZodType)).toBe(
      EXPECTED_TAGGED_FIELD_COUNT,
    );
  });
});
```

- [ ] **Step 2: Determine the count.** Replace `EXPECTED_TAGGED_FIELD_COUNT` with the actual number printed by a temporary `console.log(countTagged(...))`; verify it equals the number of fields tagged in Tasks 4–6 (expected in the high teens). Commit the literal.

- [ ] **Step 3: Run**

Run: `cd packages/protocol-validation && pnpm exec vitest run src/utils/__tests__/entity-attribute-reference-coverage.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/protocol-validation/src/utils/__tests__/entity-attribute-reference-coverage.test.ts
git commit -m "test(protocol-validation): entity-attribute reference coverage guard"
```

---

### Task 8: Migrate `superRefine` to the validator

**Files (modify):**

- `packages/protocol-validation/src/schemas/8/schema.ts`
- `packages/protocol-validation/src/schemas/8/__tests__/schema8-superrefine-validation.test.ts`

**Interfaces:** Consumes `validateEntityAttributeReferences` (Task 3).

- [ ] **Step 1: Replace the 8 existence checks.** Remove the inline `variableExists` checks for: form fields, `prompt.variable`, `otherVariable`, `edgeVariable` (existence + the ordinal type check), `layoutVariable`, `additionalAttributes[]`, and the validation cross-ref loop (the `checkCrossRef` block). Keep `createEdge` existence (entity-type, out of scope) and the filter-rule checks (`filterRuleAttributeExists`, operator/value-type). At the top of the `superRefine` body add:

```ts
import { validateEntityAttributeReferences } from '~/utils/validateEntityAttributeReferences';
// ...inside superRefine, after `const protocol = ...`:
for (const issue of validateEntityAttributeReferences(protocol)) {
  ctx.addIssue(issue);
}
```

- [ ] **Step 2: Update the superrefine test expectations.** Run the suite, then update assertions whose messages changed to the unified `The variable "<id>" does not exist in the codebook` (and the `must be of type ...` message for the ordinal/edgeVariable case). Do not change the issue _paths_ — those are preserved by the extractor.

Run: `cd packages/protocol-validation && pnpm exec vitest run src/schemas/8/__tests__/schema8-superrefine-validation.test.ts`
Expected after updates: PASS (was 69 tests; count unchanged unless a duplicate check is dropped).

- [ ] **Step 3: Validate against the real silos protocol.** Add a focused regression test that loads a protocol where a variable is referenced only by `greaterThanOrEqualToVariable` and asserts the schema accepts it (no false positive) and rejects it when the referenced variable is removed. (Reuses the PR #686 scenario at the schema level.)

- [ ] **Step 4: Full package test + typecheck**

Run: `pnpm turbo run build typecheck test --filter=@codaco/protocol-validation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-validation/src/schemas/8/schema.ts packages/protocol-validation/src/schemas/8/__tests__/schema8-superrefine-validation.test.ts
git commit -m "refactor(protocol-validation): derive attribute-existence checks from the extractor"
```

---

## Part B — `apps/architect-web` consumer migration

> Depends on Part A being built: run `pnpm turbo run build --filter=@codaco/protocol-validation` first so `collectEntityAttributeReferences` is in the package dist.

### Task 9: Migrate architect usage detection AND where-used to the extractor

> **Merged (during execution):** the usage index and the where-used label are coupled through the index key format. The old `collectPaths` produced bracketed string keys (`stages[0].prompts[0].variable`) that the where-used regex parses; the extractor yields path arrays. That bracket format cannot be faithfully reconstructed from a flat path, so the index change and the where-used rewrite must land together. Brand churn was measured as **zero** (architect typechecks clean against the branded package), so no brand fixes are needed here.

**Files (modify):**

- `apps/architect-web/src/selectors/indexes.ts`
- `apps/architect-web/src/selectors/codebook/isUsed.ts` (likely unchanged — verify)
- `apps/architect-web/src/components/Codebook/helpers.ts`
- Tests: `apps/architect-web/src/selectors/__tests__/indexes.test.ts`, `apps/architect-web/src/components/Codebook/__tests__/helpers.test.tsx`

**Interfaces:** Consumes `collectEntityAttributeReferences` (and `type EntityAttributeReferenceHit`) from `@codaco/protocol-validation`.

- [ ] **Step 1: Reimplement `getVariableIndex` from the extractor.** Replace `collectPaths(paths.variables, protocol)`:

```ts
import { collectEntityAttributeReferences } from '@codaco/protocol-validation';

const getVariableIndex = createSelector(getProtocol, (protocol) => {
  if (!protocol) return {};
  const index: Record<string, string> = {};
  for (const hit of collectEntityAttributeReferences(protocol)) {
    index[hit.path.join('.')] = hit.variableId; // dotted-array key format
  }
  return index;
});
```

Then DELETE the `variables` array from `paths` and the `variableReferenceValidationPaths` block (PR #686). Keep `paths.edges`/`nodes`/`assets` and `getEdgeIndex`/`getNodeIndex`/`getAssetIndex`. First `grep` for other consumers of `paths.variables` — there should be none beyond `getVariableIndex`; if there are, stop and report. `makeGetIsUsed` (isUsed.ts) consumes `Object.values(variableIndex)` only — unaffected by the key format change; verify it still typechecks and leave it otherwise unchanged.

- [ ] **Step 2: Rewrite `getUsageAsStageMeta` (helpers.ts) for the new key format.** The keys are now dotted arrays, not bracketed. Delete `codebookVariableReferenceRegex` and `getStageIndexFromPath`/`getCodebookVariableIndexFromValidationPath` (the regex parsers). Derive context structurally from each usage path key (`key.split('.')`):
  - stage usage: when `segments[0] === 'stages'`, the stage index is `segments[1]` → look up `stageMetaByIndex[Number(segments[1])]` for `{ label, id }`.
  - codebook-validation usage: when `segments[0] === 'codebook'`, the OWNING variable id is the segment immediately after `'variables'` → look up its name in `variableMetaByIndex` and emit `{ label: \`Used as validation for "<name>"\` }` (same label the regex produced).
  - Preserve the existing de-dup and `sortByLabel` behavior and the `UsageMeta` shape (`{ label, id? }`).

- [ ] **Step 3: Tests.**
  - In `indexes.test.ts`: keep/adapt the existing cross-variable coverage tests; assert the extractor-built index contains a variable referenced only via a comparison validation; AND a **stage-ref against the real schema** — load a valid v8 protocol (a real fixture from `packages/protocol-validation/src/__tests__/` or architect's own fixtures) and assert a known stage prompt reference id appears in the index (this closes the Task 6 deferral: confirms stage refs extract from a real, schema-valid protocol). If a `getVariableIndex` snapshot exists, regenerate it only after eyeballing the diff (keys change format; values must be the same set).
  - In `helpers.test.tsx`: the PR #686 parametrised six-rule "Used as validation for" test must stay green via the rewritten `getUsageAsStageMeta`; add/keep a stage-usage case asserting a stage link is produced.

- [ ] **Step 4: Verify.**

Run: `pnpm turbo run build --filter=@codaco/protocol-validation` then `cd apps/architect-web && pnpm exec vitest run src/selectors/__tests__/indexes.test.ts src/selectors/codebook src/components/Codebook/__tests__/helpers.test.tsx` then `pnpm turbo run typecheck --filter=@codaco/architect-web`.
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/architect-web/src/selectors/indexes.ts apps/architect-web/src/selectors/codebook/isUsed.ts apps/architect-web/src/components/Codebook/helpers.ts apps/architect-web/src/selectors/__tests__/indexes.test.ts apps/architect-web/src/components/Codebook/__tests__/helpers.test.tsx
git commit -m "refactor(architect-web): derive variable usage and where-used from the extractor"
```

---

### Task 10: Dead-const cleanup and final verification

**Files (modify):** `apps/architect-web/src/components/Validations/options.ts` and/or `packages/protocol-validation/src/schemas/8/variables/validation.ts` as needed.

> Brand churn is zero (measured: architect typechecks clean against the branded package), so there is no brand-fix step.

- [ ] **Step 1: Resolve `VARIABLE_REFERENCE_VALIDATIONS`.** `grep -rn "VARIABLE_REFERENCE_VALIDATIONS" .`. The `indexes.ts` path-generation consumer is gone (Task 9). If `options.ts` `isValidationWithListValue` is the only remaining consumer, that is a distinct UI concern (which validations render a list input) — keep the const. If nothing consumes it, remove the export from `validation.ts`.

- [ ] **Step 2: Full verification.**

Run: `pnpm turbo run build typecheck test --filter=@codaco/protocol-validation --filter=@codaco/architect-web` then `pnpm knip`.
Expected: all PASS; knip clean (the package-root `collectEntityAttributeReferences` export is now consumed by architect, so it is no longer flagged unused).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: resolve VARIABLE_REFERENCE_VALIDATIONS after extractor migration"
```

---

## Self-Review

**Spec coverage:**

- Helper (brand + meta descriptor) → Task 1. ✓
- Subject resolution (4 strategies + `filterRule`) → Tasks 1–2 (types + resolver). ✓
- Extractor → Task 2. ✓
- Validator (presence + `requireType`) → Task 3. ✓
- Tag all reference fields → Tasks 4–6 (with the inventory's exclusions: ShapeMapping and entity-type fields not tagged). ✓
- Migrate schema existence checks → Task 8. ✓
- Migrate architect usage index → Task 9; where-used regex deletion → Task 10. ✓
- Brand churn + dead-const cleanup → Task 11. ✓
- Escape hatch (filter rules) → `subject: 'filterRule'` (Task 6) + validator skip (Task 3) + retained filter checks (Task 8). ✓
- Coverage guard → Task 7. ✓

**Placeholder scan:** Two deliberate confirm-then-apply steps remain (AdditionalAttributesSchema id-vs-name in Task 4; FamilyPedigree node-subject sibling in Task 5) — these are concrete verification actions with a defined decision and both outcomes specified, not open TODOs. `EXPECTED_TAGGED_FIELD_COUNT` is computed and committed in Task 7 Step 2.

**Type consistency:** `EntityAttributeReferenceHit`, `EntityAttributeReferenceDescriptor`, `SubjectResolution`, `getEntityAttributeReferenceDescriptor`, `collectEntityAttributeReferences`, `validateEntityAttributeReferences` are used with consistent signatures across Tasks 1–3 and consumed unchanged in 8–10.

**Open risk to watch during execution:** brand churn (Task 11 Step 1) is the one empirically-bounded task — its completion gate is `pnpm turbo run typecheck` passing. If the error surface is large, pause and report rather than mass-editing.
