# Attribute-Writer Exclusivity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify every attribute-writing schema reference as `validatedAttribute` or `unvalidatedAttribute`, forbid any variable from holding both roles via Architect editor gates and a non-destructive protocol-wide alert, and rewire the two hard-coded-validation writers (CategoricalBin other-input, NameGenerator quick-add) into genuine validated writers.

**Architecture:** Static `usage` tags on `entityAttributeReference` descriptors flow through the existing collector into a pure `findVariableRoleConflicts(protocol)` export; Architect derives a memoised role map from the same hits for picker filtering (two shared chokepoints plus per-editor sites), save-time gates piggyback on the established `onBeforeSave`/`editorValidate` seams, and pre-existing conflicts surface through the `selectors/issues.ts` → timeline-banner → nav-badge pattern. No schema rejection anywhere.

**Tech Stack:** TypeScript, Zod v4, Vitest, redux/redux-form (Architect), React (interview), Playwright (Architect e2e), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-07-27-attribute-writer-exclusivity-design.md` — read it first.

## Global Constraints

- **PRECONDITION:** PR #1107 (validation contradictions) must be merged and this branch updated: `git merge origin/main` before Task 1, then verify `apps/architect/src/components/Validations/contradictions.ts` exports `makeFieldEditorValidate` and `findDraftContradictions` (Tasks 8–9 extend them). If the merge brings conflicts or those exports are missing, STOP and report.
- No `any`; no `as` assertions to silence type errors (`as const` fine); narrow untyped values with runtime guards. No lint suppressions — report instead. NEVER run `git stash`.
- No barrel files; never re-export; only export what another module imports; run `pnpm knip` before the PR.
- Explicit `.ts` extensions on relative imports inside `packages/protocol-validation`.
- Comment only unusual or complex code. The husky hook formats staged files; run `eval "$(fnm env)"` before `git commit`. Never run root `pnpm lint:fix`.
- **The rule:** no `(subject entity, subject type, variable id)` may have both a `validatedAttribute` and an `unvalidatedAttribute` hit. Same-class sharing stays legal. Read-only references stay untagged.
- **No schema rejection, no export block** — enforcement is editor gates + alert only.
- **Rewires have no runtime fallbacks**: a rule-less quickAdd/otherVariable variable is genuinely optional. The v7→v8 migration sets `required: true` on otherVariable and quickAdd targets **unless already `true`** (an explicit `required: false` was inert under the old hard-coded behaviour and is overridden).
- Currently-selected values always stay offered in filtered pickers.
- Test commands: `pnpm --filter @codaco/protocol-validation test`, `pnpm --filter @codaco/interview exec vitest run --project units <file>`, `pnpm --filter @codaco/architect test`. Changesets: three files, separate lanes — protocol-validation minor, interview minor, architect patch.

---

### Task 1: `usage` tags on every writer site

**Files:**

- Modify: `packages/protocol-validation/src/schemas/8/entity-attribute-reference.ts:17-20`
- Modify: `packages/protocol-validation/src/utils/collectEntityAttributeReferences.ts:12-17` and `:218-231`
- Modify: the schema files listed in the table below
- Test: `packages/protocol-validation/src/schemas/8/__tests__/usage-tags.test.ts` (new)

**Interfaces:**

- Produces: `type AttributeWriterUsage = 'validatedAttribute' | 'unvalidatedAttribute'` (exported from `entity-attribute-reference.ts`); `EntityAttributeReferenceDescriptor.usage?: AttributeWriterUsage`; `EntityAttributeReferenceHit.usage?: AttributeWriterUsage`.

- [ ] **Step 1: Write the failing test**

Create `packages/protocol-validation/src/schemas/8/__tests__/usage-tags.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { collectEntityAttributeReferences } from '../../../utils/collectEntityAttributeReferences.ts';
import { createBaseProtocol } from '../../../utils/test-utils.ts';

const hitsFor = (protocol: unknown) =>
  collectEntityAttributeReferences(protocol);

describe('attribute-writer usage tags', () => {
  it('tags form fields as validatedAttribute', () => {
    const protocol = createBaseProtocol();
    const formHits = hitsFor(protocol).filter(
      (hit) =>
        hit.path.includes('fields') &&
        hit.path[hit.path.length - 1] === 'variable',
    );
    expect(formHits.length).toBeGreaterThan(0);
    for (const hit of formHits) {
      expect(hit.usage).toBe('validatedAttribute');
    }
  });

  it('tags a CategoricalBin prompt variable as unvalidatedAttribute and its otherVariable as validatedAttribute', () => {
    const protocol = {
      ...createBaseProtocol(),
      stages: [
        {
          id: 'cb1',
          type: 'CategoricalBin',
          label: 'Bin',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            {
              id: 'p1',
              text: 'Sort',
              variable: 'category',
              otherVariable: 'name',
              otherVariablePrompt: 'What?',
              otherOptionLabel: 'Other',
            },
          ],
        },
      ],
    };
    const hits = hitsFor(protocol);
    const promptVariable = hits.find(
      (hit) => hit.path[hit.path.length - 1] === 'variable' && hit.path.includes('prompts'),
    );
    const otherVariable = hits.find(
      (hit) => hit.path[hit.path.length - 1] === 'otherVariable',
    );
    expect(promptVariable?.usage).toBe('unvalidatedAttribute');
    expect(otherVariable?.usage).toBe('validatedAttribute');
    // The narrowed duplicate declarations must not produce double hits.
    expect(
      hits.filter((hit) => hit.path.join('.') === promptVariable?.path.join('.')),
    ).toHaveLength(1);
  });

  it('leaves read-only references untagged', () => {
    const protocol = createBaseProtocol();
    const validationRefs = hitsFor(protocol).filter((hit) =>
      hit.path.includes('validation'),
    );
    for (const hit of validationRefs) {
      expect(hit.usage).toBeUndefined();
    }
  });
});
```

(If `createBaseProtocol()`'s `person` node lacks a `category` categorical or `name` text variable, add them in the test via the merge-not-replace idiom used by `validation-contradictions.test.ts`'s `protocolWith` helper.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8/__tests__/usage-tags.test.ts`
Expected: FAIL — `hit.usage` is undefined everywhere.

- [ ] **Step 3: Add the descriptor field and hit pass-through**

In `entity-attribute-reference.ts`, extend the descriptor (lines 17–20):

