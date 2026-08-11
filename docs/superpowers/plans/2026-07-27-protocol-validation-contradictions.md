# Protocol Validation Contradictions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make contradictory variable validation rules unexpressible: rejected by `@codaco/protocol-validation`'s schema, repaired by the v7→v8 migration, and unauthorable in Architect's variable editor.

**Architecture:** One pure analyser module (`findValidationContradictions`) in protocol-validation encodes the satisfiability semantics — comparator canonicalisation into `{lower, upper, strict}` edges, `sameAs` union-find groups, strict-edge cycle detection, interval disjointness. Record-level `.superRefine`s on the three variables schemas consume it; the v7→v8 migration reuses it to find exactly the rules to strip; Architect imports the same function for row-save gating, reference-picker filtering, and a dialog-level form validate. Companion refinements: absolute floors on count-valued rules (R1), same-type reference targets (R2), and a DatePicker parameters refinement.

**Tech Stack:** TypeScript, Zod v4, Vitest, redux-form (Architect), Playwright (Architect e2e), pnpm workspaces, Turborepo.

**Spec:** `docs/superpowers/specs/2026-07-27-protocol-validation-contradictions-design.md` — read it first; its catalogue numbering (classes 1–11) is referenced throughout.

## Global Constraints

- **No `any` types.** Repo-wide rule. Do not resolve type errors with `as` assertions either (`as const` is fine); narrow untyped boundary values (`Record<string, unknown>`) with runtime guards.
- **No barrel files; never re-export.** `packages/protocol-validation/src/index.ts` is the existing package entry — add to it only what Architect actually imports.
- **Only export what another module imports.** Run `pnpm knip` before opening the PR.
- **Comment only unusual or complex code.**
- **Source-first workspace.** Packages are consumed as raw TypeScript; keep protocol-validation's relative imports extension-explicit (`./validation.ts`) — the existing files all do this and Architect's vite config loads this package through Node's loader.
- **Formatting:** the husky pre-commit hook runs `oxlint --fix` + `oxfmt` on staged files; a normal `git commit` formats changes. Never run root `pnpm lint:fix` (rewrites the whole repo). Run `eval "$(fnm env)"` in the shell before committing so the hook can find pnpm.
- **Reference rules hold variable ids** (the key in the owning entity's `variables` record), never variable names. References never cross entities.
- **Minimal-strip repair policy** (spec's Migration table): inverted pairs strip both members; `minSelected > options.length` strips `minSelected`; conflicting `sameAs`+`differentFrom` strips both; cycles and disjoint-bound comparators strip the comparator rules only; conflicts inside a `sameAs` group strip the comparator/`differentFrom` and keep `sameAs`; a `sameAs` group with disjoint bounds strips all its `sameAs` rules; cross-type references are stripped; DatePicker values are truncated when finer than the resolution, stripped when coarser/malformed, both bounds stripped when `min > max`.
- **Explicitly accepted shapes must stay expressible** (spec): both-sides declarations (`A > B` with `B < A`), mutual `differentFrom`, mutual non-strict comparators, a strict comparator plus redundant `differentFrom`, `sameAs` chains/cycles, bare `minNodes`, `unique` wherever the mask allows it.
- **Test commands:** `pnpm --filter @codaco/protocol-validation test` (vitest, node), `pnpm --filter @codaco/architect test` (vitest). Scope typecheck to touched packages: `pnpm --filter @codaco/protocol-validation --filter @codaco/architect typecheck`.
- **Changeset lanes:** one lane per changeset — `@codaco/protocol-validation` (library, minor) and `@codaco/architect` (gated product, patch) must be **separate** changeset files. Invoke the `creating-a-changeset` skill (Claude Code: via the Skill tool) when authoring them.

---

### Task 1: Analyser module — local checks (catalogue classes 1–4)

The analyser is a pure function over one entity's `variables` record. It must read defensively (`Record<string, unknown>` accessors) because it runs in two contexts: inside Zod refinement (typed, already-parsed input) and inside the v7→v8 migration (raw, partially-migrated input).

**Files:**

- Create: `packages/protocol-validation/src/schemas/8/variables/validation-contradictions.ts`
- Test: `packages/protocol-validation/src/schemas/8/__tests__/validation-contradictions.test.ts`

**Interfaces:**

- Consumes: `type ValidationName` from `./validation.ts` (type-only import — no runtime cycle when `variable.ts` later imports this module).
- Produces (later tasks rely on these exact names):
  - `type ContradictionClass = 'invertedBounds' | 'minSelectedExceedsOptions' | 'conflictingReferencePair' | 'strictComparatorCycle' | 'sameAsGroupConflict' | 'disjointBounds'`
  - `type VariableRuleRef = { variableId: string; rule: ValidationName }`
  - `type ValidationContradiction = { class: ContradictionClass; message: string; variableIds: string[]; strips: [VariableRuleRef, ...VariableRuleRef[]] }`
  - `findValidationContradictions(variables: Record<string, unknown>): ValidationContradiction[]`

`strips` lists exactly the rules the minimal-strip policy removes; `strips[0]` is the Zod issue-path anchor. `variableIds` lists every variable participating in the contradiction (Architect filters on it).

- [ ] **Step 1: Write the failing test**

Create `packages/protocol-validation/src/schemas/8/__tests__/validation-contradictions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { findValidationContradictions } from '../variables/validation-contradictions.ts';

describe('findValidationContradictions — local checks', () => {
  it('reports minLength > maxLength, stripping both members', () => {
    const result = findValidationContradictions({
      a: {
        name: 'first_name',
        type: 'text',
        validation: { minLength: 10, maxLength: 2 },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('invertedBounds');
    expect(result[0]?.message).toBe(
      'Variable "first_name": minLength (10) is greater than maxLength (2)',
    );
    expect(result[0]?.variableIds).toEqual(['a']);
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'minLength' },
      { variableId: 'a', rule: 'maxLength' },
    ]);
  });

  it('reports minValue > maxValue and minSelected > maxSelected', () => {
    const result = findValidationContradictions({
      a: { name: 'age', type: 'number', validation: { minValue: 10, maxValue: 2 } },
      b: {
        name: 'colors',
        type: 'categorical',
        options: [
          { label: 'Red', value: 'red' },
          { label: 'Blue', value: 'blue' },
        ],
        validation: { minSelected: 4, maxSelected: 1 },
      },
    });
    expect(result.map((c) => c.class).sort()).toEqual([
      'invertedBounds',
      'invertedBounds',
      'minSelectedExceedsOptions',
    ]);
  });

  it('reports minSelected greater than the option count, stripping minSelected only', () => {
    const result = findValidationContradictions({
      a: {
        name: 'colors',
        type: 'categorical',
        options: [
          { label: 'Red', value: 'red' },
          { label: 'Blue', value: 'blue' },
        ],
        validation: { minSelected: 3 },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('minSelectedExceedsOptions');
    expect(result[0]?.message).toBe(
      'Variable "colors": minSelected (3) is greater than the number of options (2)',
    );
    expect(result[0]?.strips).toEqual([{ variableId: 'a', rule: 'minSelected' }]);
  });

  it('accepts equal bounds and minSelected equal to the option count', () => {
    expect(
      findValidationContradictions({
        a: { name: 'age', type: 'number', validation: { minValue: 5, maxValue: 5 } },
        b: {
          name: 'colors',
          type: 'categorical',
          options: [
            { label: 'Red', value: 'red' },
            { label: 'Blue', value: 'blue' },
          ],
          validation: { minSelected: 2, maxSelected: 2 },
        },
      }),
    ).toEqual([]);
  });

  it('ignores variables with no validation and non-numeric rule values', () => {
    expect(
      findValidationContradictions({
        a: { name: 'layout', type: 'layout' },
        b: { name: 'age', type: 'number', validation: { minValue: 'ten' } },
      }),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8/__tests__/validation-contradictions.test.ts`
Expected: FAIL — cannot resolve `../variables/validation-contradictions.ts`.

- [ ] **Step 3: Write the implementation**

Create `packages/protocol-validation/src/schemas/8/variables/validation-contradictions.ts`:

```ts
import type { ValidationName } from './validation.ts';

type UnknownRecord = Record<string, unknown>;

export type ContradictionClass =
  | 'invertedBounds'
  | 'minSelectedExceedsOptions'
  | 'conflictingReferencePair'
  | 'strictComparatorCycle'
  | 'sameAsGroupConflict'
  | 'disjointBounds';

export type VariableRuleRef = {
  variableId: string;
  rule: ValidationName;
};

export type ValidationContradiction = {
  class: ContradictionClass;
  message: string;
  /** Every variable participating in the contradiction. */
  variableIds: string[];
  /**
   * The rules the minimal-strip repair policy removes to resolve this
   * contradiction. The first entry anchors the Zod issue path.
   */
  strips: [VariableRuleRef, ...VariableRuleRef[]];
};

// All reads are defensive: the analyser runs inside Zod refinement (typed,
// parsed input) and inside the v7→v8 migration (raw, partially-migrated
// input), so nothing here may assume a well-formed variable.
const asRecord = (value: unknown): UnknownRecord | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;

const validationOf = (variable: unknown): UnknownRecord =>
  asRecord(asRecord(variable)?.validation) ?? {};

const nameOf = (id: string, variable: unknown): string => {
  const name = asRecord(variable)?.name;
  return typeof name === 'string' ? name : id;
};

const typeOf = (variable: unknown): string | undefined => {
  const type = asRecord(variable)?.type;
  return typeof type === 'string' ? type : undefined;
};

const numberRule = (
  variable: unknown,
  rule: ValidationName,
): number | undefined => {
  const value = validationOf(variable)[rule];
  return typeof value === 'number' ? value : undefined;
};

const referenceRule = (
  variable: unknown,
  rule: ValidationName,
): string | undefined => {
  const value = validationOf(variable)[rule];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const optionCount = (variable: unknown): number | undefined => {
  const options = asRecord(variable)?.options;
  return Array.isArray(options) ? options.length : undefined;
};

const BOUND_PAIRS = [
  ['minLength', 'maxLength'],
  ['minValue', 'maxValue'],
  ['minSelected', 'maxSelected'],
] as const satisfies readonly (readonly [ValidationName, ValidationName])[];

function localContradictions(
  variables: UnknownRecord,
): ValidationContradiction[] {
  const found: ValidationContradiction[] = [];
  for (const [id, variable] of Object.entries(variables)) {
    const name = nameOf(id, variable);
    for (const [minRule, maxRule] of BOUND_PAIRS) {
      const min = numberRule(variable, minRule);
      const max = numberRule(variable, maxRule);
      if (min !== undefined && max !== undefined && min > max) {
        found.push({
          class: 'invertedBounds',
          message: `Variable "${name}": ${minRule} (${min}) is greater than ${maxRule} (${max})`,
          variableIds: [id],
          strips: [
            { variableId: id, rule: minRule },
            { variableId: id, rule: maxRule },
          ],
        });
      }
    }
    const minSelected = numberRule(variable, 'minSelected');
    const options = optionCount(variable);
    if (
      minSelected !== undefined &&
      options !== undefined &&
      minSelected > options
    ) {
      found.push({
        class: 'minSelectedExceedsOptions',
        message: `Variable "${name}": minSelected (${minSelected}) is greater than the number of options (${options})`,
        variableIds: [id],
        strips: [{ variableId: id, rule: 'minSelected' }],
      });
    }
  }
  return found;
}

export function findValidationContradictions(
  variables: UnknownRecord,
): ValidationContradiction[] {
  return localContradictions(variables);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8/__tests__/validation-contradictions.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
eval "$(fnm env)" && git add packages/protocol-validation/src/schemas/8/variables/validation-contradictions.ts packages/protocol-validation/src/schemas/8/__tests__/validation-contradictions.test.ts && git commit -m "feat(protocol-validation): analyser for local validation-rule contradictions"
```

---

### Task 2: Analyser — reference structure (catalogue classes 7–9)

Cross-variable checks: `sameAs`+`differentFrom` on one target, strict comparator cycles, and conflicts inside a `sameAs` group. Semantics (spec classes 7–9): comparators canonicalise into deduped `{lower, upper, strict}` edges so both-sides declarations collapse to one edge; `sameAs` collapses into union-find groups; self-references are the group-of-one case.

A reference is **usable** only when its target exists in the record and has the same `type` as the source — cross-type references are R2's problem (Task 6) and comparing their bounds would be meaningless.

**Files:**

- Modify: `packages/protocol-validation/src/schemas/8/variables/validation-contradictions.ts`
- Test: `packages/protocol-validation/src/schemas/8/__tests__/validation-contradictions.test.ts`

**Interfaces:**

- Produces (module-internal, reused by Task 3): `buildSameAsGroups(variables)` → `{ groupOf: Map<string, string>; membersOf: Map<string, string[]> }`; `comparatorEdges(variables)` → `ComparatorEdge[]` where `type ComparatorEdge = { lower: string; upper: string; strict: boolean; sources: VariableRuleRef[] }`; `usableReference(variables, sourceId, rule)` → `string | undefined`.

- [ ] **Step 1: Write the failing test**

Append to `validation-contradictions.test.ts`:

```ts
describe('findValidationContradictions — reference structure', () => {
  const number = (name: string, validation: Record<string, unknown> = {}) => ({
    name,
    type: 'number',
    validation,
  });

  it('reports sameAs and differentFrom naming the same target', () => {
    const result = findValidationContradictions({
      a: number('a', { sameAs: 'b', differentFrom: 'b' }),
      b: number('b'),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('conflictingReferencePair');
    expect(result[0]?.message).toBe(
      'Variable "a": sameAs and differentFrom both reference "b"',
    );
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'sameAs' },
      { variableId: 'a', rule: 'differentFrom' },
    ]);
  });

  it('reports a strict two-cycle (A > B and A < B)', () => {
    const result = findValidationContradictions({
      a: number('a', { greaterThanVariable: 'b', lessThanVariable: 'b' }),
      b: number('b'),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('strictComparatorCycle');
    expect(result[0]?.variableIds.sort()).toEqual(['a', 'b']);
  });

  it('reports a three-variable strict cycle, stripping every edge in it', () => {
    const result = findValidationContradictions({
      a: number('a', { greaterThanVariable: 'b' }),
      b: number('b', { greaterThanVariable: 'c' }),
      c: number('c', { greaterThanVariable: 'a' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('strictComparatorCycle');
    expect(result[0]?.strips).toHaveLength(3);
  });

  it('reports a strict comparator inside a sameAs group, keeping sameAs', () => {
    const result = findValidationContradictions({
      a: number('a', { sameAs: 'b', greaterThanVariable: 'b' }),
      b: number('b'),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('sameAsGroupConflict');
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'greaterThanVariable' },
    ]);
  });

  it('reports differentFrom joining two members of a sameAs chain', () => {
    const result = findValidationContradictions({
      a: number('a', { sameAs: 'b' }),
      b: number('b', { sameAs: 'c' }),
      c: number('c', { differentFrom: 'a' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('sameAsGroupConflict');
    expect(result[0]?.strips).toEqual([
      { variableId: 'c', rule: 'differentFrom' },
    ]);
  });

  it('reports self-references: differentFrom self and a strict comparator on self', () => {
    const result = findValidationContradictions({
      a: number('a', { differentFrom: 'a' }),
      b: number('b', { greaterThanVariable: 'b' }),
    });
    expect(result.map((c) => c.message).sort()).toEqual([
      'Variable "a": differentFrom references the variable itself',
      'Variable "b": greaterThanVariable references the variable itself',
    ]);
  });

  it('accepts every explicitly-accepted shape', () => {
    expect(
      findValidationContradictions({
        // one constraint stated from both sides — one edge, not a cycle
        start: number('start', { lessThanVariable: 'end' }),
        end: number('end', { greaterThanVariable: 'start' }),
        // mutual differentFrom — symmetric, one constraint
        a: number('a', { differentFrom: 'b' }),
        b: number('b', { differentFrom: 'a' }),
        // mutual non-strict comparators — forces equality, satisfiable
        c: number('c', { greaterThanOrEqualToVariable: 'd' }),
        d: number('d', { greaterThanOrEqualToVariable: 'c' }),
        // strict comparator plus redundant differentFrom
        e: number('e', { greaterThanVariable: 'f' }),
        f: number('f', { differentFrom: 'e' }),
        // sameAs chain closing on itself — every member shares one value
        g: number('g', { sameAs: 'h' }),
        h: number('h', { sameAs: 'g' }),
        // non-strict comparator inside a sameAs group — equality satisfies it
        i: number('i', { sameAs: 'j', lessThanOrEqualToVariable: 'j' }),
        j: number('j'),
        // non-strict self comparison is trivially true
        k: number('k', { greaterThanOrEqualToVariable: 'k' }),
      }),
    ).toEqual([]);
  });

  it('ignores references to missing or differently-typed targets', () => {
    expect(
      findValidationContradictions({
        a: number('a', { greaterThanVariable: 'missing' }),
        b: number('b', { sameAs: 'c', differentFrom: 'c' }),
        c: { name: 'c', type: 'text' },
      }),
    ).toEqual([
      // sameAs+differentFrom is reported on raw values even when the target's
      // type mismatches — the pair is contradictory regardless
      expect.objectContaining({ class: 'conflictingReferencePair' }),
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8/__tests__/validation-contradictions.test.ts`
Expected: FAIL — the new describe block's assertions (function currently returns only local checks).

- [ ] **Step 3: Write the implementation**

Add to `validation-contradictions.ts` (below `localContradictions`, above `findValidationContradictions`):

```ts
// Variable ids never contain a NUL, so joining on one cannot collide.
const KEY_SEPARATOR = '\u0000';

const stripKey = (ref: VariableRuleRef): string =>
  `${ref.variableId}${KEY_SEPARATOR}${ref.rule}`;

/**
 * A reference is usable for structural analysis only when its target exists
 * and has the same type as the source. Cross-type references are rejected
 * separately (R2, the reference pass) and their bounds are incomparable.
 */
const usableReference = (
  variables: UnknownRecord,
  sourceId: string,
  rule: ValidationName,
): string | undefined => {
  const target = referenceRule(variables[sourceId], rule);
  if (target === undefined) return undefined;
  if (!(target in variables)) return undefined;
  const sourceType = typeOf(variables[sourceId]);
  const targetType = typeOf(variables[target]);
  if (
    sourceType === undefined ||
    targetType === undefined ||
    sourceType !== targetType
  ) {
    return undefined;
  }
  return target;
};

/**
 * `sameAs` is symmetric and transitive in effect — every member of a chain
 * ends up holding one value — so variables joined by it merge into groups.
 */
function buildSameAsGroups(variables: UnknownRecord): {
  groupOf: Map<string, string>;
  membersOf: Map<string, string[]>;
} {
  const parent = new Map<string, string>();
  for (const id of Object.keys(variables)) parent.set(id, id);

  const find = (id: string): string => {
    let root = id;
    for (;;) {
      const next = parent.get(root);
      if (next === undefined || next === root) break;
      root = next;
    }
    let cursor = id;
    while (cursor !== root) {
      const next = parent.get(cursor);
      if (next === undefined) break;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };

  for (const id of Object.keys(variables)) {
    const target = usableReference(variables, id, 'sameAs');
    if (target === undefined) continue;
    const rootA = find(target);
    const rootB = find(id);
    if (rootA !== rootB) parent.set(rootB, rootA);
  }

  const groupOf = new Map<string, string>();
  const membersOf = new Map<string, string[]>();
  for (const id of Object.keys(variables)) {
    const root = find(id);
    groupOf.set(id, root);
    const members = membersOf.get(root) ?? [];
    members.push(id);
    membersOf.set(root, members);
  }
  return { groupOf, membersOf };
}

type ComparatorEdge = {
  lower: string;
  upper: string;
  strict: boolean;
  sources: VariableRuleRef[];
};

const COMPARATOR_DIRECTION = {
  greaterThanVariable: { ownerIsUpper: true, strict: true },
  lessThanVariable: { ownerIsUpper: false, strict: true },
  greaterThanOrEqualToVariable: { ownerIsUpper: true, strict: false },
  lessThanOrEqualToVariable: { ownerIsUpper: false, strict: false },
} as const;

type ComparatorRuleName = keyof typeof COMPARATOR_DIRECTION;

const COMPARATOR_RULES: readonly ComparatorRuleName[] = [
  'greaterThanVariable',
  'lessThanVariable',
  'greaterThanOrEqualToVariable',
  'lessThanOrEqualToVariable',
];

/**
 * Rewrites all four comparators into the single `{ lower, upper, strict }`
 * direction and dedupes, so one constraint written from both sides ("end
 * after start" plus "start before end") collapses to one edge instead of
 * looking like a cycle. Every contributing rule instance is kept as a source
 * so a strip can name it.
 */
function comparatorEdges(variables: UnknownRecord): ComparatorEdge[] {
  const byKey = new Map<string, ComparatorEdge>();
  for (const id of Object.keys(variables)) {
    for (const rule of COMPARATOR_RULES) {
      const target = usableReference(variables, id, rule);
      if (target === undefined) continue;
      const { ownerIsUpper, strict } = COMPARATOR_DIRECTION[rule];
      const lower = ownerIsUpper ? target : id;
      const upper = ownerIsUpper ? id : target;
      const key = [lower, upper, String(strict)].join(KEY_SEPARATOR);
      const existing = byKey.get(key);
      if (existing) {
        existing.sources.push({ variableId: id, rule });
      } else {
        byKey.set(key, {
          lower,
          upper,
          strict,
          sources: [{ variableId: id, rule }],
        });
      }
    }
  }
  return [...byKey.values()];
}

type GroupEdge = { strict: boolean; sources: VariableRuleRef[] };

/**
 * Cycles in the group-level comparator graph. An all-non-strict cycle merely
 * forces its members equal, which one value satisfies; only cycles containing
 * a strict edge are unsatisfiable and reported.
 */
function findStrictCycles(
  dependencies: Map<string, Map<string, GroupEdge>>,
): { groups: string[]; sources: VariableRuleRef[] }[] {
  const results: { groups: string[]; sources: VariableRuleRef[] }[] = [];
  const reported = new Set<string>();
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (group: string, stack: string[]): void => {
    const current = state.get(group);
    if (current === 'done') return;
    if (current === 'visiting') {
      const start = stack.indexOf(group);
      const cycle = stack.slice(start === -1 ? 0 : start);
      const edges: GroupEdge[] = [];
      let hasStrict = false;
      for (let index = 0; index < cycle.length; index++) {
        const from = cycle[index];
        const to = cycle[(index + 1) % cycle.length];
        const edge =
          from !== undefined && to !== undefined
            ? dependencies.get(from)?.get(to)
            : undefined;
        if (edge) {
          edges.push(edge);
          if (edge.strict) hasStrict = true;
        }
      }
      if (hasStrict) {
        const key = cycle.toSorted().join(KEY_SEPARATOR);
        if (!reported.has(key)) {
          reported.add(key);
          results.push({
            groups: cycle,
            sources: edges.flatMap((edge) => edge.sources),
          });
        }
      }
      return;
    }
    state.set(group, 'visiting');
    for (const dependency of dependencies.get(group)?.keys() ?? []) {
      visit(dependency, [...stack, group]);
    }
    state.set(group, 'done');
  };

  for (const group of dependencies.keys()) visit(group, []);
  return results;
}

function referenceStructureContradictions(
  variables: UnknownRecord,
): ValidationContradiction[] {
  const found: ValidationContradiction[] = [];
  const claimed = new Set<string>();

  // Class 7: sameAs + differentFrom naming one target. Checked on raw values
  // (no usability guard) — the pair is contradictory regardless of the
  // target's type or existence.
  for (const [id, variable] of Object.entries(variables)) {
    const sameAs = referenceRule(variable, 'sameAs');
    const differentFrom = referenceRule(variable, 'differentFrom');
    if (sameAs === undefined || sameAs !== differentFrom) continue;
    const targetName = nameOf(sameAs, variables[sameAs]);
    const strips: [VariableRuleRef, VariableRuleRef] = [
      { variableId: id, rule: 'sameAs' },
      { variableId: id, rule: 'differentFrom' },
    ];
    found.push({
      class: 'conflictingReferencePair',
      message: `Variable "${nameOf(id, variable)}": sameAs and differentFrom both reference "${targetName}"`,
      variableIds: id === sameAs ? [id] : [id, sameAs],
      strips,
    });
    for (const strip of strips) claimed.add(stripKey(strip));
  }

  const { groupOf, membersOf } = buildSameAsGroups(variables);

  // Group-level comparator dependency graph (upper depends on lower). An edge
  // whose ends fall inside one group is a class-9 conflict when strict.
  const dependencies = new Map<string, Map<string, GroupEdge>>();
  for (const edge of comparatorEdges(variables)) {
    const upper = groupOf.get(edge.upper);
    const lower = groupOf.get(edge.lower);
    if (upper === undefined || lower === undefined) continue;
    if (upper === lower) {
      if (!edge.strict) continue;
      const [first, ...rest] = edge.sources;
      if (!first) continue;
      const ownerName = nameOf(first.variableId, variables[first.variableId]);
      const otherId =
        first.variableId === edge.upper ? edge.lower : edge.upper;
      const message =
        edge.lower === edge.upper
          ? `Variable "${ownerName}": ${first.rule} references the variable itself`
          : `Variable "${ownerName}": ${first.rule} references "${nameOf(otherId, variables[otherId])}", but sameAs already requires them to be equal`;
      found.push({
        class: 'sameAsGroupConflict',
        message,
        variableIds: membersOf.get(upper) ?? [first.variableId],
        strips: [first, ...rest],
      });
      continue;
    }
    let bucket = dependencies.get(upper);
    if (!bucket) {
      bucket = new Map();
      dependencies.set(upper, bucket);
    }
    const existing = bucket.get(lower);
    if (existing) {
      existing.strict = existing.strict || edge.strict;
      existing.sources.push(...edge.sources);
    } else {
      bucket.set(lower, { strict: edge.strict, sources: [...edge.sources] });
    }
  }

  // Class 9: differentFrom joining two members of one sameAs group (or the
  // variable itself — the group-of-one case). Skipped when class 7 already
  // claimed the same rule instance.
  for (const [id, variable] of Object.entries(variables)) {
    const target = usableReference(variables, id, 'differentFrom');
    if (target === undefined) continue;
    if (groupOf.get(id) !== groupOf.get(target)) continue;
    const ref: VariableRuleRef = { variableId: id, rule: 'differentFrom' };
    if (claimed.has(stripKey(ref))) continue;
    const group = groupOf.get(id);
    const message =
      id === target
        ? `Variable "${nameOf(id, variable)}": differentFrom references the variable itself`
        : `Variable "${nameOf(id, variable)}": differentFrom references "${nameOf(target, variables[target])}", but sameAs already requires them to be equal`;
    found.push({
      class: 'sameAsGroupConflict',
      message,
      variableIds: (group !== undefined && membersOf.get(group)) || [id],
      strips: [ref],
    });
  }

  // Class 8: strict comparator cycles across groups.
  for (const cycle of findStrictCycles(dependencies)) {
    const memberIds = cycle.groups.flatMap(
      (group) => membersOf.get(group) ?? [],
    );
    const memberNames = memberIds.map(
      (memberId) => `"${nameOf(memberId, variables[memberId])}"`,
    );
    const [first, ...rest] = cycle.sources;
    if (!first) continue;
    found.push({
      class: 'strictComparatorCycle',
      message: `Variables ${memberNames.join(', ')} form an impossible comparison cycle`,
      variableIds: memberIds,
      strips: [first, ...rest],
    });
  }

  return found;
}
```

Then update the entry point:

```ts
export function findValidationContradictions(
  variables: UnknownRecord,
): ValidationContradiction[] {
  return [
    ...localContradictions(variables),
    ...referenceStructureContradictions(variables),
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8/__tests__/validation-contradictions.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
eval "$(fnm env)" && git add -A packages/protocol-validation/src && git commit -m "feat(protocol-validation): detect reference-structure contradictions"
```

---

### Task 3: Analyser — bound disjointness (catalogue class 10)

Single-edge interval checks: a comparator edge whose sides' bounds can never satisfy it, and a `sameAs` group whose members' bounds have an empty intersection. Intervals per type: number `[minValue, maxValue]`; text `[minLength, maxLength]`; categorical `[minSelected, maxSelected]`; datetime from DatePicker's absolute `parameters.min`/`max` converted to UTC day numbers (a `min` bound expands to its earliest day, a `max` bound to its latest, so coarse resolutions are treated conservatively — never rejected unless strictly disjoint). RelativeDatePicker windows are interview-date-relative and contribute nothing. **Deliberately not a transitive interval solver** — one edge at a time.

**Files:**

- Modify: `packages/protocol-validation/src/schemas/8/variables/validation-contradictions.ts`
- Test: `packages/protocol-validation/src/schemas/8/__tests__/validation-contradictions.test.ts`

**Interfaces:**

- Consumes: Task 2's `buildSameAsGroups`, `comparatorEdges`, `usableReference`.
- Produces: `disjointBoundsContradictions(variables)` (module-internal), folded into `findValidationContradictions`.

- [ ] **Step 1: Write the failing test**

Append to `validation-contradictions.test.ts`:

```ts
describe('findValidationContradictions — bound disjointness', () => {
  it('reports a comparator whose bounds are disjoint, stripping the comparator only', () => {
    const result = findValidationContradictions({
      a: {
        name: 'a',
        type: 'number',
        validation: { minValue: 10, lessThanVariable: 'b' },
      },
      b: { name: 'b', type: 'number', validation: { maxValue: 5 } },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.message).toBe(
      'Variable "a": lessThanVariable "b" can never be satisfied because their value ranges do not overlap',
    );
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'lessThanVariable' },
    ]);
  });

  it('treats touching bounds as infeasible for strict, feasible for non-strict', () => {
    const strict = findValidationContradictions({
      a: {
        name: 'a',
        type: 'number',
        validation: { maxValue: 5, greaterThanVariable: 'b' },
      },
      b: { name: 'b', type: 'number', validation: { minValue: 5 } },
    });
    expect(strict).toHaveLength(1);

    const nonStrict = findValidationContradictions({
      a: {
        name: 'a',
        type: 'number',
        validation: { maxValue: 5, greaterThanOrEqualToVariable: 'b' },
      },
      b: { name: 'b', type: 'number', validation: { minValue: 5 } },
    });
    expect(nonStrict).toEqual([]);
  });

  it('reports a sameAs group with no shared value, stripping its sameAs rules', () => {
    const result = findValidationContradictions({
      a: {
        name: 'a',
        type: 'number',
        validation: { maxValue: 5, sameAs: 'b' },
      },
      b: { name: 'b', type: 'number', validation: { minValue: 10 } },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.message).toBe(
      'Variables "a", "b" are joined by sameAs but their rules leave no value they can share',
    );
    expect(result[0]?.strips).toEqual([{ variableId: 'a', rule: 'sameAs' }]);
  });

  it('intersects text length ranges across a sameAs group', () => {
    const result = findValidationContradictions({
      a: { name: 'a', type: 'text', validation: { maxLength: 3, sameAs: 'b' } },
      b: { name: 'b', type: 'text', validation: { minLength: 10 } },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
  });

  it('compares datetime windows across a comparator edge', () => {
    const disjoint = findValidationContradictions({
      a: {
        name: 'a',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', max: '2020' },
        validation: { greaterThanVariable: 'b' },
      },
      b: {
        name: 'b',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', min: '2021' },
      },
    });
    expect(disjoint).toHaveLength(1);
    expect(disjoint[0]?.class).toBe('disjointBounds');

    // Same year at year resolution: expands to Jan 1 vs Dec 31, so a strict
    // comparison is conservatively considered satisfiable.
    const overlapping = findValidationContradictions({
      a: {
        name: 'a',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', max: '2020' },
        validation: { greaterThanVariable: 'b' },
      },
      b: {
        name: 'b',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', min: '2020' },
      },
    });
    expect(overlapping).toEqual([]);
  });

  it('does not double-report edges touching an already-empty sameAs group', () => {
    const result = findValidationContradictions({
      a: {
        name: 'a',
        type: 'number',
        validation: { maxValue: 5, sameAs: 'b', lessThanVariable: 'c' },
      },
      b: { name: 'b', type: 'number', validation: { minValue: 10 } },
      c: { name: 'c', type: 'number', validation: { maxValue: 0 } },
    });
    expect(result.map((c) => c.class)).toEqual(['disjointBounds']);
  });

  it('accepts unbounded and overlapping ranges', () => {
    expect(
      findValidationContradictions({
        a: {
          name: 'a',
          type: 'number',
          validation: { minValue: 0, lessThanVariable: 'b' },
        },
        b: { name: 'b', type: 'number', validation: { maxValue: 100 } },
        c: { name: 'c', type: 'scalar', validation: { lessThanVariable: 'd' } },
        d: { name: 'd', type: 'scalar' },
      }),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8/__tests__/validation-contradictions.test.ts`
Expected: FAIL — new describe block (disjointness not yet implemented).

- [ ] **Step 3: Write the implementation**

Add to `validation-contradictions.ts` (below `referenceStructureContradictions`):

```ts
type Interval = { min?: number; max?: number };

const DATE_PART_PATTERN = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/;

/**
 * A date bound as a UTC day number. A partial date expands to its earliest
 * day for a `min` bound and its latest for a `max` bound, so coarse
 * resolutions are compared conservatively.
 */
const dayNumber = (value: string, edge: 'min' | 'max'): number | undefined => {
  const match = DATE_PART_PATTERN.exec(value);
  if (!match?.[1]) return undefined;
  const year = Number(match[1]);
  const month =
    match[2] !== undefined ? Number(match[2]) : edge === 'min' ? 1 : 12;
  // Day 0 of the following month is the last day of `month`.
  const day =
    match[3] !== undefined
      ? Number(match[3])
      : edge === 'min'
        ? 1
        : new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

const dateWindowInterval = (variable: unknown): Interval | undefined => {
  const record = asRecord(variable);
  // RelativeDatePicker windows are anchored to the interview date and
  // contribute no static bounds.
  if (!record || record.component === 'RelativeDatePicker') return undefined;
  const parameters = asRecord(record.parameters);
  if (!parameters) return undefined;
  const min =
    typeof parameters.min === 'string'
      ? dayNumber(parameters.min, 'min')
      : undefined;
  const max =
    typeof parameters.max === 'string'
      ? dayNumber(parameters.max, 'max')
      : undefined;
  if (min === undefined && max === undefined) return undefined;
  return { min, max };
};

const intervalOf = (variable: unknown): Interval | undefined => {
  switch (typeOf(variable)) {
    case 'number':
      return {
        min: numberRule(variable, 'minValue'),
        max: numberRule(variable, 'maxValue'),
      };
    case 'text':
      return {
        min: numberRule(variable, 'minLength'),
        max: numberRule(variable, 'maxLength'),
      };
    case 'categorical':
      return {
        min: numberRule(variable, 'minSelected'),
        max: numberRule(variable, 'maxSelected'),
      };
    case 'datetime':
      return dateWindowInterval(variable);
    default:
      return undefined;
  }
};

const intersect = (
  a: Interval | undefined,
  b: Interval | undefined,
): Interval | undefined => {
  if (!a) return b;
  if (!b) return a;
  return {
    min:
      a.min === undefined
        ? b.min
        : b.min === undefined
          ? a.min
          : Math.max(a.min, b.min),
    max:
      a.max === undefined
        ? b.max
        : b.max === undefined
          ? a.max
          : Math.min(a.max, b.max),
  };
};

const isEmptyInterval = (interval: Interval | undefined): boolean =>
  interval?.min !== undefined &&
  interval.max !== undefined &&
  interval.min > interval.max;

function disjointBoundsContradictions(
  variables: UnknownRecord,
): ValidationContradiction[] {
  const found: ValidationContradiction[] = [];
  const { groupOf, membersOf } = buildSameAsGroups(variables);

  const groupIntervals = new Map<string, Interval | undefined>();
  for (const [group, members] of membersOf) {
    let interval: Interval | undefined;
    for (const member of members) {
      interval = intersect(interval, intervalOf(variables[member]));
    }
    groupIntervals.set(group, interval);

    if (members.length > 1 && isEmptyInterval(interval)) {
      const strips = members
        .filter(
          (member) => usableReference(variables, member, 'sameAs') !== undefined,
        )
        .map(
          (member): VariableRuleRef => ({
            variableId: member,
            rule: 'sameAs',
          }),
        );
      const [first, ...rest] = strips;
      if (!first) continue;
      const names = members.map(
        (member) => `"${nameOf(member, variables[member])}"`,
      );
      found.push({
        class: 'disjointBounds',
        message: `Variables ${names.join(', ')} are joined by sameAs but their rules leave no value they can share`,
        variableIds: members,
        strips: [first, ...rest],
      });
    }
  }

  for (const edge of comparatorEdges(variables)) {
    const upperGroup = groupOf.get(edge.upper);
    const lowerGroup = groupOf.get(edge.lower);
    if (
      upperGroup === undefined ||
      lowerGroup === undefined ||
      upperGroup === lowerGroup
    ) {
      continue;
    }
    const upperInterval = groupIntervals.get(upperGroup);
    const lowerInterval = groupIntervals.get(lowerGroup);
    // An already-empty group is reported above; its sameAs strips resolve it
    // first, so edges touching it are not judged against nonsense bounds.
    if (isEmptyInterval(upperInterval) || isEmptyInterval(lowerInterval)) {
      continue;
    }
    if (upperInterval?.max === undefined || lowerInterval?.min === undefined) {
      continue;
    }
    const infeasible = edge.strict
      ? upperInterval.max <= lowerInterval.min
      : upperInterval.max < lowerInterval.min;
    if (!infeasible) continue;
    const [first, ...rest] = edge.sources;
    if (!first) continue;
    const ownerName = nameOf(first.variableId, variables[first.variableId]);
    const otherId = first.variableId === edge.upper ? edge.lower : edge.upper;
    found.push({
      class: 'disjointBounds',
      message: `Variable "${ownerName}": ${first.rule} "${nameOf(otherId, variables[otherId])}" can never be satisfied because their value ranges do not overlap`,
      variableIds: [edge.upper, edge.lower],
      strips: [first, ...rest],
    });
  }

  return found;
}
```

Update the entry point:

```ts
export function findValidationContradictions(
  variables: UnknownRecord,
): ValidationContradiction[] {
  return [
    ...localContradictions(variables),
    ...referenceStructureContradictions(variables),
    ...disjointBoundsContradictions(variables),
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8/__tests__/validation-contradictions.test.ts`
Expected: PASS (all three describe blocks).

- [ ] **Step 5: Commit**

```bash
eval "$(fnm env)" && git add -A packages/protocol-validation/src && git commit -m "feat(protocol-validation): detect disjoint-bound contradictions"
```

---

### Task 4: Schema wiring — record-level superRefine + package export

Wire the analyser into the three variables record schemas (the `rejectEgoUnique` slot) and export it from the package entry for Architect. Classes 1–4 and 7–10 live **only** here — no per-variable-schema duplication.

**Files:**

- Modify: `packages/protocol-validation/src/schemas/8/variables/variable.ts` (the `VariablesSchema`/`EdgeVariablesSchema`/`EgoVariablesSchema` definitions at the bottom of the file)
- Modify: `packages/protocol-validation/src/index.ts`
- Test: `packages/protocol-validation/src/schemas/8/__tests__/validation-contradictions.test.ts`

**Interfaces:**

- Consumes: `findValidationContradictions` (Task 1–3).
- Produces: `@codaco/protocol-validation` exports `findValidationContradictions` and `type ValidationContradiction` (Architect Tasks 11–14 import these).

- [ ] **Step 1: Write the failing test**

Append to `validation-contradictions.test.ts`:

```ts
import {
  EgoVariablesSchema,
  VariablesSchema,
} from '../variables/variable.ts';

describe('record schema conformance — contradiction refinement', () => {
  it('rejects a node variables record with inverted bounds, anchored at the offending rule', () => {
    const result = VariablesSchema.safeParse({
      a: {
        name: 'age',
        type: 'number',
        component: 'Number',
        validation: { minValue: 10, maxValue: 2 },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((candidate) =>
        candidate.message.includes('minValue (10) is greater than maxValue (2)'),
      );
      expect(issue?.path).toEqual(['a', 'validation', 'minValue']);
    }
  });

  it('rejects an ego variables record with a strict comparator cycle', () => {
    const result = EgoVariablesSchema.safeParse({
      a: {
        name: 'start',
        type: 'number',
        component: 'Number',
        validation: { greaterThanVariable: 'b' },
      },
      b: {
        name: 'end',
        type: 'number',
        component: 'Number',
        validation: { greaterThanVariable: 'a' },
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts the same constraint stated from both sides', () => {
    const result = VariablesSchema.safeParse({
      a: {
        name: 'start',
        type: 'number',
        component: 'Number',
        validation: { lessThanVariable: 'b' },
      },
      b: {
        name: 'end',
        type: 'number',
        component: 'Number',
        validation: { greaterThanVariable: 'a' },
      },
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8/__tests__/validation-contradictions.test.ts`
Expected: FAIL — the two reject cases parse successfully (no refinement wired yet).

- [ ] **Step 3: Wire the refinement**

In `packages/protocol-validation/src/schemas/8/variables/variable.ts`, add the import:

```ts
import { findValidationContradictions } from './validation-contradictions.ts';
```

Add the adapter next to `rejectEgoUnique`:

```ts
// Contradictory validation-rule combinations (inverted bounds, impossible
// reference structures, disjoint bounds) are rejected at the record level —
// the analyser needs every sibling variable in scope. The v7→v8 migration
// strips the same combinations from existing protocols.
const rejectValidationContradictions = (
  variables: VariablesRecord,
  ctx: z.RefinementCtx,
) => {
  for (const contradiction of findValidationContradictions(variables)) {
    const anchor = contradiction.strips[0];
    ctx.addIssue({
      code: 'custom' as const,
      message: contradiction.message,
      path: [anchor.variableId, 'validation', anchor.rule],
    });
  }
};
```

Chain it onto all three record schemas:

```ts
export const VariablesSchema = z
  .record(VariableNameSchema, VariableSchema)
  .superRefine(checkDuplicateVariableNames)
  .superRefine(rejectEncryptedOnNonTextNode)
  .superRefine(rejectValidationContradictions);

export const EdgeVariablesSchema = z
  .record(VariableNameSchema, VariableSchema)
  .superRefine(checkDuplicateVariableNames)
  .superRefine(rejectEncrypted('Edge'))
  .superRefine(rejectValidationContradictions);

export const EgoVariablesSchema = z
  .record(VariableNameSchema, VariableSchema)
  .superRefine(checkDuplicateVariableNames)
  .superRefine(rejectEncrypted('Ego'))
  .superRefine(rejectEgoUnique)
  .superRefine(rejectValidationContradictions);
```

In `packages/protocol-validation/src/index.ts`, add to the existing export block style (imported symbols re-exported at the bottom is the file's pattern for values; a direct named export is fine and simpler here):

```ts
export {
  findValidationContradictions,
  type ValidationContradiction,
} from './schemas/8/variables/validation-contradictions.ts';
```

- [ ] **Step 4: Run the full package test suite**

Run: `pnpm --filter @codaco/protocol-validation test`
Expected: PASS. If `all-interfaces-fixture.test.ts` or any schema test fails, a bundled protocol or fixture carries a real contradiction — inspect the failure; fixing the fixture belongs to Task 10, but note it now.

- [ ] **Step 5: Commit**

```bash
eval "$(fnm env)" && git add -A packages/protocol-validation/src && git commit -m "feat(protocol-validation): reject contradictory validation rules at the record level"
```

---

### Task 5: R1 — absolute floors on count-valued rules

`minLength ≥ 0`, `maxLength ≥ 1`, `minSelected ≥ 0`, `maxSelected ≥ 1`, directly on the field schemas. `minValue`/`maxValue` untouched (negative numbers are a legitimate domain).

**Files:**

- Modify: `packages/protocol-validation/src/schemas/8/variables/validation.ts:8-14`
- Test: `packages/protocol-validation/src/schemas/8/__tests__/validation-contradictions.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `validation-contradictions.test.ts` (the `VariableSchema` import joins the existing `../variables/variable.ts` import):

```ts
import { VariableSchema } from '../variables/variable.ts';

describe('R1 — absolute floors on count-valued rules', () => {
  it('rejects maxLength 0 and negative minLength', () => {
    expect(
      VariableSchema.safeParse({
        name: 'first_name',
        type: 'text',
        component: 'Text',
        validation: { maxLength: 0 },
      }).success,
    ).toBe(false);
    expect(
      VariableSchema.safeParse({
        name: 'first_name',
        type: 'text',
        component: 'Text',
        validation: { minLength: -1 },
      }).success,
    ).toBe(false);
  });

  it('rejects maxSelected 0 and negative minSelected', () => {
    const categorical = (validation: Record<string, number>) => ({
      name: 'colors',
      type: 'categorical',
      component: 'CheckboxGroup',
      options: [
        { label: 'Red', value: 'red' },
        { label: 'Blue', value: 'blue' },
      ],
      validation,
    });
    expect(VariableSchema.safeParse(categorical({ maxSelected: 0 })).success).toBe(false);
    expect(VariableSchema.safeParse(categorical({ minSelected: -1 })).success).toBe(false);
  });

  it('accepts the floor values themselves and negative minValue/maxValue', () => {
    expect(
      VariableSchema.safeParse({
        name: 'first_name',
        type: 'text',
        component: 'Text',
        validation: { minLength: 0, maxLength: 1 },
      }).success,
    ).toBe(true);
    expect(
      VariableSchema.safeParse({
        name: 'temperature',
        type: 'number',
        component: 'Number',
        validation: { minValue: -40, maxValue: -1 },
      }).success,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8/__tests__/validation-contradictions.test.ts`
Expected: FAIL — the reject cases currently parse.

- [ ] **Step 3: Add the floors**

In `packages/protocol-validation/src/schemas/8/variables/validation.ts`, change the four fields:

```ts
  minLength: z.number().int().min(0).optional(),

  maxLength: z.number().int().min(1).optional(),
  minValue: z.number().int().optional(),
  maxValue: z.number().int().optional(),
  minSelected: z.number().int().min(0).optional(),
  maxSelected: z.number().int().min(1).optional(),
```

(Only `minLength`, `maxLength`, `minSelected`, `maxSelected` gain `.min()`; the blank line after `minLength` is existing formatting.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/protocol-validation test`
Expected: PASS (full suite — floors must not break existing fixtures; a failure here is a real finding for Task 10).

- [ ] **Step 5: Commit**

```bash
eval "$(fnm env)" && git add -A packages/protocol-validation/src && git commit -m "feat(protocol-validation): absolute floors on count-valued validation rules"
```

---

### Task 6: R2 — reference targets must match the source variable's type

Extends the existing reference pass. A validation-reference hit is recognised by its path shape (`[..., 'variables', <sourceId>, 'validation', <rule>]`); the source and target both live in the same subject's variables, so both resolve through `getVariablesForSubject`.

**Files:**

- Modify: `packages/protocol-validation/src/utils/validateEntityAttributeReferences.ts`
- Test: `packages/protocol-validation/src/schemas/8/__tests__/validation-contradictions.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `validation-contradictions.test.ts`:

```ts
import { createBaseProtocol } from '../../../utils/test-utils.ts';
import ProtocolSchemaV8 from '../schema.ts';

describe('R2 — reference target type must equal the source type', () => {
  const protocolWith = (
    variables: Record<string, Record<string, unknown>>,
  ): Record<string, unknown> => {
    const protocol = structuredClone(createBaseProtocol()) as Record<
      string,
      unknown
    > & {
      codebook: {
        node: { person: { variables: Record<string, unknown> } };
      };
    };
    // Merge rather than replace: the base protocol's stages reference
    // existing person variables (e.g. the Sociogram's layout variable), and
    // severing those references would fail the parse for unrelated reasons.
    protocol.codebook.node.person.variables = {
      ...protocol.codebook.node.person.variables,
      ...variables,
    };
    return protocol;
  };

  it('rejects sameAs referencing a differently-typed variable', () => {
    const result = ProtocolSchemaV8.safeParse(
      protocolWith({
        a: {
          name: 'first_name',
          type: 'text',
          component: 'Text',
          validation: { sameAs: 'b' },
        },
        b: { name: 'age', type: 'number', component: 'Number' },
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('must reference another text variable'),
        ),
      ).toBe(true);
    }
  });

  it('accepts a comparator referencing a same-typed variable', () => {
    const result = ProtocolSchemaV8.safeParse(
      protocolWith({
        a: {
          name: 'start_age',
          type: 'number',
          component: 'Number',
          validation: { lessThanVariable: 'b' },
        },
        b: { name: 'end_age', type: 'number', component: 'Number' },
      }),
    );
    expect(result.success).toBe(true);
  });
});
```

Note: the `structuredClone` + typed intersection avoids `as`-asserting individual mutations; if the intersection type fights the actual `createBaseProtocol` return type, follow the file's existing test conventions for protocol mutation. The chosen variable keys (`a`, `b`) must not collide with existing `person` variable ids — check `test-utils.ts` and rename if they do.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8/__tests__/validation-contradictions.test.ts`
Expected: FAIL — the cross-type sameAs currently parses (only existence is checked).

- [ ] **Step 3: Extend validateReferences**

In `packages/protocol-validation/src/utils/validateEntityAttributeReferences.ts`, add the import:

```ts
import { VARIABLE_REFERENCE_VALIDATIONS } from '../schemas/8/variables/validation.ts';
```

Add above `validateReferences`:

```ts
const VALIDATION_REFERENCE_RULES = new Set<string>(
  VARIABLE_REFERENCE_VALIDATIONS,
);
```

Inside the `for (const hit of hits)` loop, after the existing `requireType` block (still inside the loop):

```ts
    // A validation reference (sameAs, differentFrom, the comparators) must
    // target a variable of the same type as its source. The hit's path shape
    // identifies these: [..., 'variables', <sourceId>, 'validation', <rule>].
    const rule = hit.path[hit.path.length - 1];
    const sourceId = hit.path[hit.path.length - 3];
    if (
      hit.path[hit.path.length - 2] === 'validation' &&
      typeof rule === 'string' &&
      VALIDATION_REFERENCE_RULES.has(rule) &&
      typeof sourceId === 'string'
    ) {
      const subjectVariables = getVariablesForSubject(codebook, hit.subject);
      const source = subjectVariables[sourceId];
      const target = subjectVariables[hit.variableId];
      if (source && target && source.type !== target.type) {
        issues.push({
          code: 'custom',
          message: `The "${rule}" rule on variable "${source.name}" must reference another ${source.type} variable, but "${target.name}" is ${target.type}`,
          path: hit.path,
        });
      }
    }
```

- [ ] **Step 4: Run the full package suite**

Run: `pnpm --filter @codaco/protocol-validation test`
Expected: PASS. The comparators' existing `requireType: ['number', 'datetime', 'scalar']` check is unchanged; this adds equality on top.

- [ ] **Step 5: Commit**

```bash
eval "$(fnm env)" && git add -A packages/protocol-validation/src && git commit -m "feat(protocol-validation): require same-typed validation reference targets"
```

---

### Task 7: DatePicker parameters refinement (catalogue class 5)

`min`/`max` must be real calendar dates written **exactly at the picker's resolution** (`yyyy`, `yyyy-MM`, `yyyy-MM-dd` per `parameters.type`, default `full`), and `min ≤ max`. Mirrors the sibling RelativeDatePicker refinement in the same file. Equal-resolution date strings compare correctly as plain strings.

**Files:**

- Modify: `packages/protocol-validation/src/schemas/8/variables/variable.ts:141-169` (`dateTimeDatePickerSchema` and the `isIsoDate` helper)
- Test: `packages/protocol-validation/src/schemas/8/__tests__/validation-contradictions.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `validation-contradictions.test.ts`:

```ts
describe('DatePicker parameters refinement', () => {
  const datePicker = (parameters: Record<string, string>) => ({
    name: 'birth_date',
    type: 'datetime',
    component: 'DatePicker',
    parameters,
  });

  it('rejects a bound finer than the picker resolution', () => {
    expect(
      VariableSchema.safeParse(datePicker({ type: 'year', min: '2020-05-03' }))
        .success,
    ).toBe(false);
  });

  it('rejects a bound coarser than the picker resolution', () => {
    expect(
      VariableSchema.safeParse(datePicker({ type: 'full', min: '2020' }))
        .success,
    ).toBe(false);
  });

  it('rejects impossible calendar dates and months', () => {
    expect(
      VariableSchema.safeParse(datePicker({ min: '2020-02-31' })).success,
    ).toBe(false);
    expect(
      VariableSchema.safeParse(datePicker({ type: 'month', max: '2020-13' }))
        .success,
    ).toBe(false);
  });

  it('rejects min after max', () => {
    const result = VariableSchema.safeParse(
      datePicker({ type: 'month', min: '2021-06', max: '2020-01' }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('"min" must not be after "max"'),
        ),
      ).toBe(true);
    }
  });

  it('accepts bounds at the exact resolution, including equal bounds', () => {
    expect(
      VariableSchema.safeParse(
        datePicker({ type: 'year', min: '1990', max: '2020' }),
      ).success,
    ).toBe(true);
    expect(
      VariableSchema.safeParse(
        datePicker({ min: '2020-01-15', max: '2020-01-15' }),
      ).success,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8/__tests__/validation-contradictions.test.ts`
Expected: FAIL — all reject cases currently parse (parameters are unconstrained strings).

- [ ] **Step 3: Write the refinement**

In `variable.ts`, move the existing `isIsoDate` helper (lines 154–169) **above** `dateTimeDatePickerSchema` and add below it:

```ts
const DATE_RESOLUTION = {
  full: { label: 'YYYY-MM-DD', pattern: /^\d{4}-\d{2}-\d{2}$/ },
  month: { label: 'YYYY-MM', pattern: /^\d{4}-\d{2}$/ },
  year: { label: 'YYYY', pattern: /^\d{4}$/ },
} as const;

const isValidDateAtResolution = (
  value: string,
  resolution: keyof typeof DATE_RESOLUTION,
): boolean => {
  if (!DATE_RESOLUTION[resolution].pattern.test(value)) return false;
  if (resolution === 'year') return true;
  if (resolution === 'month') {
    const month = Number(value.slice(5, 7));
    return month >= 1 && month <= 12;
  }
  return isIsoDate(value);
};
```

Then chain a `.superRefine` onto the DatePicker `parameters` object (matching the RelativeDatePicker pattern in the same file):

```ts
  parameters: z
    .strictObject({
      type: z.enum(['full', 'month', 'year']).optional(),
      min: z.string().optional(),
      max: z.string().optional(),
    })
    .superRefine((parameters, ctx) => {
      const resolution = parameters.type ?? 'full';
      const { label } = DATE_RESOLUTION[resolution];
      for (const bound of ['min', 'max'] as const) {
        const value = parameters[bound];
        if (value !== undefined && !isValidDateAtResolution(value, resolution)) {
          ctx.addIssue({
            code: 'custom' as const,
            message: `DatePicker "${bound}" must be a valid ${label} date matching the picker's resolution`,
            path: [bound],
          });
        }
      }
      if (
        parameters.min !== undefined &&
        parameters.max !== undefined &&
        isValidDateAtResolution(parameters.min, resolution) &&
        isValidDateAtResolution(parameters.max, resolution) &&
        parameters.min > parameters.max
      ) {
        ctx.addIssue({
          code: 'custom' as const,
          message: 'DatePicker "min" must not be after "max"',
          path: ['max'],
        });
      }
    })
    .optional(),
```

- [ ] **Step 4: Run the full package suite**

Run: `pnpm --filter @codaco/protocol-validation test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
eval "$(fnm env)" && git add -A packages/protocol-validation/src && git commit -m "feat(protocol-validation): validate DatePicker min/max parameters"
```

---

### Task 8: Migration — DatePicker parameter and floor normalisation

A `traverseAndTransform` step in the existing v7→v8 migration: truncate finer-than-resolution DatePicker bounds (intent-preserving), strip coarser/malformed ones, strip both when `min > max`, and strip count-valued rules below the R1 floors. **Insert the step immediately after the scalar `minValue`/`maxValue` removal step** (the block ending near `migration.ts:1031`) so it sees post-repair state, and before the Sociogram `automaticLayout` step.

**Files:**

- Modify: `packages/protocol-validation/src/schemas/8/migration.ts`
- Test: `packages/protocol-validation/src/schemas/8/__tests__/migration.test.ts`

- [ ] **Step 1: Write the failing test**

Append a describe block inside the top-level `describe('Migration V7 to V8', ...)` in `migration.test.ts`, following the file's existing conventions (minimal v7 literal, `migrationV7toV8.migrate(v7Protocol, { name: 'Test Protocol' })`, property assertions, negative control):

```ts
  describe('DatePicker parameter and validation floor normalisation', () => {
    const migrateVariables = (variables: Record<string, unknown>) => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          ego: { variables },
        },
        stages: [],
      };
      const migrated = migrationV7toV8.migrate(
        v7Protocol as unknown as Protocol<7>,
        { name: 'Test Protocol' },
      ) as unknown as {
        codebook: { ego: { variables: Record<string, unknown> } };
      };
      return migrated.codebook.ego.variables;
    };

    it('truncates finer-than-resolution bounds and strips coarser ones', () => {
      const variables = migrateVariables({
        a: {
          name: 'year_picker',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'year', min: '2020-05-03', max: '2021' },
        },
        b: {
          name: 'full_picker',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { min: '2020', max: '2021-06-15' },
        },
      });
      expect(variables.a).toHaveProperty('parameters.min', '2020');
      expect(variables.a).toHaveProperty('parameters.max', '2021');
      expect(variables.b).not.toHaveProperty('parameters.min');
      expect(variables.b).toHaveProperty('parameters.max', '2021-06-15');
    });

    it('strips both bounds when min is after max, and malformed values', () => {
      const variables = migrateVariables({
        a: {
          name: 'window',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'month', min: '2021-06', max: '2020-01' },
        },
        b: {
          name: 'junk',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { min: 'not-a-date' },
        },
      });
      expect(variables.a).not.toHaveProperty('parameters.min');
      expect(variables.a).not.toHaveProperty('parameters.max');
      expect(variables.b).not.toHaveProperty('parameters.min');
    });

    it('leaves RelativeDatePicker parameters alone', () => {
      const variables = migrateVariables({
        a: {
          name: 'relative',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { anchor: '2020-05-03', before: 180 },
        },
      });
      expect(variables.a).toHaveProperty('parameters.anchor', '2020-05-03');
    });

    it('strips count-valued rules below their floors and keeps legal ones', () => {
      const variables = migrateVariables({
        a: {
          name: 'first_name',
          type: 'text',
          validation: { maxLength: 0, minLength: -2, required: true },
        },
        b: {
          name: 'last_name',
          type: 'text',
          validation: { minLength: 0, maxLength: 1 },
        },
      });
      expect(variables.a).not.toHaveProperty('validation.maxLength');
      expect(variables.a).not.toHaveProperty('validation.minLength');
      expect(variables.a).toHaveProperty('validation.required', true);
      expect(variables.b).toHaveProperty('validation.minLength', 0);
      expect(variables.b).toHaveProperty('validation.maxLength', 1);
    });
  });
```

(`Protocol` and `migrationV7toV8` are already imported at the top of `migration.test.ts`; the `as unknown as` protocol-literal casts follow this file's existing convention.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8/__tests__/migration.test.ts`
Expected: FAIL — the new describe block (no normalisation step exists).

- [ ] **Step 3: Write the migration step**

In `migration.ts`, add a helper near the existing `asRecord` (top of file):

```ts
const isValidCalendarDate = (
  value: string,
  resolution: 'full' | 'month' | 'year',
): boolean => {
  if (resolution === 'year') return true;
  const month = Number(value.slice(5, 7));
  if (month < 1 || month > 12) return false;
  if (resolution === 'month') return true;
  const year = Number(value.slice(0, 4));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};
```

Insert this step into the `traverseAndTransform` array **immediately after** the scalar `minValue`/`maxValue` removal step:

```ts
      {
        // DatePicker `min`/`max` must be real dates written exactly at the
        // picker's resolution with `min <= max`, and count-valued rules have
        // absolute floors (minLength/minSelected >= 0, maxLength/maxSelected
        // >= 1). Truncate finer-than-resolution date bounds — the extra
        // precision is authored intent — and strip anything else invalid.
        paths: [
          'codebook.node.*.variables',
          'codebook.edge.*.variables',
          'codebook.ego.variables',
        ],
        fn: <V>(variables: V) => {
          if (!variables || typeof variables !== 'object') return variables;
          const resolutionLength = { full: 10, month: 7, year: 4 } as const;
          const patterns = {
            full: /^\d{4}-\d{2}-\d{2}$/,
            month: /^\d{4}-\d{2}$/,
            year: /^\d{4}$/,
          } as const;
          const floors = {
            minLength: 0,
            maxLength: 1,
            minSelected: 0,
            maxSelected: 1,
          } as const;
          for (const variable of Object.values(
            variables as Record<string, unknown>,
          )) {
            const typedVariable = asRecord(variable);
            if (!typedVariable) continue;

            const validation = asRecord(typedVariable.validation);
            if (validation) {
              for (const [rule, floor] of Object.entries(floors)) {
                const value = validation[rule];
                if (typeof value === 'number' && value < floor) {
                  delete validation[rule];
                }
              }
            }

            if (typedVariable.type !== 'datetime') continue;
            if (typedVariable.component === 'RelativeDatePicker') continue;
            const parameters = asRecord(typedVariable.parameters);
            if (!parameters) continue;
            const resolution =
              parameters.type === 'month' || parameters.type === 'year'
                ? parameters.type
                : 'full';
            for (const bound of ['min', 'max'] as const) {
              const value = parameters[bound];
              if (value === undefined) continue;
              if (typeof value !== 'string') {
                delete parameters[bound];
                continue;
              }
              const truncated = value.slice(0, resolutionLength[resolution]);
              if (
                patterns[resolution].test(truncated) &&
                isValidCalendarDate(truncated, resolution)
              ) {
                parameters[bound] = truncated;
              } else {
                delete parameters[bound];
              }
            }
            if (
              typeof parameters.min === 'string' &&
              typeof parameters.max === 'string' &&
              parameters.min > parameters.max
            ) {
              delete parameters.min;
              delete parameters.max;
            }
          }
          return variables;
        },
      },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8/__tests__/migration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
eval "$(fnm env)" && git add -A packages/protocol-validation/src && git commit -m "feat(protocol-validation): migrate DatePicker bounds and rule floors"
```

---

### Task 9: Migration — cross-type and contradiction strips, plus notes

Two more pieces in the same migration, inserted **immediately after Task 8's step**: a pre-pass stripping cross-type references (R2's repair — the analyser deliberately ignores cross-type references, so they must go first), then a fixpoint loop applying the analyser's `strips` until no contradictions remain. Stripping only ever relaxes constraints, but a strip can change what the analyser reports next (a de-grouped variable regains its own bounds), hence the loop. Finally, the migration `notes` template gains lines describing all new behaviour (Tasks 8 + 9).

**Files:**

- Modify: `packages/protocol-validation/src/schemas/8/migration.ts`
- Test: `packages/protocol-validation/src/schemas/8/__tests__/migration.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside the top-level describe in `migration.test.ts` (reusing the `migrateVariables` helper shape from Task 8 — define a local copy in this describe block):

```ts
  describe('contradictory validation rule removal', () => {
    const migrateVariables = (variables: Record<string, unknown>) => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          ego: { variables },
        },
        stages: [],
      };
      const migrated = migrationV7toV8.migrate(
        v7Protocol as unknown as Protocol<7>,
        { name: 'Test Protocol' },
      ) as unknown as {
        codebook: { ego: { variables: Record<string, unknown> } };
      };
      return migrated.codebook.ego.variables;
    };

    it('strips both members of an inverted pair', () => {
      const variables = migrateVariables({
        a: {
          name: 'age',
          type: 'number',
          validation: { minValue: 10, maxValue: 2, required: true },
        },
      });
      expect(variables.a).not.toHaveProperty('validation.minValue');
      expect(variables.a).not.toHaveProperty('validation.maxValue');
      expect(variables.a).toHaveProperty('validation.required', true);
    });

    it('strips sameAs and differentFrom when they name one target', () => {
      const variables = migrateVariables({
        a: {
          name: 'a',
          type: 'text',
          validation: { sameAs: 'b', differentFrom: 'b' },
        },
        b: { name: 'b', type: 'text' },
      });
      expect(variables.a).not.toHaveProperty('validation.sameAs');
      expect(variables.a).not.toHaveProperty('validation.differentFrom');
    });

    it('strips the comparators forming a strict cycle, keeping bounds', () => {
      const variables = migrateVariables({
        a: {
          name: 'a',
          type: 'number',
          validation: { minValue: 0, greaterThanVariable: 'b' },
        },
        b: {
          name: 'b',
          type: 'number',
          validation: { greaterThanVariable: 'a' },
        },
      });
      expect(variables.a).not.toHaveProperty('validation.greaterThanVariable');
      expect(variables.b).not.toHaveProperty('validation.greaterThanVariable');
      expect(variables.a).toHaveProperty('validation.minValue', 0);
    });

    it('keeps sameAs when stripping a strict comparator inside its group', () => {
      const variables = migrateVariables({
        a: {
          name: 'a',
          type: 'number',
          validation: { sameAs: 'b', greaterThanVariable: 'b' },
        },
        b: { name: 'b', type: 'number' },
      });
      expect(variables.a).toHaveProperty('validation.sameAs', 'b');
      expect(variables.a).not.toHaveProperty('validation.greaterThanVariable');
    });

    it('strips validation references to a differently-typed variable', () => {
      const variables = migrateVariables({
        a: {
          name: 'a',
          type: 'text',
          validation: { sameAs: 'b', required: true },
        },
        b: { name: 'b', type: 'number' },
      });
      expect(variables.a).not.toHaveProperty('validation.sameAs');
      expect(variables.a).toHaveProperty('validation.required', true);
    });

    it('leaves coherent rules untouched (negative control)', () => {
      const variables = migrateVariables({
        a: {
          name: 'start',
          type: 'number',
          validation: { minValue: 0, maxValue: 10, lessThanVariable: 'b' },
        },
        b: {
          name: 'end',
          type: 'number',
          validation: { greaterThanVariable: 'a', maxValue: 100 },
        },
      });
      expect(variables.a).toHaveProperty('validation.minValue', 0);
      expect(variables.a).toHaveProperty('validation.maxValue', 10);
      expect(variables.a).toHaveProperty('validation.lessThanVariable', 'b');
      expect(variables.b).toHaveProperty('validation.greaterThanVariable', 'a');
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8/__tests__/migration.test.ts`
Expected: FAIL — contradictory rules survive migration.

- [ ] **Step 3: Write the migration step**

In `migration.ts`, add the import:

```ts
import { findValidationContradictions } from './variables/validation-contradictions.ts';
```

Insert this step **immediately after Task 8's step**:

```ts
      {
        // Strip contradictory validation-rule combinations per the
        // minimal-strip policy — the analyser names exactly the rules to
        // remove. Cross-type references go first (the analyser ignores them,
        // but the schema's reference pass rejects them). Stripping only
        // relaxes constraints, but a strip can change the next analysis (a
        // de-grouped variable regains its own bounds), so loop to a fixpoint.
        paths: [
          'codebook.node.*.variables',
          'codebook.edge.*.variables',
          'codebook.ego.variables',
        ],
        fn: <V>(variables: V) => {
          const typedVariables = asRecord(variables);
          if (!typedVariables) return variables;

          const referenceRules = [
            'sameAs',
            'differentFrom',
            'greaterThanVariable',
            'lessThanVariable',
            'greaterThanOrEqualToVariable',
            'lessThanOrEqualToVariable',
          ] as const;
          for (const variable of Object.values(typedVariables)) {
            const typedVariable = asRecord(variable);
            const validation = asRecord(typedVariable?.validation);
            if (!typedVariable || !validation) continue;
            for (const rule of referenceRules) {
              const target = validation[rule];
              if (typeof target !== 'string') continue;
              const targetVariable = asRecord(typedVariables[target]);
              // Dangling references are outside this step's scope; the
              // reference pass reports them as it always has.
              if (!targetVariable) continue;
              if (targetVariable.type !== typedVariable.type) {
                delete validation[rule];
              }
            }
          }

          for (let pass = 0; pass < 100; pass++) {
            const contradictions = findValidationContradictions(typedVariables);
            if (contradictions.length === 0) break;
            for (const contradiction of contradictions) {
              for (const strip of contradiction.strips) {
                const validation = asRecord(
                  asRecord(typedVariables[strip.variableId])?.validation,
                );
                if (validation) delete validation[strip.rule];
              }
            }
          }
          return variables;
        },
      },
```

- [ ] **Step 4: Add the notes lines**

Append to the migration's `notes` template string (before the closing backtick):

```
- Validation rules that contradict each other are removed so existing protocols stay valid under the new schema checks: inverted \`min\`/\`max\` pairs (both removed), \`minSelected\` above the option count, \`sameAs\` and \`differentFrom\` naming one target (both removed), comparator structures no value can satisfy — impossible cycles, comparisons inside a \`sameAs\` group, comparisons whose value ranges cannot overlap (the comparator is removed; value bounds are kept), \`sameAs\` groups whose bounds share no value (the \`sameAs\` rules are removed) — and validation references to a variable of a different type. Count-valued rules now have floors (\`minLength\`/\`minSelected\` at least 0, \`maxLength\`/\`maxSelected\` at least 1); values below them are removed.
- DatePicker \`min\`/\`max\` parameters must be real dates written exactly at the picker's resolution, with \`min\` not after \`max\`. Values with more precision than the resolution are truncated; other invalid values are removed.
```

- [ ] **Step 5: Run tests, then commit**

Run: `pnpm --filter @codaco/protocol-validation test`
Expected: PASS (full suite, including all migration tests).

```bash
eval "$(fnm env)" && git add -A packages/protocol-validation/src && git commit -m "feat(protocol-validation): strip contradictory validation rules in v7->v8 migration"
```

---

### Task 10: Corpus and bundled-protocol verification

The empirical check behind the "accept the gap" decision: no bundled protocol may carry a contradiction, and the real-protocol corpus tells us whether any protocol in the wild does. **Standing policy** (from the schema-audit history): if a real protocol fails under a new refinement, investigate case-by-case — do not drop the refinement.

**Files:**

- Possibly modify: protocol JSON sources under `packages/protocols/` (only if a bundled protocol carries a contradiction)

- [ ] **Step 1: Run the always-on fixture suite**

Run: `pnpm --filter @codaco/protocol-validation test`
Expected: PASS, including `src/__tests__/all-interfaces-fixture.test.ts` (validates `packages/protocols/e2e/all-interfaces/protocol.json`).

- [ ] **Step 2: Run the credentialed corpus**

The corpus test (`src/__tests__/validate-test-protocols.test.ts`) downloads ~90 real `.netcanvas` files and needs `GITHUB_TOKEN`, `PROTOCOL_ENCRYPTION_KEY`, `PROTOCOL_ENCRYPTION_IV` in `packages/protocol-validation/.env` (see `.env.example`); it silently skips without them.

Run: `pnpm --filter @codaco/protocol-validation test 2>&1 | tee /tmp/corpus-run.log` and check the corpus suite actually **ran** (it reports per-protocol results) rather than skipped. **If the credentials are not available in this environment, stop and ask the user to run it or supply them — do not report this task complete on a silently-skipped corpus.** Note the local-corpus-staleness trap: an old cached download can mask new failures; re-fetch if results look suspicious.

- [ ] **Step 3: Investigate any failure case-by-case**

For a v1–v7 protocol failing after migration: the migration strips are incomplete for that shape — fix the migration step (Task 8/9) and add a regression test. For an already-v8 protocol failing validation: this is the accepted gap — record the protocol name and the contradiction in the PR description so the maintainers can decide whether it needs an upstream fix; do not weaken the refinement.

- [ ] **Step 4: Validate bundled protocols and commit any fixes**

Run: `pnpm --filter @codaco/protocols test` (and `pnpm --filter @codaco/development-protocol test`, `pnpm --filter @codaco/sample-protocol test` if present — check each package.json for a test script; skip those without one).
If a bundled protocol carries a contradiction, fix its JSON source in `packages/protocols/` minimally (correct the rule rather than strip it — these are in-repo, authored protocols) and commit:

```bash
eval "$(fnm env)" && git add packages/protocols && git commit -m "fix(protocols): repair contradictory validation rules surfaced by new schema checks"
```

---

### Task 11: Architect — prospective-draft helper and plumbing

Architect needs the whole entity's variables (with their `validation` and `options`) to evaluate a draft, but the Validations component currently receives only same-typed variables stripped to `name`/`type`. This task adds a pure helper module and threads the full record + the edited variable's id down to the Validations component. No UI behaviour changes yet.

**Files:**

- Create: `apps/architect/src/components/Validations/contradictions.ts`
- Modify: `apps/architect/src/components/sections/Form/FieldFields.tsx:290-298` (the `ValidationSection` usage)
- Modify: `apps/architect/src/components/sections/ValidationSection.tsx`
- Modify: `apps/architect/src/components/Validations/index.tsx` (OuterProps)
- Modify: `apps/architect/src/components/Validations/withStoreState.tsx` (select draft `options`)
- Modify: `apps/architect/src/components/Validations/Validations.tsx` (accept new props, build `checkDraft`)
- Test: `apps/architect/src/components/Validations/__tests__/contradictions.test.ts`

**Interfaces:**

- Consumes: `findValidationContradictions`, `type ValidationContradiction` from `@codaco/protocol-validation` (Task 4's export).
- Produces (Tasks 12–14 rely on these):
  - `DRAFT_VARIABLE_ID: string` (placeholder id for a not-yet-created variable)
  - `type ProspectiveDraft = { allVariables: Record<string, unknown>; currentVariableId: string; variableType: string; validation: Record<string, unknown>; options?: unknown }`
  - `buildProspectiveVariables(draft: ProspectiveDraft): Record<string, unknown>`
  - `findDraftContradictions(draft: ProspectiveDraft): ValidationContradiction[]` — filtered to contradictions the edited variable participates in
  - Validations.tsx builds `checkDraft(ruleKey: string, ruleValue: unknown, replacingKey?: string): string[]` (messages) and passes it to each `Validation` row.

- [ ] **Step 1: Write the failing test**

Create `apps/architect/src/components/Validations/__tests__/contradictions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  buildProspectiveVariables,
  DRAFT_VARIABLE_ID,
  findDraftContradictions,
} from '../contradictions';

const numberVariable = (
  name: string,
  validation: Record<string, unknown> = {},
) => ({ name, type: 'number', validation });

describe('buildProspectiveVariables', () => {
  it('adds a new variable under the draft placeholder id', () => {
    const result = buildProspectiveVariables({
      allVariables: { a: numberVariable('a') },
      currentVariableId: '',
      variableType: 'number',
      validation: { minValue: 1 },
    });
    expect(result[DRAFT_VARIABLE_ID]).toMatchObject({
      type: 'number',
      validation: { minValue: 1 },
    });
    expect(result.a).toEqual(numberVariable('a'));
  });

  it('substitutes the edited variable, keeping its other properties', () => {
    const result = buildProspectiveVariables({
      allVariables: { a: { ...numberVariable('a'), readOnly: true } },
      currentVariableId: 'a',
      variableType: 'number',
      validation: { minValue: 1 },
    });
    expect(result.a).toMatchObject({
      readOnly: true,
      validation: { minValue: 1 },
    });
  });
});

describe('findDraftContradictions', () => {
  it('reports a contradiction the draft introduces', () => {
    const result = findDraftContradictions({
      allVariables: {},
      currentVariableId: '',
      variableType: 'number',
      validation: { minValue: 10, maxValue: 2 },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.message).toContain('is greater than');
  });

  it('reports a contradiction whose offending rule lives on another variable', () => {
    // Editing b's maxValue below a's minimum makes a's comparator impossible.
    const result = findDraftContradictions({
      allVariables: {
        a: numberVariable('a', { minValue: 10, lessThanVariable: 'b' }),
        b: numberVariable('b'),
      },
      currentVariableId: 'b',
      variableType: 'number',
      validation: { maxValue: 5 },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
  });

  it('ignores pre-existing contradictions between other variables', () => {
    const result = findDraftContradictions({
      allVariables: {
        a: numberVariable('a', { minValue: 10, maxValue: 2 }),
        b: numberVariable('b'),
      },
      currentVariableId: 'b',
      variableType: 'number',
      validation: { required: true },
    });
    expect(result).toEqual([]);
  });

  it('checks minSelected against draft options', () => {
    const result = findDraftContradictions({
      allVariables: {},
      currentVariableId: '',
      variableType: 'categorical',
      validation: { minSelected: 3 },
      options: [
        { label: 'Red', value: 'red' },
        { label: 'Blue', value: 'blue' },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('minSelectedExceedsOptions');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/architect exec vitest run src/components/Validations/__tests__/contradictions.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the helper**

Create `apps/architect/src/components/Validations/contradictions.ts`:

```ts
import {
  findValidationContradictions,
  type ValidationContradiction,
} from '@codaco/protocol-validation';

type UnknownRecord = Record<string, unknown>;

export const DRAFT_VARIABLE_ID = '__draft-variable__';

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type ProspectiveDraft = {
  /** Every variable of the owning entity, keyed by id, from the codebook. */
  allVariables: UnknownRecord;
  /** Codebook id of the variable being edited; '' while creating a new one. */
  currentVariableId: string;
  variableType: string;
  /** The rule map as it would be committed. */
  validation: UnknownRecord;
  /** Draft options for ordinal/categorical variables, from form state. */
  options?: unknown;
};

export const buildProspectiveVariables = ({
  allVariables,
  currentVariableId,
  variableType,
  validation,
  options,
}: ProspectiveDraft): UnknownRecord => {
  const id = currentVariableId || DRAFT_VARIABLE_ID;
  const existing = allVariables[id];
  const base = isRecord(existing)
    ? existing
    : { name: 'this variable', type: variableType };
  return {
    ...allVariables,
    [id]: {
      ...base,
      type: variableType,
      validation,
      ...(options !== undefined ? { options } : {}),
    },
  };
};

/**
 * Contradictions a draft would introduce, restricted to those the edited
 * variable participates in — pre-existing conflicts between other variables
 * are not this editor's to report.
 */
export const findDraftContradictions = (
  draft: ProspectiveDraft,
): ValidationContradiction[] => {
  const id = draft.currentVariableId || DRAFT_VARIABLE_ID;
  return findValidationContradictions(buildProspectiveVariables(draft)).filter(
    (contradiction) => contradiction.variableIds.includes(id),
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/architect exec vitest run src/components/Validations/__tests__/contradictions.test.ts`
Expected: PASS.

- [ ] **Step 5: Thread the props**

1. `FieldFields.tsx` — extend the `ValidationSection` usage:

```tsx
      <ValidationSection
        form={form}
        disabled={!variableType}
        entity={entity ?? ''}
        variableType={
          typeof variableType === 'string' ? variableType : undefined
        }
        existingVariables={omit(existingVariables, variable)}
        allVariables={existingVariables}
        currentVariableId={typeof variable === 'string' ? variable : ''}
      />
```

2. `ValidationSection.tsx` — add to `ValidationSectionProps` and pass through to `<Validations>` unchanged:

```ts
  allVariables: Record<string, Variable>;
  currentVariableId: string;
```

```tsx
      <Validations
        form={form}
        name="validation"
        variableType={variableType}
        entity={entity}
        existingVariables={existingVariablesForType}
        allVariables={allVariables}
        currentVariableId={currentVariableId}
      />
```

3. `Validations/index.tsx` — add the same two fields to `OuterProps` (optional with defaults, since `AnonymisationValidation.tsx` mounts Validations without them):

```ts
  allVariables?: Record<string, Pick<Variable, 'name' | 'type'>>;
  currentVariableId?: string;
```

4. `withStoreState.tsx` — add to the returned props:

```ts
    draftOptions: formValueSelector(form)(state, 'options') as unknown,
```

(If the selector's return type is already `unknown`-compatible without the assertion, drop it — no `as` where avoidable.)

5. `Validations.tsx` — extend `ValidationsProps` with `variableType?: string`, `allVariables?: Record<string, Pick<Variable, 'name' | 'type'>>`, `currentVariableId?: string`, `draftOptions?: unknown`, and build `checkDraft`:

```ts
import { findDraftContradictions } from './contradictions';
```

```ts
  const checkDraft = useMemo(
    () =>
      (ruleKey: string, ruleValue: unknown, replacingKey?: string): string[] => {
        const prospective: Record<string, unknown> = { ...value };
        if (replacingKey && replacingKey !== ruleKey) {
          delete prospective[replacingKey];
        }
        prospective[ruleKey] = ruleValue;
        // The Anonymisation passphrase is not a codebook variable; a text
        // surrogate lets the local length-pair check still apply.
        const isPassphrase = variableType === 'passphrase';
        return findDraftContradictions({
          allVariables: isPassphrase ? {} : (allVariables ?? {}),
          currentVariableId: currentVariableId ?? '',
          variableType: isPassphrase ? 'text' : (variableType ?? ''),
          validation: prospective,
          options: draftOptions,
        }).map((contradiction) => contradiction.message);
      },
    [value, allVariables, currentVariableId, variableType, draftOptions],
  );
```

Pass `checkDraft={checkDraft}` on the `<Field>` (so rows receive it through the existing `{...rest}` spread) **and** on the add-new `<Validation>` child.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm --filter @codaco/architect typecheck`
Expected: PASS (the new props are accepted but unused by `Validation.tsx` until Task 12 — if the unused-prop lint objects, Task 12 consumes it; commit both tasks together in that case).

```bash
eval "$(fnm env)" && git add -A apps/architect/src && git commit -m "feat(architect): thread entity variables into the validations editor"
```

---

### Task 12: Architect — row-save gating, inline errors, picker filtering

The interactive UX: a contradictory draft cannot be ticked and says why; reference pickers only offer targets that would not create a contradiction; a reference rule with no legal target left is disabled in the rule dropdown. This task's behavioural test is the e2e spec in Task 15 (the logic is React component wiring; the analyser itself is already unit-tested).

**Files:**

- Modify: `apps/architect/src/components/Validations/Validation.tsx`
- Modify: `apps/architect/src/components/Validations/Validations.tsx`

- [ ] **Step 1: Gate the row save and render the reason**

In `Validation.tsx`:

- Add to `ValidationProps`: `checkDraft?: (key: string, value: unknown, replacingKey?: string) => string[];`
- Add imports: `import { useId } from 'react';` (extend the existing react import) and `import FieldErrors from '@codaco/fresco-ui/form/FieldErrors';`
- Inside the component (after the draft state declarations):

```ts
  const draftIssues =
    checkDraft && draftKey && isDraftComplete(draftKey, draftValue)
      ? checkDraft(draftKey, draftValue, itemKey || undefined)
      : [];
  const draftIssuesId = useId();
```

- Harden `handleSave`:

```ts
  const handleSave = () => {
    if (!isDraftComplete(draftKey, draftValue) || draftIssues.length > 0) {
      return;
    }
    onUpdate(draftKey, draftValue, itemKey);
    onCancel();
  };
```

- Disable the tick: `disabled={!isDraftComplete(draftKey, draftValue) || draftIssues.length > 0}`
- Render the reason inside the editing row, after the `MULTI_SELECT_OPTIONS_CLASSES` div's children (as a sibling of the two option divs, spanning the row):

```tsx
        {draftIssues.length > 0 && (
          <FieldErrors id={draftIssuesId} errors={draftIssues} show />
        )}
```

- [ ] **Step 2: Filter reference-target candidates**

Still in `Validation.tsx`, replace the plain `existingVariableOptions` usage for list-valued rules:

```ts
  const existingVariableOptions = map(
    existingVariables,
    (variableValue, variableKey) => ({
      label: variableValue.name,
      value: variableKey,
    }),
  );
  // Offer only targets that would not create a contradiction. The currently
  // selected target stays offered so an existing (legal) rule renders intact.
  const referenceTargetOptions =
    checkDraft && draftKey && isValidationWithListValue(draftKey)
      ? existingVariableOptions.filter(
          (option) =>
            option.value === draftValue ||
            checkDraft(draftKey, option.value, itemKey || undefined).length ===
              0,
        )
      : existingVariableOptions;
```

Use `referenceTargetOptions` as the `options` of the list-value `NativeSelectField`.

- [ ] **Step 3: Disable rule types with no legal target**

In `Validations.tsx`, import `isValidationWithListValue` from `./options` and extend the option computation:

```ts
  const availableOptions = getOptionsWithUsedDisabled(
    validationOptions,
    usedOptions,
  ).map((option) => {
    if (option.disabled || !isValidationWithListValue(option.value)) {
      return option;
    }
    const hasLegalTarget = Object.keys(existingVariables).some(
      (candidateId) => checkDraft(option.value, candidateId).length === 0,
    );
    return hasLegalTarget ? option : { ...option, disabled: true };
  });
```

- [ ] **Step 4: Typecheck, run unit tests, commit**

Run: `pnpm --filter @codaco/architect typecheck && pnpm --filter @codaco/architect test`
Expected: PASS.

```bash
eval "$(fnm env)" && git add -A apps/architect/src && git commit -m "feat(architect): block contradictory validation drafts in the editor"
```

---

### Task 13: Architect — dialog-level form validate

Contradictions introduced outside the Validations section (deleting an option pushes `minSelected` past the option count) must block the field dialog's Save with a located message. The dialog form wrapper (`InlineEditScreen/Form`) already accepts a `validate` prop; `DialogArrayField`'s `DialogEditor` just never passes one. Returning the error keyed at `validation` (not `_error`) makes it render through the Validations field's existing `FieldErrors` (which shows on `submitFailed`) and lets `scrollToFirstError` find the `getFieldId('validation')` anchor.

**Files:**

- Modify: `apps/architect/src/components/Validations/contradictions.ts` (add `makeFieldEditorValidate`)
- Modify: `apps/architect/src/components/Form/DialogArrayField.tsx` (`DialogEditorProps` + `DialogEditor`)
- Modify: `apps/architect/src/components/sections/Form/Form.tsx` (wire into the `form.fields` DialogArrayField)
- Modify: `apps/architect/src/components/sections/FamilyPedigree/NodeConfiguration.tsx` (same wiring for its FieldFields dialog)
- Test: `apps/architect/src/components/Validations/__tests__/contradictions.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `contradictions.test.ts`:

```ts
import { makeFieldEditorValidate } from '../contradictions';

describe('makeFieldEditorValidate', () => {
  const allVariables = {
    colors: {
      name: 'colors',
      type: 'categorical',
      options: [
        { label: 'Red', value: 'red' },
        { label: 'Blue', value: 'blue' },
        { label: 'Green', value: 'green' },
      ],
      validation: { minSelected: 3 },
    },
  };

  it('flags a contradiction introduced by shrinking the options', () => {
    const validate = makeFieldEditorValidate(allVariables);
    const errors = validate({
      variable: 'colors',
      validation: { minSelected: 3 },
      options: [
        { label: 'Red', value: 'red' },
        { label: 'Blue', value: 'blue' },
      ],
    });
    expect(errors.validation).toContain('minSelected');
  });

  it('passes a coherent draft and ignores dialogs without validation', () => {
    const validate = makeFieldEditorValidate(allVariables);
    expect(
      validate({
        variable: 'colors',
        validation: { minSelected: 3 },
        options: [
          { label: 'Red', value: 'red' },
          { label: 'Blue', value: 'blue' },
          { label: 'Green', value: 'green' },
        ],
      }),
    ).toEqual({});
    expect(validate({ variable: 'colors' })).toEqual({});
  });

  it('derives the type from the chosen component for a new variable', () => {
    const validate = makeFieldEditorValidate({});
    const errors = validate({
      component: 'Text',
      validation: { minLength: 10, maxLength: 2 },
    });
    expect(errors.validation).toContain('minLength');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/architect exec vitest run src/components/Validations/__tests__/contradictions.test.ts`
Expected: FAIL — `makeFieldEditorValidate` not exported.

- [ ] **Step 3: Implement the validate factory**

Add to `contradictions.ts`:

```ts
import { getTypeForComponent } from '~/config/variables';
```

```ts
/**
 * redux-form sync validate for the field-editor dialog. Errors are keyed at
 * `validation` so they surface through the Validations field's FieldErrors on
 * a failed save and anchor to getFieldId('validation') for scroll-to-error.
 */
export const makeFieldEditorValidate =
  (allVariables: UnknownRecord) =>
  (values: Record<string, unknown>): Record<string, unknown> => {
    const validation = values.validation;
    if (!isRecord(validation)) return {};
    const currentVariableId =
      typeof values.variable === 'string' ? values.variable : '';
    const existing = currentVariableId
      ? allVariables[currentVariableId]
      : undefined;
    const existingType = isRecord(existing) ? existing.type : undefined;
    const component =
      typeof values.component === 'string' ? values.component : '';
    const variableType =
      typeof existingType === 'string'
        ? existingType
        : (getTypeForComponent(component) ?? '');
    if (!variableType) return {};
    const first = findDraftContradictions({
      allVariables,
      currentVariableId,
      variableType,
      validation,
      options: values.options,
    })[0];
    return first ? { validation: first.message } : {};
  };
```

(If `getTypeForComponent` returns `string` rather than `string | undefined`, drop the `?? ''`.)

- [ ] **Step 4: Thread `editorValidate` through DialogArrayField**

In `DialogArrayField.tsx`:

- Add to `DialogEditorProps`: `editorValidate?: (values: Record<string, unknown>) => Record<string, unknown>;`
- Destructure `editorValidate` in `DialogEditor` and pass it to the form: `<Form form={editFormName} id={editFormName} onSubmit={handleSave} initialValues={initialValues} validate={editorValidate}>`
- Add the same optional field to the outer props type so callers can supply it via `componentProps` (follow how `normalizeItem`/`onBeforeSave` flow from `componentProps` to `DialogEditor` in this file).

- [ ] **Step 5: Wire the two FieldFields dialogs**

In `apps/architect/src/components/sections/Form/Form.tsx` (the component rendering `ValidatedFieldArray name="form.fields"` — `type` and `entity` are already in scope, see `editorProps: { type, entity }`):

```ts
import { useMemo } from 'react';
import { useSelector } from 'react-redux';

import { getVariablesForSubjectSelector } from '~/selectors/codebook';
import type { RootState } from '~/ducks/modules/root';

import { makeFieldEditorValidate } from '../../Validations/contradictions';
```

```ts
  const allVariables = useSelector((state: RootState) =>
    getVariablesForSubjectSelector(state, { entity, type }),
  );
  const editorValidate = useMemo(
    () => makeFieldEditorValidate(allVariables),
    [allVariables],
  );
```

(If the component is currently a props-only arrow function inside a `compose` chain, converting its body to a block with these two hooks is fine — it is a function component rendered under the store provider. Match the selector-call signature used in `withFieldsHandlers.tsx`.)

Add `editorValidate` to the `componentProps` object of the `form.fields` `ValidatedFieldArray`.

In `NodeConfiguration.tsx` (FamilyPedigree), mirror the same three additions around its FieldFields `DialogArrayField` usage, using its local entity/type values.

**Mount-point enumeration** (spec commitment): `FieldFields` is mounted from exactly these two places — `sections/Form/Form.tsx` (`editorFieldsComponent: FieldFields`) and `sections/FamilyPedigree/NodeConfiguration.tsx`. The only other Validations mount, `sections/Anonymisation/AnonymisationValidation.tsx`, edits a stage-level passphrase with no options or codebook interplay, so the row-level `checkDraft` (Task 11's passphrase surrogate) is sufficient there and no dialog validate is needed. Verify this enumeration is still true with `grep -rn 'FieldFields' apps/architect/src` before finishing the step.

- [ ] **Step 6: Verify the DatePicker parameters editor mirrors the schema check**

Spec commitment: the schema's new DatePicker refinement (Task 7) must be unreachable from the editor. Read `apps/architect/src/components/Parameters/DatePicker.tsx`: its End Range field already carries `validation={{ ISODate: dateFormat, greaterThan: ... }}` and `resetRangeFields` clears both bounds on a resolution change. Confirm, by exercising the editor against a running dev build (or the component's tests), that:

1. the `ISODate: dateFormat` check rejects a value not at the picker's exact resolution (it is parameterised by the per-resolution format, so it should); and
2. `min > max` cannot be committed (the `greaterThan` validator on `max` re-runs on any form change, so editing `min` upward also surfaces it).

If either check has a hole (for example the Start Range field accepting a wrong-resolution value the schema now rejects), extend the field's `validation` map in `DatePicker.tsx` using the same `ISODate`/`greaterThan` validators from `~/utils/validations` until the schema refinement cannot fire from this editor. If both already hold, record that in the commit message and change nothing.

- [ ] **Step 7: Run tests, typecheck, commit**

Run: `pnpm --filter @codaco/architect test && pnpm --filter @codaco/architect typecheck`
Expected: PASS.

```bash
eval "$(fnm env)" && git add -A apps/architect/src && git commit -m "feat(architect): validate the whole field dialog against contradictions"
```

---

### Task 14: Architect — `unique` small-value-space hint

A non-blocking informational note when `unique` sits on a boolean (2 values) or ordinal (option count) variable. No effect on save.

**Files:**

- Modify: `apps/architect/src/components/Validations/Validations.tsx` (compute `uniqueValueCount`)
- Modify: `apps/architect/src/components/Validations/Validation.tsx` (render the note)

- [ ] **Step 1: Compute the count**

In `Validations.tsx`:

```ts
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
```

```ts
  const uniqueValueCount = useMemo(() => {
    if (variableType === 'boolean') return 2;
    if (variableType !== 'ordinal') return undefined;
    if (Array.isArray(draftOptions)) return draftOptions.length;
    const current = allVariables?.[currentVariableId ?? ''];
    const options =
      typeof current === 'object' && current !== null && 'options' in current
        ? (current as { options?: unknown }).options
        : undefined;
    return Array.isArray(options) ? options.length : undefined;
  }, [variableType, draftOptions, allVariables, currentVariableId]);
```

(If the `as { options?: unknown }` narrowing fights the lint rules, extract the shared `isRecord` guard from `contradictions.ts` into scope instead — do not suppress.)

Pass `uniqueValueCount={uniqueValueCount}` on the `<Field>` (rows receive it via `{...rest}`) and on the add-new `<Validation>`.

- [ ] **Step 2: Render the note**

In `Validation.tsx`, add `uniqueValueCount?: number` to `ValidationProps` and `import Paragraph from '@codaco/fresco-ui/typography/Paragraph';`. In the **collapsed** row, under the summary `<p>`; and in the **editing** row, under the rule-type select — the same fragment in both:

```tsx
        {(isBeingEdited ? draftKey : itemKey) === 'unique' &&
          uniqueValueCount !== undefined && (
            <Paragraph className="text-sm text-current/70">
              This variable has only {uniqueValueCount} possible values, so
              &lsquo;Must be unique&rsquo; may become impossible to satisfy once
              more than {uniqueValueCount} entities hold a value.
            </Paragraph>
          )}
```

- [ ] **Step 3: Typecheck, commit**

Run: `pnpm --filter @codaco/architect typecheck`
Expected: PASS.

```bash
eval "$(fnm env)" && git add -A apps/architect/src && git commit -m "feat(architect): hint when unique is applied to a small value space"
```

---

### Task 15: Architect e2e + full verification

One focused e2e spec proving the editor gate end-to-end, then the whole verification battery. **Invoke the `running-architect-e2e-tests` skill** (Claude Code: via the Skill tool) before running the suite — it covers the runner (`run.sh`), reading failures, and updating specs/fixtures.

**Files:**

- Create: `apps/architect/e2e/specs/validation-contradictions.spec.ts`

- [ ] **Step 1: Write the e2e spec**

```ts
import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { createVariableViaSpotlight } from '../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../pageobjects/stage-editor.js';

test('the field editor blocks an inverted min/max validation pair', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('EgoForm');
  await editor.setStageName('About You');

  // Open the field dialog and configure a number variable (mirrors
  // pageobjects/editor-sections/forms.ts's addFormField, inlined so the
  // dialog stays open for the Validation section).
  const page = architectPage;
  await editor
    .section('Form')
    .getByRole('button', { name: 'Create new', exact: true })
    .click();
  await createVariableViaSpotlight(page, { variableName: 'age' });
  const prompt = page.getByRole('textbox', { name: 'Prompt text' });
  await prompt.click();
  await prompt.fill('How old are you?');
  await page
    .getByLabel('Input control')
    .selectOption({ label: 'Number Input' });

  // Expand the toggleable Validation section. NOTE: confirm the toggle
  // control's accessible role/name against components/EditorLayout's Section
  // (`toggleable` prop) before finalising this locator — adjust if the
  // rendered control is a switch/checkbox with a different name.
  await editor
    .section('Validation')
    .getByRole('switch')
    .click();

  const validationSection = editor.section('Validation');

  // Add minValue 10.
  await validationSection
    .getByRole('button', { name: 'Add new', exact: true })
    .click();
  await page
    .locator('select[name="validation-key"]')
    .selectOption({ label: 'Minimum value' });
  await page.locator('input[name="validation-value"]').fill('10');
  await page
    .getByRole('button', { name: 'Add validation rule', exact: true })
    .click();

  // Attempt maxValue 2 — the tick must disable and the reason must show.
  await validationSection
    .getByRole('button', { name: 'Add new', exact: true })
    .click();
  await page
    .locator('select[name="validation-key"]')
    .selectOption({ label: 'Maximum value' });
  await page.locator('input[name="validation-value"]').fill('2');
  await expect(
    page.getByRole('button', { name: 'Add validation rule', exact: true }),
  ).toBeDisabled();
  await expect(page.getByText('is greater than maxValue')).toBeVisible();

  // Correct the value — the tick re-enables and the rule saves.
  await page.locator('input[name="validation-value"]').fill('20');
  await page
    .getByRole('button', { name: 'Add validation rule', exact: true })
    .click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await editor.expectNoIssues();
  await editor.save();
});
```

- [ ] **Step 2: Run the new spec**

Per the `running-architect-e2e-tests` skill, run the suite filtered to this spec first, iterate on locators until green, then run the full Architect e2e suite once as final verification (memory note: keep verification runs minimal — one full pass at the end, not per-finding).

- [ ] **Step 3: Full verification battery**

```bash
pnpm --filter @codaco/protocol-validation test
```

```bash
pnpm --filter @codaco/architect test
```

```bash
pnpm --filter @codaco/protocol-validation --filter @codaco/architect typecheck
```

```bash
pnpm knip
```

Expected: all PASS. knip must not flag the new `findValidationContradictions`/`ValidationContradiction` exports (Architect imports them) or anything unused in Architect.

- [ ] **Step 4: Commit**

```bash
eval "$(fnm env)" && git add -A apps/architect/e2e && git commit -m "test(architect): e2e coverage for contradictory validation gating"
```

---

### Task 16: Changesets

**Invoke the `creating-a-changeset` skill** (Claude Code: via the Skill tool) — it owns lane rules and formatting. Two changesets, separate lanes, never combined:

1. `@codaco/protocol-validation` **minor** — draft summary:

   > Contradictory variable validation rules are now unexpressible. The schema rejects inverted `min`/`max` pairs, `minSelected` above the option count, `sameAs`+`differentFrom` naming one target, comparator structures no data can satisfy (impossible cycles, comparisons inside a `sameAs` group, comparisons with disjoint bounds), cross-type validation references, count-valued rules below their floors, and malformed or inverted DatePicker `min`/`max` parameters. The v7→v8 migration strips or normalises all of these in existing protocols (see the migration notes). Protocols already at schema version 8 that carry a contradiction will now fail validation — the interview forms they produced were already unsubmittable.

2. `@codaco/architect` **patch** — draft summary:

   > The variable validation editor now prevents contradictory rules at authoring time: contradictory drafts cannot be saved and explain why, reference pickers only offer targets that keep the rules satisfiable, the whole field dialog is checked on save (e.g. deleting an option out from under `minSelected`), and a hint appears when `unique` is applied to a variable with only a few possible values.

- [ ] **Step 1: Author both changesets via the skill, then commit**

```bash
eval "$(fnm env)" && git add .changeset && git commit -m "chore: changesets for validation-contradiction prevention"
```

---

## Execution notes

- Tasks 1–10 are protocol-validation only and strictly ordered. Tasks 11–14 are Architect and depend on Task 4's export; they are ordered among themselves. Task 15 verifies everything; Task 16 closes out.
- When done, use the `shipping-a-pull-request` skill to open and watch the PR. The PR description must call out any already-v8 corpus protocol found carrying a contradiction (Task 10 Step 3).