```ts
export type AttributeWriterUsage =
  | 'validatedAttribute'
  | 'unvalidatedAttribute';

export type EntityAttributeReferenceDescriptor = {
  subject: SubjectResolution;
  requireType?: readonly VariableType[];
  /**
   * How the interview writes through this reference: via the form system
   * (codebook validation applies) or via a direct dispatch (it does not).
   * Absent on read-only references. Static schema metadata — never stored in
   * protocols; the collector's hits inherit it from the matching site.
   */
  usage?: AttributeWriterUsage;
};
```

In `collectEntityAttributeReferences.ts`, add to the hit type (lines 12–17) `usage?: AttributeWriterUsage;` (type-import `AttributeWriterUsage` from the schemas module), and in the string case (lines 218–231) add `usage: attributeDescriptor.usage,` to the object literal.

- [ ] **Step 4: Tag every writer site**

Add `usage: 'validatedAttribute'` or `usage: 'unvalidatedAttribute'` to the descriptor argument at each site. The complete, verified table (file:line references are pre-#1107-merge positions — locate by the surrounding key if drifted):

| File | Line | Site | Tag |
| --- | --- | --- | --- |
| `common/forms.ts` | 10 | `FormFieldSchema.variable` | `validatedAttribute` |
| `stages/network-composer.ts` | 42 | `ComposerFormFieldSchema.variable` | `validatedAttribute` |
| `stages/name-generator-quick-add.ts` | 15 | `quickAdd` | `validatedAttribute` (rewired in Task 5) |
| `common/prompts.ts` | 173 AND its narrowed duplicate at 226 | CategoricalBin `otherVariable` | `validatedAttribute` (rewired in Task 4) |
| `common/prompts.ts` | 41 | `additionalAttributes[].variable` | `unvalidatedAttribute` |
| `common/prompts.ts` | 58 AND narrowed duplicates at 77, 81 | Sociogram `highlight.variable` | `unvalidatedAttribute` |
| `common/prompts.ts` | 93 | Sociogram `layout.layoutVariable` | `unvalidatedAttribute` |
| `common/prompts.ts` | 126 | TieStrengthCensus `edgeVariable` | `unvalidatedAttribute` |
| `common/prompts.ts` | 150 | OrdinalBin `variable` | `unvalidatedAttribute` |
| `common/prompts.ts` | 157 AND narrowed duplicate near 225 | CategoricalBin `variable` | `unvalidatedAttribute` |
| `common/prompts.ts` | 249 | Geospatial `variable` | `unvalidatedAttribute` |
| `common/prompts.ts` | 253 | FamilyPedigree `nominationPrompts[].variable` | `unvalidatedAttribute` |
| `stages/network-composer.ts` | 65 | composer `quickAdd` | `unvalidatedAttribute` |
| `stages/network-composer.ts` | 67 | composer `layoutVariable` | `unvalidatedAttribute` |
| `stages/network-composer.ts` | 74 | `convexHullVariable` | `unvalidatedAttribute` |
| `stages/family-pedigree.ts` | 41, 45, 49, 53 | `nodeConfig.{nodeLabelVariable, egoVariable, relationshipVariable, biologicalSexVariable}` | `unvalidatedAttribute` |
| `stages/family-pedigree.ts` | 64, 68, 72, 76 | `edgeConfig.{relationshipTypeVariable, isActiveVariable, isGestationalCarrierVariable, gameteRoleVariable}` | `unvalidatedAttribute` |

**Do NOT tag** (read-only): `variables/validation.ts` (all six reference rules), `codebook/definitions.ts` shape-mapping variables, `filters/filter.ts:94`, `stages/narrative.ts:23,26,37`, `stages/narrative-pedigree.ts:22`.

CRITICAL: every narrowed duplicate declaration must carry the identical tag to its base declaration — the collector de-dupes hits on `JSON.stringify(hit)`, and a mismatch produces spurious double hits (the test's single-hit assertion pins this).

- [ ] **Step 5: Run tests, full suite, commit**

Run: `pnpm --filter @codaco/protocol-validation test`
Expected: usage-tags tests PASS; full suite unchanged (the field is additive).

```bash
eval "$(fnm env)" && git add -A packages/protocol-validation/src && git commit -m "feat(protocol-validation): classify attribute-writer references as validated/unvalidated"
```

---

### Task 2: `findVariableRoleConflicts`

**Files:**

- Create: `packages/protocol-validation/src/utils/findVariableRoleConflicts.ts`
- Modify: `packages/protocol-validation/src/index.ts` (export)
- Test: `packages/protocol-validation/src/utils/__tests__/findVariableRoleConflicts.test.ts`

**Interfaces:**

- Consumes: `collectEntityAttributeReferences`, `EntityAttributeReferenceHit` (with Task 1's `usage`).
- Produces (exported from the package root; Architect Tasks 7–10 import them):

```ts
export type VariableRoleHit = {
  path: (string | number)[];
  usage: AttributeWriterUsage;
  stageIndex: number | undefined;
};

export type VariableRoleConflict = {
  subject: { entity: 'node' | 'edge' | 'ego'; type?: string };
  variableId: string;
  variableName: string;
  validated: VariableRoleHit[];
  unvalidated: VariableRoleHit[];
};

export function findVariableRoleConflicts(protocol: unknown): VariableRoleConflict[];
```

- [ ] **Step 1: Write the failing test**

Create the test file:

```ts
import { describe, expect, it } from 'vitest';

import { createBaseProtocol } from '../test-utils.ts';
import { findVariableRoleConflicts } from '../findVariableRoleConflicts.ts';

// Minimal stage builders over the base protocol's `person` node type.
const egoFormStage = (variable: string) => ({
  id: 'ef1',
  type: 'EgoForm',
  label: 'About you',
  introductionPanel: { title: 'T', text: 'X' },
  form: { fields: [{ variable, prompt: 'Answer' }] },
});

const alterFormStage = (variable: string) => ({
  id: 'af1',
  type: 'AlterForm',
  label: 'Alter form',
  subject: { entity: 'node', type: 'person' },
  introductionPanel: { title: 'T', text: 'X' },
  form: { fields: [{ variable, prompt: 'Answer' }] },
});

const categoricalBinStage = (variable: string) => ({
  id: 'cb1',
  type: 'CategoricalBin',
  label: 'Bin',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'p1', text: 'Sort', variable }],
});

const withStages = (stages: unknown[]) => {
  const base = createBaseProtocol();
  return { ...base, stages: [...(base.stages as unknown[]), ...stages] };
};

describe('findVariableRoleConflicts', () => {
  it('flags a variable used by both a form field and a bin prompt', () => {
    const conflicts = findVariableRoleConflicts(
      withStages([alterFormStage('category'), categoricalBinStage('category')]),
    );
    expect(conflicts).toHaveLength(1);
    const conflict = conflicts[0];
    expect(conflict?.variableId).toBe('category');
    expect(conflict?.subject).toEqual({ entity: 'node', type: 'person' });
    expect(conflict?.validated).toHaveLength(1);
    expect(conflict?.unvalidated).toHaveLength(1);
    expect(typeof conflict?.unvalidated[0]?.stageIndex).toBe('number');
  });

  it('accepts same-class sharing', () => {
    expect(
      findVariableRoleConflicts(
        withStages([
          categoricalBinStage('category'),
          { ...categoricalBinStage('category'), id: 'cb2' },
        ]),
      ),
    ).toEqual([]);
  });

  it('does not conflate identically-named variables on different subjects', () => {
    // ego form writes ego "category"; bin writes person "category" — no conflict
    const base = createBaseProtocol() as Record<string, unknown> & {
      codebook: { ego: { variables: Record<string, unknown> } };
    };
    base.codebook.ego.variables = {
      ...base.codebook.ego.variables,
      category: { name: 'ego_category', type: 'categorical', options: [
        { label: 'A', value: 'a' }, { label: 'B', value: 'b' },
      ] },
    };
    const conflicts = findVariableRoleConflicts({
      ...base,
      stages: [
        ...(base.stages as unknown[]),
        egoFormStage('category'),
        categoricalBinStage('category'),
      ],
    });
    expect(conflicts).toEqual([]);
  });

  it('ignores untagged read-only references', () => {
    expect(findVariableRoleConflicts(withStages([]))).toEqual([]);
  });
});
```

(Adjust the base-protocol variable ids to real ones from `test-utils.ts` — `category` exists on `person` per the codebook there; verify and substitute if named differently. Follow the file's `as`-convention notes from `validation-contradictions.test.ts` for the one structural cast.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/utils/__tests__/findVariableRoleConflicts.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
import {
  collectEntityAttributeReferences,
  type EntityAttributeReferenceHit,
} from './collectEntityAttributeReferences.ts';
import type { AttributeWriterUsage } from '../schemas/8/entity-attribute-reference.ts';

type UnknownRecord = Record<string, unknown>;

export type VariableRoleHit = {
  path: (string | number)[];
  usage: AttributeWriterUsage;
  stageIndex: number | undefined;
};

export type VariableRoleConflict = {
  subject: { entity: 'node' | 'edge' | 'ego'; type?: string };
  variableId: string;
  variableName: string;
  validated: VariableRoleHit[];
  unvalidated: VariableRoleHit[];
};

const asRecord = (value: unknown): UnknownRecord | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;

const stageIndexOf = (path: (string | number)[]): number | undefined =>
  path[0] === 'stages' && typeof path[1] === 'number' ? path[1] : undefined;

/**
 * FamilyPedigree (and NarrativePedigree) stages declare no top-level subject,
 * so the collector resolves their hits' subject to undefined. Their writers
 * always target the stage's own nodeConfig/edgeConfig type; recover it from
 * the stage document so those hits still participate in the rule.
 */
const recoverSubject = (
  protocol: UnknownRecord,
  hit: EntityAttributeReferenceHit,
): { entity: 'node' | 'edge' | 'ego'; type?: string } | undefined => {
  if (hit.subject) {
    const { entity, type } = hit.subject as { entity: 'node' | 'edge' | 'ego'; type?: string };
    return { entity, ...(type !== undefined ? { type } : {}) };
  }
  const index = stageIndexOf(hit.path);
  if (index === undefined) return undefined;
  const stages = protocol.stages;
  const stage = Array.isArray(stages) ? asRecord(stages[index]) : null;
  if (!stage) return undefined;
  const edgeConfigHit = hit.path.includes('edgeConfig');
  const config = asRecord(edgeConfigHit ? stage.edgeConfig : stage.nodeConfig);
  const type = config?.type;
  return typeof type === 'string'
    ? { entity: edgeConfigHit ? 'edge' : 'node', type }
    : undefined;
};

const variableNameFor = (
  protocol: UnknownRecord,
  subject: { entity: string; type?: string },
  variableId: string,
): string => {
  const codebook = asRecord(protocol.codebook);
  const owner =
    subject.entity === 'ego'
      ? asRecord(codebook?.ego)
      : asRecord(asRecord(codebook?.[subject.entity])?.[subject.type ?? '']);
  const variable = asRecord(asRecord(owner?.variables)?.[variableId]);
  const name = variable?.name;
  return typeof name === 'string' ? name : variableId;
};

export function findVariableRoleConflicts(
  protocol: unknown,
): VariableRoleConflict[] {
  const protocolRecord = asRecord(protocol);
  if (!protocolRecord) return [];

  const groups = new Map<
    string,
    {
      subject: { entity: 'node' | 'edge' | 'ego'; type?: string };
      variableId: string;
      validated: VariableRoleHit[];
      unvalidated: VariableRoleHit[];
    }
  >();

  for (const hit of collectEntityAttributeReferences(protocolRecord)) {
    if (hit.usage === undefined) continue;
    const subject = recoverSubject(protocolRecord, hit);
    if (!subject) continue;
    const key = [subject.entity, subject.type ?? '', hit.variableId].join('\n');
    let group = groups.get(key);
    if (!group) {
      group = { subject, variableId: hit.variableId, validated: [], unvalidated: [] };
      groups.set(key, group);
    }
    const roleHit: VariableRoleHit = {
      path: hit.path,
      usage: hit.usage,
      stageIndex: stageIndexOf(hit.path),
    };
    (hit.usage === 'validatedAttribute' ? group.validated : group.unvalidated).push(
      roleHit,
    );
  }

  const conflicts: VariableRoleConflict[] = [];
  for (const group of groups.values()) {
    if (group.validated.length === 0 || group.unvalidated.length === 0) continue;
    conflicts.push({
      ...group,
      variableName: variableNameFor(protocolRecord, group.subject, group.variableId),
    });
  }
  return conflicts;
}
```

Export from `src/index.ts`:

```ts
export {
  findVariableRoleConflicts,
  type VariableRoleConflict,
  type VariableRoleHit,
} from './utils/findVariableRoleConflicts.ts';
```

- [ ] **Step 4: Run tests, full suite, knip, commit**

Run: `pnpm --filter @codaco/protocol-validation test && pnpm knip`
Expected: PASS (knip clean once Architect consumes the export — if knip flags it before the Architect tasks land, note it in the report; do not remove the export).

```bash
eval "$(fnm env)" && git add -A packages/protocol-validation/src && git commit -m "feat(protocol-validation): find variable role conflicts across writer classes"
```

---

### Task 3: Migration — `required` backfill for otherVariable and quickAdd targets

**Files:**

- Modify: `packages/protocol-validation/src/schemas/8/migration.ts` (one new `traverseAndTransform` step + notes)
- Test: `packages/protocol-validation/src/schemas/8/__tests__/migration.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside the top-level `describe('Migration V7 to V8', ...)`, following the file's `as unknown as Protocol<7>` convention:

```ts
  describe('otherVariable and quickAdd required backfill', () => {
    const migrate = (protocol: Record<string, unknown>) =>
      migrationV7toV8.migrate(protocol as unknown as Protocol<7>, {
        name: 'Test Protocol',
      }) as unknown as {
        codebook: {
          node: { person: { variables: Record<string, unknown> } };
        };
      };

    const protocolWith = (
      variables: Record<string, unknown>,
      stages: unknown[],
    ) => ({
      schemaVersion: 7 as const,
      codebook: { node: { person: { name: 'Person', color: 'c', variables } } },
      stages,
    });

    it('sets required on otherVariable and quickAdd targets, overriding explicit false', () => {
      const migrated = migrate(
        protocolWith(
          {
            other: { name: 'other', type: 'text' },
            quick: { name: 'quick', type: 'text', validation: { required: false } },
            untouched: { name: 'untouched', type: 'text' },
          },
          [
            {
              id: 's1', type: 'CategoricalBin', label: 'Bin',
              subject: { entity: 'node', type: 'person' },
              prompts: [{ id: 'p1', text: 'T', variable: 'untouched',
                otherVariable: 'other', otherVariablePrompt: 'W', otherOptionLabel: 'O' }],
            },
            {
              id: 's2', type: 'NameGeneratorQuickAdd', label: 'QA',
              subject: { entity: 'node', type: 'person' },
              quickAdd: 'quick',
              prompts: [{ id: 'p2', text: 'T' }],
            },
          ],
        ),
      );
      const variables = migrated.codebook.node.person.variables;
      expect(variables.other).toHaveProperty('validation.required', true);
      expect(variables.quick).toHaveProperty('validation.required', true);
      expect(variables.untouched).not.toHaveProperty('validation.required');
    });

    it('leaves other rules on the target intact', () => {
      const migrated = migrate(
        protocolWith(
          { other: { name: 'other', type: 'text', validation: { maxLength: 10 } } },
          [{ id: 's1', type: 'CategoricalBin', label: 'Bin',
             subject: { entity: 'node', type: 'person' },
             prompts: [{ id: 'p1', text: 'T', variable: 'other2x',
               otherVariable: 'other', otherVariablePrompt: 'W', otherOptionLabel: 'O' }] }],
        ),
      );
      expect(migrated.codebook.node.person.variables.other).toHaveProperty(
        'validation.maxLength', 10,
      );
      expect(migrated.codebook.node.person.variables.other).toHaveProperty(
        'validation.required', true,
      );
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8/__tests__/migration.test.ts`
Expected: FAIL — no backfill exists.

- [ ] **Step 3: Implement the step**

Insert a step into the `traverseAndTransform` array operating on the whole document (`paths: ['']` steps exist as precedent — the schemaVersion step; but a scoped implementation is simpler at the document level). Place it AFTER the existing validation-repair steps, using the document-level pattern:

```ts
      {
        // The CategoricalBin other-input and the NameGenerator quick-add field
        // previously hard-coded `required` and ignored codebook rules; both now
        // honour the codebook. Preserve migrated protocols' effective behaviour
        // by setting `required: true` on every referenced target (an explicit
        // `required: false` was inert under the old hard-coded behaviour, so it
        // is overridden too).
        paths: [''],
        fn: <V>(document: V) => {
          const doc = asRecord(document);
          if (!doc) return document;
          const stages = Array.isArray(doc.stages) ? doc.stages : [];

          const targets: { entity: string; type?: string; variableId: string }[] = [];
          for (const rawStage of stages) {
            const stage = asRecord(rawStage);
            if (!stage) continue;
            const subject = asRecord(stage.subject);
            const entity = typeof subject?.entity === 'string' ? subject.entity : undefined;
            const type = typeof subject?.type === 'string' ? subject.type : undefined;
            if (stage.type === 'CategoricalBin' && Array.isArray(stage.prompts)) {
              for (const rawPrompt of stage.prompts) {
                const prompt = asRecord(rawPrompt);
                const otherVariable = prompt?.otherVariable;
                if (entity && typeof otherVariable === 'string') {
                  targets.push({ entity, type, variableId: otherVariable });
                }
              }
            }
            if (stage.type === 'NameGeneratorQuickAdd' && entity &&
                typeof stage.quickAdd === 'string') {
              targets.push({ entity, type, variableId: stage.quickAdd });
            }
          }

          const codebook = asRecord(doc.codebook);
          for (const target of targets) {
            const owner =
              target.entity === 'ego'
                ? asRecord(codebook?.ego)
                : asRecord(asRecord(codebook?.[target.entity])?.[target.type ?? '']);
            const variable = asRecord(asRecord(owner?.variables)?.[target.variableId]);
            if (!variable) continue;
            const validation = asRecord(variable.validation) ?? {};
            if (validation.required !== true) {
              validation.required = true;
              variable.validation = validation;
            }
          }
          return document;
        },
      },
```

Append to the migration `notes` template (before the closing backtick):

```
- The CategoricalBin "other" input and the NameGenerator quick-add field now honour the referenced variable's configured validation instead of a hard-coded requirement. To preserve the effective behaviour of existing protocols, every variable referenced as an \`otherVariable\` or \`quickAdd\` target is marked \`required\`.
```

- [ ] **Step 4: Run the full package suite, commit**

Run: `pnpm --filter @codaco/protocol-validation test`
Expected: PASS.

```bash
eval "$(fnm env)" && git add -A packages/protocol-validation/src && git commit -m "feat(protocol-validation): backfill required onto otherVariable and quickAdd targets"
```

---

### Task 4: Interview — CategoricalBin other-input honours codebook validation

**Files:**

- Modify: `packages/interview/src/interfaces/CategoricalBin/CategoricalBin.tsx:192-243`
- Test: extend the CategoricalBin unit/story coverage (locate the existing `CategoricalBin` test/story files under `packages/interview/src/interfaces/CategoricalBin/` and follow their idiom)

**Interfaces:**

- Consumes: `selectFieldMetadataFromVariables(variables, fields)` from `packages/interview/src/selectors/forms.ts:135` (public, stateless) and the existing validation-props mapping in `useProtocolForm.tsx:211-257`.

- [ ] **Step 1: Understand the current dialog**

Read `CategoricalBin.tsx:192-243`. Today: `openDialog({ type: 'form', ... })` renders a `Field` named `"otherVariable"` (a literal string, not the variable id) with hard-coded `required` (line 218); the result is read from `result.otherVariable` (line 234) and written to `[otherVariable]` (lines 228-240).

- [ ] **Step 2: Rewire**

Replace the hard-coded `required` with the codebook variable's validation props, derived the same way the form system does. Implementation shape (adapt to the file's exact dialog API):

```tsx
// Above the dialog construction: derive the other variable's validation props
// from its codebook definition, exactly as useProtocolForm does for form
// fields — the other-input is a validated writer, not a special case.
const otherVariableDefinition = otherVariable
  ? codebookVariables[otherVariable]
  : undefined;
const [otherFieldMetadata] = otherVariable
  ? selectFieldMetadataFromVariables(codebookVariables, [
      { variable: otherVariable, prompt: otherVariablePrompt ?? '' },
    ])
  : [];
```

and pass `otherFieldMetadata`'s validation-derived props to the `Field` in place of `required` (mirror how `useProtocolForm.tsx:211-257` maps `field.validation.*` — reuse its exported helper if one exists rather than duplicating the mapping; if the mapping is inline-only in `useProtocolForm`, extract it into a small exported function `validationPropsFor(metadata)` in `forms.ts` and use it from both places — do NOT copy-paste the 40-line mapping).

Keep the field's literal `name="otherVariable"` and the `result.otherVariable` read (renaming to the variable id changes the dialog contract for no benefit). Keep the clear-to-`null` path (lines 252-254) untouched.

Constraints: `createFieldMetadata` throws on a missing codebook entry (`forms.ts:93-95`) — guard with `otherVariableDefinition !== undefined` and fall back to rendering no dialog field enhancement (defensive; schema guarantees existence for valid protocols). No runtime `required` fallback — a rule-less variable renders an optional field.

- [ ] **Step 3: Tests**

Extend the existing CategoricalBin coverage with two cases: (a) an otherVariable with `validation: { required: true, maxLength: 5 }` — the dialog field rejects a 6-char entry and an empty entry; (b) an otherVariable with no validation — the dialog accepts an empty submission (writes null/undefined per the existing contract). Use the interface's existing test harness (stories play functions or unit tests — whichever the directory already uses; run via `pnpm --filter @codaco/interview exec vitest run --project units <file>`).

- [ ] **Step 4: Run, commit**

Run the touched test file plus `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/CategoricalBin`
Expected: PASS.

```bash
eval "$(fnm env)" && git add -A packages/interview/src && git commit -m "feat(interview): categorical bin other-input honours codebook validation"
```

---

### Task 5: Interview — QuickAdd honours codebook validation

**Files:**

- Modify: `packages/interview/src/interfaces/NameGenerator/components/QuickNodeForm.tsx:88-97` (and its props if needed)
- Test: extend QuickAdd coverage (existing stories/tests under `NameGenerator/components/`)

**Interfaces:**

- Consumes: the same `selectFieldMetadataFromVariables` / shared validation-props helper as Task 4.

- [ ] **Step 1: Rewire**

`QuickNodeForm.tsx:94-95` currently passes hard-coded `required` + `minLength: 1` into `QuickAddField`. Replace with the codebook variable's validation props for `targetVariable`, derived via the Task 4 helper. No fallback: a rule-less quickAdd variable submits empty input as today's `addNode` flow permits — verify what `addNode` does with an empty value and preserve the existing empty-submit REJECTION ONLY IF it comes from the form layer (it does today via the hard-coded rules; after the rewire, absence of rules means empty submits are allowed and create a node with an empty name — this is the agreed no-fallback behaviour; the migration/creation-seeding make it rare).

- [ ] **Step 2: Tests**

(a) quickAdd variable with `validation: { required: true, maxLength: 10 }` — over-long input blocked, empty blocked; (b) rule-less variable — empty submission creates the node (pin the agreed behaviour). Follow the existing QuickAdd test idiom (`QuickAddField.stories.tsx` has validation-rule stories to extend).

- [ ] **Step 3: Run, commit**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NameGenerator`
Expected: PASS.

```bash
eval "$(fnm env)" && git add -A packages/interview/src && git commit -m "feat(interview): quick-add field honours codebook validation"
```

---

### Task 6: Interface-change verification (CategoricalBin + NameGenerator)

No new production code. **Invoke the `verifying-an-interface-change` skill** (Claude Code: via the Skill tool) and follow it for BOTH changed interfaces:

- [ ] Run the interview e2e configuration matrix for CategoricalBin and NameGenerator (QuickAdd variants) per the skill; update ARIA snapshots via the targeted local matrix workflow if the rewires changed accessible output (they may: validation messages now render from codebook rules).
- [ ] Update the CategoricalBin and QuickAdd stories to cover codebook-driven validation (replacing any story that showcased the hard-coded behaviour).
- [ ] Record results; if pixel baselines are implicated, follow the skill's guidance (Docker/dispatch workflow — do not hand-generate).
- [ ] Commit any story/snapshot updates: `test(interview): verify categorical-bin and quick-add validation rewires`

---

### Task 7: Architect — role map and issues selectors

**Files:**

- Modify: `apps/architect/src/selectors/indexes.ts` (shared hit list + role map)
- Modify: `apps/architect/src/selectors/issues.ts` (conflict selectors)
- Test: `apps/architect/src/selectors/__tests__/roleMap.test.ts` (new; follow the directory's existing selector-test idiom — check for an existing `__tests__` dir near `selectors/` and match it)

**Interfaces:**

- Consumes: `findVariableRoleConflicts`, `type VariableRoleConflict` from `@codaco/protocol-validation` (Task 2); `getProtocol` from `apps/architect/src/selectors/protocol.ts:7`.
- Produces (Tasks 8–10 rely on these exact names):
  - `getVariableRoleMap(state): Record<string, { validated: number; unvalidated: number }>` — counts of usage-tagged hits per variable id, keyed `entity type variableId`-style composite; SIMPLER: keyed by variable id alone is WRONG (cross-subject collisions) — key by `` `${entity}:${type ?? ''}:${variableId}` `` and export `roleMapKey(subject, variableId)` alongside.
  - `getVariableRoleConflicts(state): VariableRoleConflict[]`
  - `getHasVariableRoleConflicts(state): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

import {
  getVariableRoleMap,
  roleMapKey,
} from '../indexes';
import {
  getVariableRoleConflicts,
  getHasVariableRoleConflicts,
} from '../issues';

// Minimal RootState stub: only the slices the selectors touch.
const stateWith = (protocol: unknown) =>
  ({ activeProtocol: { present: protocol } }) as never; // follow the file's existing test-state idiom instead of `as never` if one exists

const protocol = {
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person', color: 'c',
        variables: {
          cat: { name: 'cat', type: 'categorical', options: [
            { label: 'A', value: 'a' }, { label: 'B', value: 'b' } ] },
        },
      },
    },
  },
  stages: [
    { id: 's1', type: 'AlterForm', label: 'F',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'T', text: 'X' },
      form: { fields: [{ variable: 'cat', prompt: 'P' }] } },
    { id: 's2', type: 'CategoricalBin', label: 'B',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'T', variable: 'cat' }] },
  ],
};

describe('variable role map', () => {
  it('counts validated and unvalidated hits per subject-scoped variable', () => {
    const map = getVariableRoleMap(stateWith(protocol));
    const key = roleMapKey({ entity: 'node', type: 'person' }, 'cat');
    expect(map[key]).toEqual({ validated: 1, unvalidated: 1 });
  });

  it('exposes conflicts through issues selectors', () => {
    expect(getHasVariableRoleConflicts(stateWith(protocol))).toBe(true);
    const conflicts = getVariableRoleConflicts(stateWith(protocol));
    expect(conflicts[0]?.variableName).toBe('cat');
  });

  it('is empty for a conflict-free protocol', () => {
    const clean = { ...protocol, stages: [protocol.stages[0]] };
    expect(getHasVariableRoleConflicts(stateWith(clean))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement**

In `indexes.ts`: refactor so `getVariableIndex` and the new selectors share ONE memoised hit list —

```ts
const getEntityAttributeHits = createSelector(getProtocol, (protocol) =>
  protocol ? collectEntityAttributeReferences(protocol) : [],
);
```

(rewrite `getVariableIndex` to consume `getEntityAttributeHits` instead of walking again), then:

```ts
export const roleMapKey = (
  subject: { entity: string; type?: string },
  variableId: string,
): string => `${subject.entity}:${subject.type ?? ''}:${variableId}`;

First, in `packages/protocol-validation/src/utils/findVariableRoleConflicts.ts`, expose the pre-filter grouping (this keeps pedigree subject-recovery in ONE place): extract the grouping loop into

```ts
export type VariableRoleGroup = {
  subject: { entity: 'node' | 'edge' | 'ego'; type?: string };
  variableId: string;
  validated: VariableRoleHit[];
  unvalidated: VariableRoleHit[];
};

export function collectVariableRoleHits(protocol: unknown): VariableRoleGroup[];
```

and make `findVariableRoleConflicts` a thin filter over it (`groups.filter(g => g.validated.length > 0 && g.unvalidated.length > 0)` plus the name resolution). Export `collectVariableRoleHits` and `type VariableRoleGroup` from the package root alongside the Task 2 exports.

Then in Architect:

```ts
export const getVariableRoleMap = createSelector(
  getProtocol,
  (protocol): Record<string, { validated: number; unvalidated: number }> => {
    if (!protocol) return {};
    const map: Record<string, { validated: number; unvalidated: number }> = {};
    for (const group of collectVariableRoleHits(protocol)) {
      map[roleMapKey(group.subject, group.variableId)] = {
        validated: group.validated.length,
        unvalidated: group.unvalidated.length,
      };
    }
    return map;
  },
);
```

In `issues.ts` (mirroring the existing shapes at `:33-91`):

```ts
export const getVariableRoleConflicts = createSelector(getProtocol, (protocol) =>
  protocol ? findVariableRoleConflicts(protocol) : [],
);

export const getHasVariableRoleConflicts = createSelector(
  [getVariableRoleConflicts],
  (conflicts) => conflicts.length > 0,
);
```

- [ ] **Step 3: Run tests, typecheck, commit**

Run: `pnpm --filter @codaco/architect exec vitest run src/selectors/__tests__/roleMap.test.ts && pnpm --filter @codaco/architect typecheck`
Expected: PASS.

```bash
eval "$(fnm env)" && git add -A apps/architect/src packages/protocol-validation/src && git commit -m "feat(architect): variable role map and conflict selectors"
```

---

### Task 8: Architect — picker exclusions (both directions)

**Files:**

- Modify: `apps/architect/src/components/sections/Form/withFieldsHandlers.tsx:85-98` (form-side)
- Modify: `apps/architect/src/components/sections/CategoricalBinPrompts/withVariableOptions.tsx:23-26` (bins + Geospatial — shared)
- Modify: `apps/architect/src/components/sections/TieStrengthCensusPrompts/withVariableOptions.tsx:13-37`
- Modify: `apps/architect/src/components/sections/SociogramPrompts/selectors.tsx:25-41` (highlight variables; also DELETE the dead `withFormUsedVariableIndex.tsx` wiring — see below)
- Modify: `apps/architect/src/components/sections/FamilyPedigree/NominationPromptFields.tsx:25-29`
- Modify: `apps/architect/src/components/sections/NodeConfiguration/NodeConfiguration.tsx:198-210` (convexHull picker)
- Test: `apps/architect/src/components/sections/__tests__/pickerExclusions.test.ts` (new, selector-level)

**Interfaces:**

- Consumes: `getVariableRoleMap` + `roleMapKey` (Task 7).

- [ ] **Step 1: Add two tiny filter helpers** in a new `apps/architect/src/selectors/roleFilters.ts`:

```ts
import type { RootState } from '~/ducks/modules/root';
import { getVariableRoleMap, roleMapKey } from './indexes';

type Subject = { entity: string; type?: string };
type Option = { value: string; label: string };

/** Options safe to offer a VALIDATED writer picker (form fields, quickAdd, otherVariable). */
export const excludeUnvalidatedUses = (
  state: RootState,
  subject: Subject,
  options: Option[],
  currentValue?: string,
): Option[] => {
  const map = getVariableRoleMap(state);
  return options.filter(
    (option) =>
      option.value === currentValue ||
      (map[roleMapKey(subject, option.value)]?.unvalidated ?? 0) === 0,
  );
};

/** Options safe to offer an UNVALIDATED writer picker (bins, highlight, census, etc.). */
export const excludeValidatedUses = (
  state: RootState,
  subject: Subject,
  options: Option[],
  currentValue?: string,
): Option[] => {
  const map = getVariableRoleMap(state);
  return options.filter(
    (option) =>
      option.value === currentValue ||
      (map[roleMapKey(subject, option.value)]?.validated ?? 0) === 0,
  );
};
```

- [ ] **Step 2: Apply at each site**, threading the site's subject and current field value:

1. `withFieldsHandlers.tsx:85-98` — after the `VARIABLE_TYPES_WITH_COMPONENTS` filter, apply `excludeUnvalidatedUses(state, subject, options, currentVariableValue)` where `currentVariableValue` is the already-selected `variable` form value the hook reads. Covers Form, NetworkComposer fields, FamilyPedigree fields.
2. `CategoricalBinPrompts/withVariableOptions.tsx:23-26` — apply `excludeValidatedUses` with the stage subject (from the HOC's `{type, entity}` props) BEFORE the per-editor type filters. Covers CategoricalBin, OrdinalBin, Geospatial. The `otherVariable` picker (CategoricalBin `PromptFields.tsx:86-88`) filters from the same `variableOptions` — since `otherVariable` is now a VALIDATED writer, it must instead use `excludeUnvalidatedUses`; give `PromptFields.tsx` both lists (add a second prop from the HOC or apply the helper inline at `:86-88` with the committed `otherVariable` value as `currentValue`).
3. `TieStrengthCensusPrompts/withVariableOptions.tsx:17-20` — apply `excludeValidatedUses` with the edge subject (`{entity:'edge', type: createEdge}`).
4. `SociogramPrompts/selectors.tsx:25-41` (`getHighlightVariablesForSubject`) — apply `excludeValidatedUses`; ALSO delete `withFormUsedVariableIndex.tsx` and the never-supplied `usedVariableIndex` prop plumbing in `SociogramPrompts.tsx:24/31/55` (dead exclusivity wiring superseded by this project — verify nothing else references them; run knip).
5. `NominationPromptFields.tsx:25-29` — apply `excludeValidatedUses` with `{entity:'node', type: nodeType}`.
6. `NodeConfiguration.tsx:198-210` (convexHull) — apply `excludeValidatedUses` with the composer's node subject.

Layout/location-typed pickers (sociogram layout, composer layout, geospatial's location filter) get the same treatment via the shared HOC where applicable; where a picker's type filter already excludes all form-capable types the helper is a no-op — apply it anyway for uniformity (cheap, future-proof).

- [ ] **Step 3: Selector-level tests** (`pickerExclusions.test.ts`): with the Task 7 test protocol, assert `excludeUnvalidatedUses` drops `cat` (bin-used) from a form-picker option list but keeps it when `currentValue === 'cat'`; assert `excludeValidatedUses` drops it from a bin-picker list (form-used) with the same escape.

- [ ] **Step 4: Typecheck, architect suite, knip, commit**

```bash
eval "$(fnm env)" && git add -A apps/architect/src && git commit -m "feat(architect): exclude cross-class variables from writer pickers"
```

---

### Task 9: Architect — save-time gates

**Files:**

- Modify: `apps/architect/src/components/Validations/contradictions.ts` (extend `makeFieldEditorValidate`)
- Modify: `apps/architect/src/components/sections/CategoricalBinPrompts/withPromptChangeHandler.tsx` (both bins)
- Modify: `apps/architect/src/components/sections/TieStrengthCensusPrompts/withPromptChangeHandler.tsx:41-57`
- Modify: `apps/architect/src/components/sections/SociogramPrompts/SociogramPrompts.tsx:44-59` and `apps/architect/src/components/sections/FamilyPedigree/NominationPrompts.tsx:70-88` (add `onBeforeSave` gates via `DialogArrayField`'s existing seam)
- Test: extend `apps/architect/src/components/Validations/__tests__/contradictions.test.ts` + the prompt-handler tests

**Interfaces:**

- Consumes: `getVariableRoleMap`/`roleMapKey` OR direct `findVariableRoleConflicts` on a prospective document. Gate semantics: reject when the SAVED value would create a cross-class pair; message format: `` `"${variableName}" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)` `` and the mirror `` `"${variableName}" is written without validation by another stage, so it cannot be used as a form field` ``.

- [ ] **Step 1: Form side** — extend `makeFieldEditorValidate`: after the existing contradiction check, if the draft's `variable` id has any `unvalidated` count in the role map for the dialog's subject (pass the role map or a `hasUnvalidatedUse(variableId) => boolean` closure into the factory from each mount — Form.tsx, NodeConfiguration.tsx, EditableAttributesList.tsx already select state there), return `{ variable: <mirror message> }` keyed at the `variable` field. Escape: skip when the id equals the field's original committed variable (editing without changing).

- [ ] **Step 2: Bin/TSC side** — in both `withPromptChangeHandler`s, before the options write: if the prompt's `variable` (or `edgeVariable`) has any `validated` count for the stage subject (excluding the prompt's own committed value), throw `new SubmissionError({ variable: { _error: <message> } })` (TSC: key `edgeVariable`). NOTE the FieldArray `_error` contract from PR #1107: array-level errors need `{ _error }`; plain field keys take strings — `variable` here is a plain field on the prompt form, so a STRING value is correct: `new SubmissionError({ variable: message })`. Verify which shape renders in each editor by checking how the prompt form renders field errors (ValidatedField path → plain string).

- [ ] **Step 3: No-hook editors** — SociogramPrompts and NominationPrompts get an `onBeforeSave` via their `DialogArrayField` componentProps performing the same check for `highlight.variable` / `variable` and throwing `SubmissionError` likewise. (Geospatial/composer pickers are fully covered by exclusion + the generic dialog validate; their save paths need no bespoke gate — confirm by reading each editor's save flow and note the confirmation in the report.)

- [ ] **Step 4: Tests** — extend the contradictions tests: form-dialog validate rejects a bin-used variable with the mirror message; bin handler test throws for a form-used variable; escape cases (unchanged committed value) accepted. Follow the established harness idioms.

- [ ] **Step 5: Typecheck, architect suite, commit**

```bash
eval "$(fnm env)" && git add -A apps/architect/src && git commit -m "feat(architect): save-time gates for cross-class variable use"
```

---

### Task 10: Architect — conflict alert, nav badge, creation seeding

**Files:**

- Create: `apps/architect/src/components/VariableRoleConflictsAlert.tsx`
- Modify: `apps/architect/src/components/Protocol.tsx:11` (mount beside `TestingMapboxTokenAlert`)
- Modify: `apps/architect/src/components/ProjectNav/ProjectNav.tsx:41-46` (`tabWarnings`)
- Modify: `apps/architect/src/components/sections/CategoricalBinPrompts/withVariableHandlers.tsx:37-55` (seed `required` on eager otherVariable creation)
- Modify: `apps/architect/src/components/sections/QuickAdd/QuickAdd.tsx` inline creation + `apps/architect/src/components/sections/NodeConfiguration/NodeConfiguration.tsx` quickAdd creation (seed `required`; NG-side only — the composer quickAdd stays unvalidated and unseeded)
- Test: alert component test following `UnusedVariablesAlert`'s coverage idiom (check for an existing test; if none exists there, add a snapshot-free render test asserting conflict rows and the null case)

- [ ] **Step 1: Alert component** (mirror `TestingMapboxTokenAlert.tsx`'s structure and `UnusedVariablesAlert`'s selector consumption):

```tsx
import { useSelector } from 'react-redux';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';

import { getVariableRoleConflicts } from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';

const describeHits = (
  stages: unknown[],
  hits: { stageIndex: number | undefined }[],
): string =>
  hits
    .map((hit) => {
      const stage =
        hit.stageIndex !== undefined ? stages[hit.stageIndex] : undefined;
      const label =
        typeof stage === 'object' && stage !== null && 'label' in stage
          ? String((stage as { label?: unknown }).label ?? '')
          : '';
      return label || 'an unknown stage';
    })
    .join(', ');

const VariableRoleConflictsAlert = () => {
  const conflicts = useSelector(getVariableRoleConflicts);
  const protocol = useSelector(getProtocol);
  if (conflicts.length === 0) return null;
  const stages = Array.isArray(protocol?.stages) ? protocol.stages : [];

  return (
    <Alert variant="warning" className="mx-auto mb-10 max-w-3xl">
      <AlertTitle>
        {conflicts.length === 1
          ? 'A variable is written both with and without validation'
          : `${conflicts.length} variables are written both with and without validation`}
      </AlertTitle>
      <AlertDescription>
        <span className="block">
          Values written outside a form bypass the variable&apos;s validation
          rules, so forms elsewhere can receive values they would reject. For
          each variable below, remove it from either the form or the other
          stage.
        </span>
        <ul className="mt-2 list-disc pl-5">
          {conflicts.map((conflict) => (
            <li key={`${conflict.subject.entity}:${conflict.subject.type ?? ''}:${conflict.variableId}`}>
              <strong>{conflict.variableName}</strong> — collected by a form in{' '}
              {describeHits(stages, conflict.validated)}; written without
              validation in {describeHits(stages, conflict.unvalidated)}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
};

export default VariableRoleConflictsAlert;
```

Mount in `Protocol.tsx` directly after `TestingMapboxTokenAlert`.

- [ ] **Step 2: Nav badge** — add to `tabWarnings` in `ProjectNav.tsx` (the defined string doubles as the sr-only label):

```ts
  '/protocol': hasVariableRoleConflicts
    ? 'has variables written both with and without validation'
    : undefined,
```

with `const hasVariableRoleConflicts = useSelector(getHasVariableRoleConflicts);` alongside the existing two.

- [ ] **Step 3: Creation seeding** — in the three creation paths named above, seed `validation: { required: true }` into the `createVariableAsync` configuration for newly created otherVariable / NG-quickAdd variables (match each call's existing configuration shape; do not touch other creation paths).

- [ ] **Step 4: Tests, typecheck, commit**

Alert render test (conflict list renders variable name + both stage labels; null when clean). Then:

```bash
eval "$(fnm env)" && git add -A apps/architect/src && git commit -m "feat(architect): surface variable role conflicts and seed required on new writer targets"
```

---

### Task 11: Verification battery + e2e

- [ ] **Step 1: Bundled protocols must be conflict-free** — add to `packages/protocol-validation/src/__tests__/` a test asserting `findVariableRoleConflicts` returns `[]` for the all-interfaces fixture (`packages/protocols/e2e/all-interfaces/protocol.json`) and for each bundled `protocol.json` reachable in `packages/protocols/` (mirror how `all-interfaces-fixture.test.ts` loads them). If any bundled protocol carries a conflict, STOP and report it (fixing bundled protocols is a controller decision — the fix may be a protocol edit or evidence the rule needs adjustment).
- [ ] **Step 2: Corpus REPORT** — run the credentialed corpus (env vars per `.env.example`; `GITHUB_TOKEN="$(gh auth token)"`), mapping each protocol through `findVariableRoleConflicts` after migration, and WRITE a report (protocol name → conflicts) into the task report. This is informational, not a gate: these are the researchers who will see the alert.
- [ ] **Step 3: Architect e2e** — one spec via the `running-architect-e2e-tests` skill: seed a protocol fixture containing a form+bin conflict (readProtocolJson-style seed), assert the timeline alert lists the variable and both stage labels, and assert the bin prompt editor's variable picker omits a form-used variable (and the form field picker omits a bin-used one). Iterate locators per the skill.
- [ ] **Step 4: Full battery** — `pnpm --filter @codaco/protocol-validation test`; `pnpm --filter @codaco/interview test` (units); `pnpm --filter @codaco/architect test`; scoped typecheck for all three; `pnpm knip`; full Architect e2e suite once; interview matrix results from Task 6 recorded.
- [ ] **Step 5: Commit** e2e spec + fixture: `test: attribute-writer exclusivity e2e and bundled-protocol guards`

---

### Task 12: Changesets

**Invoke the `creating-a-changeset` skill.** Three files, separate lanes, never combined:

1. `@codaco/protocol-validation` **minor** — draft: usage classification on attribute references, `findVariableRoleConflicts`, and the migration's `required` backfill for otherVariable/quickAdd targets.
2. `@codaco/interview` **minor** — draft: the CategoricalBin other-input and NameGenerator quick-add now honour the referenced variable's configured validation (previously hard-coded `required`; a variable with no rules is now optional at those inputs).
3. `@codaco/architect` **patch** — draft: writer pickers exclude cross-class variables, save-time gates explain refusals, a timeline alert + Stages-tab badge surface pre-existing conflicts, and newly created other/quick-add variables default to `required`.

- [ ] Author via the skill; `pnpm check:changesets`; commit `chore: changesets for attribute-writer exclusivity`.

---

## Execution notes

- Task order is strict through Task 3; Tasks 4–5 (interview) and 7–10 (Architect) can run as two lanes after Task 2, with Task 3 anywhere after Task 1. Task 6 follows 4–5; Task 11 follows everything; Task 12 last.
- The two-lane split from the previous project applies (separate worktrees, one committer per worktree, merge before Task 11).
- When done, `shipping-a-pull-request` — PR description must include the corpus conflict report (Step 2 of Task 11).



