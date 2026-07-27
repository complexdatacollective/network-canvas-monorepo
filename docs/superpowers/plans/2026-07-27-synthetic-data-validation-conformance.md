# Synthetic Data Validation Conformance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `generateNetwork` produce synthetic interview data that satisfies every validation rule and component parameter bound the interview runtime enforces, and throw an aggregated, deterministic error when a protocol's rules cannot be satisfied.

**Architecture:** A normalised `VariableConstraints` descriptor is built once per entity type from each codebook variable, folding `DatePicker`/`RelativeDatePicker` parameter bounds into the same shape as the validation rules. An up-front feasibility pass analyses those descriptors against worst-case entity counts and throws before anything is generated. Attribute generation moves from a per-variable loop to entity-level generation in topological order, so `sameAs`, `differentFrom` and the comparators can read their targets, with a run-scoped registry backing `unique`.

**Tech Stack:** TypeScript, Vitest, `@faker-js/faker`, zod (via `@codaco/protocol-validation`), pnpm workspaces, Turborepo.

## Global Constraints

- **No `any` types.** Explicitly forbidden repo-wide. Do not resolve type errors with `as` assertions either — fix the cause.
- **No barrel files.** Do not create `index.ts` re-export files. `packages/protocol-utilities/src/index.ts` already exists and is the package entry point; add to it only what external consumers need.
- **Never re-export** a function or variable from a module that does not define it.
- **Only export what another module actually imports.** Run `pnpm knip` before opening the PR.
- **Comment only unusual or complex code.** Do not narrate ordinary logic.
- **Source-first workspace.** `packages/*` are consumed as raw TypeScript. Do not add `dist` builds or path aliases (`~/`) inside package source.
- **Formatting.** The repo formatter is `oxfmt`. The husky pre-commit hook runs `oxlint --fix` and `oxfmt` on staged files, so a normal `git commit` formats your changes. Do not run the root `pnpm lint:fix`, which rewrites the whole repo.
- **Reference variable semantics.** `sameAs`, `differentFrom`, `greaterThanVariable`, `lessThanVariable`, `greaterThanOrEqualToVariable` and `lessThanOrEqualToVariable` hold the **variable id** (the key in the owning entity's `variables` record), not the variable name.
- **Legal rules per type** are fixed by `packages/protocol-validation/src/schemas/8/variables/variable.ts`. `scalar` has no `unique`/`sameAs`/`differentFrom`. `ordinal` has no `minSelected`/`maxSelected`. Ego variables cannot have `unique` at all. Code may still be defensive, but do not invent support for illegal combinations.
- **Test command** for `@codaco/protocol-utilities` is `pnpm --filter @codaco/protocol-utilities test` (vitest, node environment). For `@codaco/interview` it is `pnpm --filter @codaco/interview test` (vitest `units` project, jsdom).

---

### Task 1: Date window utilities

Date bounds arrive from three places in three shapes — `DatePicker.parameters.min`/`max` at one of three resolutions, `RelativeDatePicker.parameters.anchor`/`before`/`after` as day offsets, and nothing at all. This task builds the arithmetic that normalises them, so later tasks work with one shape.

**Files:**

- Create: `packages/protocol-utilities/src/generateNetwork/constraints/dateWindow.ts`
- Test: `packages/protocol-utilities/src/generateNetwork/constraints/__tests__/dateWindow.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:
  - `type DateResolution = 'full' | 'month' | 'year'`
  - `type DateWindow = { min?: string; max?: string; resolution: DateResolution }`
  - `todayYmd(): string`
  - `addDays(ymd: string, days: number): string`
  - `truncateToResolution(ymd: string, resolution: DateResolution): string`
  - `addSteps(value: string, steps: number, resolution: DateResolution): string`
  - `stepsBetween(from: string, to: string, resolution: DateResolution): number`

- [ ] **Step 1: Write the failing test**

Create `packages/protocol-utilities/src/generateNetwork/constraints/__tests__/dateWindow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  addDays,
  addSteps,
  stepsBetween,
  todayYmd,
  truncateToResolution,
} from '../dateWindow';

describe('addDays', () => {
  it('adds days across a month boundary in UTC', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02');
  });

  it('subtracts days across a year boundary', () => {
    expect(addDays('2026-01-02', -3)).toBe('2025-12-30');
  });

  it('handles leap days', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });
});

describe('truncateToResolution', () => {
  it('keeps the full date at full resolution', () => {
    expect(truncateToResolution('2026-07-27', 'full')).toBe('2026-07-27');
  });

  it('drops the day at month resolution', () => {
    expect(truncateToResolution('2026-07-27', 'month')).toBe('2026-07');
  });

  it('drops the month at year resolution', () => {
    expect(truncateToResolution('2026-07-27', 'year')).toBe('2026');
  });
});

describe('addSteps', () => {
  it('steps by days at full resolution', () => {
    expect(addSteps('2026-07-27', 5, 'full')).toBe('2026-08-01');
  });

  it('steps by months at month resolution', () => {
    expect(addSteps('2026-11', 3, 'month')).toBe('2027-02');
  });

  it('steps by years at year resolution', () => {
    expect(addSteps('2026', -2, 'year')).toBe('2024');
  });
});

describe('stepsBetween', () => {
  it('counts days at full resolution', () => {
    expect(stepsBetween('2026-07-27', '2026-08-01', 'full')).toBe(5);
  });

  it('counts months at month resolution', () => {
    expect(stepsBetween('2026-11', '2027-02', 'month')).toBe(3);
  });

  it('counts years at year resolution', () => {
    expect(stepsBetween('2024', '2026', 'year')).toBe(2);
  });

  it('returns a negative count for an inverted range', () => {
    expect(stepsBetween('2026', '2024', 'year')).toBe(-2);
  });
});

describe('todayYmd', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayYmd()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-utilities test dateWindow`
Expected: FAIL — `Failed to resolve import "../dateWindow"`.

- [ ] **Step 3: Write the implementation**

Create `packages/protocol-utilities/src/generateNetwork/constraints/dateWindow.ts`:

```ts
export type DateResolution = 'full' | 'month' | 'year';

/**
 * A closed date range at a single resolution. Bounds are strings at that
 * resolution: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`.
 */
export type DateWindow = {
  min?: string;
  max?: string;
  resolution: DateResolution;
};

// Deliberately duplicated from fresco-ui's form/utils/ymd, which this package
// cannot depend on (protocol-utilities must stay free of UI dependencies).
// Arithmetic runs in UTC so bounds are stable regardless of runtime timezone;
// the runtime's min/max validators compare these strings lexically, so any
// drift would produce off-by-one-day failures near DST boundaries.
function formatYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return ymd;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return formatYmd(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

export function todayYmd(): string {
  const now = new Date();
  return formatYmd(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate(),
  );
}

export function truncateToResolution(
  value: string,
  resolution: DateResolution,
): string {
  if (resolution === 'year') return value.slice(0, 4);
  if (resolution === 'month') return value.slice(0, 7);
  return value.slice(0, 10);
}

function parts(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split('-').map(Number);
  return { year: year ?? 0, month: month ?? 1, day: day ?? 1 };
}

export function addSteps(
  value: string,
  steps: number,
  resolution: DateResolution,
): string {
  if (resolution === 'full') {
    return addDays(value, steps);
  }

  const { year, month } = parts(value);
  if (resolution === 'year') {
    return String(year + steps).padStart(4, '0');
  }

  const total = year * 12 + (month - 1) + steps;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}`;
}

export function stepsBetween(
  from: string,
  to: string,
  resolution: DateResolution,
): number {
  const a = parts(from);
  const b = parts(to);

  if (resolution === 'year') {
    return b.year - a.year;
  }
  if (resolution === 'month') {
    return b.year * 12 + b.month - (a.year * 12 + a.month);
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const fromMs = Date.UTC(a.year, a.month - 1, a.day);
  const toMs = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((toMs - fromMs) / msPerDay);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/protocol-utilities test dateWindow`
Expected: PASS — 13 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-utilities/src/generateNetwork/constraints/dateWindow.ts packages/protocol-utilities/src/generateNetwork/constraints/__tests__/dateWindow.test.ts
git commit -m "feat(protocol-utilities): add date window arithmetic for constraint generation"
```

---

### Task 2: Constraint descriptor

Turn a codebook variable into the single descriptor the rest of the system reads. This is also where `toVariableEntry` starts carrying `parameters`, which it currently drops — without it the date component bounds are invisible.

**Files:**

- Create: `packages/protocol-utilities/src/generateNetwork/constraints/types.ts`
- Create: `packages/protocol-utilities/src/generateNetwork/constraints/buildConstraints.ts`
- Modify: `packages/protocol-utilities/src/generateNetwork/attributes.ts` (add `parameters` to `toVariableEntry`)
- Modify: `packages/protocol-utilities/src/generateNetwork/config.ts` (add `today`)
- Test: `packages/protocol-utilities/src/generateNetwork/constraints/__tests__/buildConstraints.test.ts`

**Interfaces:**

- Consumes: `DateResolution`, `DateWindow`, `addDays`, `truncateToResolution`, `todayYmd` from Task 1.
- Produces:
  - `type VariableConstraints` (see Step 3)
  - `type ConstrainedVariable = { entry: VariableEntry; constraints: VariableConstraints }`
  - `type EntityConstraints = Map<string, ConstrainedVariable>`
  - `buildVariableConstraints(entry: VariableEntry, today: string): VariableConstraints`
  - `buildEntityConstraints(variables: Variables | undefined, today: string): EntityConstraints`
  - `GenerationConfig.today: string`

- [ ] **Step 1: Write the failing test**

Create `packages/protocol-utilities/src/generateNetwork/constraints/__tests__/buildConstraints.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildEntityConstraints, buildVariableConstraints } from '../buildConstraints';

const TODAY = '2026-07-27';

describe('buildVariableConstraints', () => {
  it('reads single-variable rules from validation', () => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Nickname',
        type: 'text',
        validation: { required: true, minLength: 24, maxLength: 24 },
      },
      TODAY,
    );

    expect(result.required).toBe(true);
    expect(result.minLength).toBe(24);
    expect(result.maxLength).toBe(24);
    expect(result.unique).toBe(false);
  });

  it('reads cross-variable references', () => {
    const result = buildVariableConstraints(
      {
        id: 'v2',
        name: 'Confirm',
        type: 'text',
        validation: { sameAs: 'v1', differentFrom: 'v3' },
      },
      TODAY,
    );

    expect(result.sameAs).toBe('v1');
    expect(result.differentFrom).toBe('v3');
  });

  it('defaults required and unique to false when validation is absent', () => {
    const result = buildVariableConstraints(
      { id: 'v1', name: 'Name', type: 'text' },
      TODAY,
    );

    expect(result.required).toBe(false);
    expect(result.unique).toBe(false);
    expect(result.dateWindow).toBeUndefined();
  });

  it('normalises DatePicker parameters into a date window', () => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Born',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'month', min: '2020-01-01', max: '2024-06-30' },
      },
      TODAY,
    );

    expect(result.dateWindow).toEqual({
      resolution: 'month',
      min: '2020-01',
      max: '2024-06',
    });
  });

  it('defaults DatePicker resolution to full', () => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Born',
        type: 'datetime',
        component: 'DatePicker',
      },
      TODAY,
    );

    expect(result.dateWindow).toEqual({ resolution: 'full' });
  });

  it('normalises RelativeDatePicker offsets against the supplied today', () => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Last seen',
        type: 'datetime',
        component: 'RelativeDatePicker',
        parameters: { anchor: '2026-07-27', before: 30, after: 5 },
      },
      TODAY,
    );

    expect(result.dateWindow).toEqual({
      resolution: 'full',
      min: '2026-06-27',
      max: '2026-08-01',
    });
  });

  it('applies the runtime RelativeDatePicker defaults of 180 before and 0 after', () => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Last seen',
        type: 'datetime',
        component: 'RelativeDatePicker',
      },
      TODAY,
    );

    expect(result.dateWindow).toEqual({
      resolution: 'full',
      min: '2026-01-28',
      max: '2026-07-27',
    });
  });
});

describe('buildEntityConstraints', () => {
  it('builds one entry per codebook variable, keyed by id', () => {
    const result = buildEntityConstraints(
      {
        v1: { name: 'Name', type: 'text', validation: { required: true } },
        v2: { name: 'Age', type: 'number', validation: { minValue: 18 } },
      },
      TODAY,
    );

    expect([...result.keys()]).toEqual(['v1', 'v2']);
    expect(result.get('v1')?.constraints.required).toBe(true);
    expect(result.get('v2')?.constraints.minValue).toBe(18);
    expect(result.get('v2')?.entry.type).toBe('number');
  });

  it('returns an empty map for undefined variables', () => {
    expect(buildEntityConstraints(undefined, TODAY).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-utilities test buildConstraints`
Expected: FAIL — `Failed to resolve import "../buildConstraints"`.

- [ ] **Step 3: Write the implementation**

Create `packages/protocol-utilities/src/generateNetwork/constraints/types.ts`:

```ts
import type { VariableEntry } from '../../types';
import type { DateWindow } from './dateWindow';

export type VariableConstraints = {
  required: boolean;
  unique: boolean;
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  minSelected?: number;
  maxSelected?: number;
  sameAs?: string;
  differentFrom?: string;
  greaterThanVariable?: string;
  lessThanVariable?: string;
  greaterThanOrEqualToVariable?: string;
  lessThanOrEqualToVariable?: string;
  dateWindow?: DateWindow;
};

export type ConstrainedVariable = {
  entry: VariableEntry;
  constraints: VariableConstraints;
};

export type EntityConstraints = Map<string, ConstrainedVariable>;

/**
 * The comparison rules, in the order later code iterates them. Kept as a
 * literal tuple so a new comparator cannot be added to the descriptor without
 * a type error at every site that switches on the set.
 */
export const COMPARISON_RULES = [
  'greaterThanVariable',
  'lessThanVariable',
  'greaterThanOrEqualToVariable',
  'lessThanOrEqualToVariable',
] as const;

export type ComparisonRule = (typeof COMPARISON_RULES)[number];
```

Create `packages/protocol-utilities/src/generateNetwork/constraints/buildConstraints.ts`:

```ts
import type { Variables } from '@codaco/protocol-validation';

import { toVariableEntry } from '../attributes';
import type { VariableEntry } from '../../types';
import {
  addDays,
  type DateResolution,
  type DateWindow,
  truncateToResolution,
} from './dateWindow';
import type { EntityConstraints, VariableConstraints } from './types';

// Mirrors RelativeDatePicker's own defaults, which useProtocolForm turns into
// hard min/max validators; a generated value outside this window fails
// validation even though the protocol declares no explicit bound.
const RELATIVE_DEFAULT_BEFORE = 180;
const RELATIVE_DEFAULT_AFTER = 0;

function readNumber(
  source: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = source?.[key];
  return typeof value === 'number' ? value : undefined;
}

function readString(
  source: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = source?.[key];
  return typeof value === 'string' ? value : undefined;
}

function readBoolean(
  source: Record<string, unknown> | undefined,
  key: string,
): boolean {
  return source?.[key] === true;
}

function resolveDateWindow(
  entry: VariableEntry,
  today: string,
): DateWindow | undefined {
  if (entry.type !== 'datetime') return undefined;

  const parameters = entry.parameters;

  if (entry.component === 'RelativeDatePicker') {
    const anchor = readString(parameters, 'anchor') ?? today;
    const before = readNumber(parameters, 'before') ?? RELATIVE_DEFAULT_BEFORE;
    const after = readNumber(parameters, 'after') ?? RELATIVE_DEFAULT_AFTER;
    return {
      resolution: 'full',
      min: addDays(anchor, -before),
      max: addDays(anchor, after),
    };
  }

  const resolutionParameter = readString(parameters, 'type');
  const resolution: DateResolution =
    resolutionParameter === 'month' || resolutionParameter === 'year'
      ? resolutionParameter
      : 'full';

  const min = readString(parameters, 'min');
  const max = readString(parameters, 'max');

  return {
    resolution,
    ...(min !== undefined
      ? { min: truncateToResolution(min, resolution) }
      : {}),
    ...(max !== undefined
      ? { max: truncateToResolution(max, resolution) }
      : {}),
  };
}

export function buildVariableConstraints(
  entry: VariableEntry,
  today: string,
): VariableConstraints {
  const validation = entry.validation;

  return {
    required: readBoolean(validation, 'required'),
    unique: readBoolean(validation, 'unique'),
    minLength: readNumber(validation, 'minLength'),
    maxLength: readNumber(validation, 'maxLength'),
    minValue: readNumber(validation, 'minValue'),
    maxValue: readNumber(validation, 'maxValue'),
    minSelected: readNumber(validation, 'minSelected'),
    maxSelected: readNumber(validation, 'maxSelected'),
    sameAs: readString(validation, 'sameAs'),
    differentFrom: readString(validation, 'differentFrom'),
    greaterThanVariable: readString(validation, 'greaterThanVariable'),
    lessThanVariable: readString(validation, 'lessThanVariable'),
    greaterThanOrEqualToVariable: readString(
      validation,
      'greaterThanOrEqualToVariable',
    ),
    lessThanOrEqualToVariable: readString(
      validation,
      'lessThanOrEqualToVariable',
    ),
    dateWindow: resolveDateWindow(entry, today),
  };
}

export function buildEntityConstraints(
  variables: Variables | undefined,
  today: string,
): EntityConstraints {
  const result: EntityConstraints = new Map();
  if (!variables) return result;

  for (const [varId, variable] of Object.entries(variables)) {
    const entry = toVariableEntry(varId, variable);
    result.set(varId, {
      entry,
      constraints: buildVariableConstraints(entry, today),
    });
  }

  return result;
}
```

- [ ] **Step 4: Carry `parameters` through `toVariableEntry`**

In `packages/protocol-utilities/src/generateNetwork/attributes.ts`, add `parameters` to the returned entry:

```ts
  return {
    id,
    name: variable.name,
    type: variable.type,
    component: 'component' in variable ? variable.component : undefined,
    options,
    validation: 'validation' in variable ? variable.validation : undefined,
    parameters: 'parameters' in variable ? variable.parameters : undefined,
  };
```

- [ ] **Step 5: Add `today` to the generation config**

In `packages/protocol-utilities/src/generateNetwork/config.ts`, add the field to the type:

```ts
  /**
   * The date RelativeDatePicker bounds are resolved against, as YYYY-MM-DD.
   * Resolved per-run rather than baked into the defaults so it tracks the
   * real date, and so tests can pin it.
   */
  today: string;
```

Remove `today` from `DEFAULT_GENERATION_CONFIG` (it is not a static default) and resolve it in `resolveGenerationConfig`:

```ts
export function resolveGenerationConfig(
  overrides?: Partial<GenerationConfig>,
): GenerationConfig {
  return {
    ...DEFAULT_GENERATION_CONFIG,
    today: todayYmd(),
    ...overrides,
  };
}
```

Add the import at the top of `config.ts`:

```ts
import { todayYmd } from './constraints/dateWindow';
```

Because `GenerationConfig` now requires `today` but `DEFAULT_GENERATION_CONFIG` does not supply it, change the constant's type annotation to `Omit<GenerationConfig, 'today'>`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @codaco/protocol-utilities test`
Expected: PASS — the new `buildConstraints` suite plus every pre-existing suite.

- [ ] **Step 7: Commit**

```bash
git add packages/protocol-utilities/src/generateNetwork/constraints packages/protocol-utilities/src/generateNetwork/attributes.ts packages/protocol-utilities/src/generateNetwork/config.ts
git commit -m "feat(protocol-utilities): build normalised variable constraint descriptors"
```

---

### Task 3: Value-space sizing

`unique` is only satisfiable when the variable can produce at least as many distinct values as there are entities. This task computes how many distinct values the generator can reach.

**Files:**

- Create: `packages/protocol-utilities/src/generateNetwork/constraints/valueSpace.ts`
- Test: `packages/protocol-utilities/src/generateNetwork/constraints/__tests__/valueSpace.test.ts`

**Interfaces:**

- Consumes: `ConstrainedVariable` from Task 2, `stepsBetween` from Task 1.
- Produces: `valueSpaceSize(variable: ConstrainedVariable, ceiling: number): number | 'unbounded'` — returns `'unbounded'` when the space is at least `ceiling`, so the caller never pays for counting a huge space.

- [ ] **Step 1: Write the failing test**

Create `packages/protocol-utilities/src/generateNetwork/constraints/__tests__/valueSpace.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildVariableConstraints } from '../buildConstraints';
import type { ConstrainedVariable } from '../types';
import { valueSpaceSize } from '../valueSpace';

const TODAY = '2026-07-27';

function make(
  entry: Parameters<typeof buildVariableConstraints>[0],
): ConstrainedVariable {
  return { entry, constraints: buildVariableConstraints(entry, TODAY) };
}

describe('valueSpaceSize', () => {
  it('gives boolean exactly two values', () => {
    expect(valueSpaceSize(make({ id: 'v', name: 'V', type: 'boolean' }), 100)).toBe(2);
  });

  it('gives ordinal its option count', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'ordinal',
      options: [
        { label: 'A', value: 1 },
        { label: 'B', value: 2 },
        { label: 'C', value: 3 },
      ],
    });
    expect(valueSpaceSize(variable, 100)).toBe(3);
  });

  it('counts categorical subsets within the selection bounds', () => {
    // 3 options, 1 or 2 selected: C(3,1) + C(3,2) = 3 + 3 = 6
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'categorical',
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
        { label: 'C', value: 'c' },
      ],
      validation: { minSelected: 1, maxSelected: 2 },
    });
    expect(valueSpaceSize(variable, 100)).toBe(6);
  });

  it('counts a bounded integer range inclusively', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'number',
      validation: { minValue: 1, maxValue: 3 },
    });
    expect(valueSpaceSize(variable, 100)).toBe(3);
  });

  it('treats an unbounded number as unbounded', () => {
    expect(valueSpaceSize(make({ id: 'v', name: 'V', type: 'number' }), 100)).toBe(
      'unbounded',
    );
  });

  it('counts the steps in a bounded date window', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'year', min: '2020-01-01', max: '2024-01-01' },
    });
    expect(valueSpaceSize(variable, 100)).toBe(5);
  });

  it('treats a date variable with no bounds as unbounded', () => {
    const variable = make({ id: 'v', name: 'V', type: 'datetime' });
    expect(valueSpaceSize(variable, 100)).toBe('unbounded');
  });

  it('treats text with no maxLength as unbounded', () => {
    expect(valueSpaceSize(make({ id: 'v', name: 'V', type: 'text' }), 100)).toBe(
      'unbounded',
    );
  });

  it('counts text within a tight length budget', () => {
    // Exactly one character from a 36-symbol alphabet.
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'text',
      validation: { minLength: 1, maxLength: 1 },
    });
    expect(valueSpaceSize(variable, 100)).toBe(36);
  });

  it('stops counting once the space reaches the ceiling', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'number',
      validation: { minValue: 0, maxValue: 1_000_000 },
    });
    expect(valueSpaceSize(variable, 10)).toBe('unbounded');
  });

  it('treats layout and location as unbounded', () => {
    expect(valueSpaceSize(make({ id: 'v', name: 'V', type: 'layout' }), 100)).toBe(
      'unbounded',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-utilities test valueSpace`
Expected: FAIL — `Failed to resolve import "../valueSpace"`.

- [ ] **Step 3: Write the implementation**

Create `packages/protocol-utilities/src/generateNetwork/constraints/valueSpace.ts`:

```ts
import { stepsBetween } from './dateWindow';
import type { ConstrainedVariable } from './types';

/**
 * Symbols the unique-text generator draws from. Kept in sync with
 * ValueGenerator's distinct-text encoding: both are base 36.
 */
export const TEXT_ALPHABET_SIZE = 36;

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

/**
 * How many distinct values the generator can produce for this variable, or
 * `'unbounded'` once the count reaches `ceiling`.
 *
 * Counted over what the generator can actually reach rather than what the
 * rules permit: a feasibility pass that assumed a wider space than the
 * generator draws from would pass protocols the generator then exhausts.
 */
export function valueSpaceSize(
  variable: ConstrainedVariable,
  ceiling: number,
): number | 'unbounded' {
  const { entry, constraints } = variable;
  const cap = (value: number): number | 'unbounded' =>
    value >= ceiling ? 'unbounded' : value;

  switch (entry.type) {
    case 'boolean':
      return 2;

    case 'ordinal':
      return cap(entry.options?.length ?? 0);

    case 'categorical': {
      const optionCount = entry.options?.length ?? 0;
      const min = constraints.minSelected ?? 1;
      const max = Math.min(constraints.maxSelected ?? optionCount, optionCount);
      let total = 0;
      for (let size = min; size <= max; size++) {
        total += binomial(optionCount, size);
        if (total >= ceiling) return 'unbounded';
      }
      return total;
    }

    case 'number': {
      const { minValue, maxValue } = constraints;
      if (minValue === undefined || maxValue === undefined) return 'unbounded';
      return cap(Math.max(0, Math.floor(maxValue) - Math.ceil(minValue) + 1));
    }

    case 'datetime': {
      const window = constraints.dateWindow;
      if (!window?.min || !window.max) return 'unbounded';
      return cap(stepsBetween(window.min, window.max, window.resolution) + 1);
    }

    case 'text': {
      const { maxLength } = constraints;
      if (maxLength === undefined) return 'unbounded';
      const minLength = constraints.minLength ?? 1;
      let total = 0;
      for (let length = minLength; length <= maxLength; length++) {
        total += TEXT_ALPHABET_SIZE ** length;
        if (total >= ceiling) return 'unbounded';
      }
      return total;
    }

    default:
      return 'unbounded';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/protocol-utilities test valueSpace`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-utilities/src/generateNetwork/constraints/valueSpace.ts packages/protocol-utilities/src/generateNetwork/constraints/__tests__/valueSpace.test.ts
git commit -m "feat(protocol-utilities): size the reachable value space per variable"
```

---

### Task 4: Worst-case entity counts

`unique` feasibility needs the largest number of entities of a type a run could produce. Using the worst case rather than the run's actual draw is what makes a protocol either always throw or never throw, independent of seed.

**Files:**

- Create: `packages/protocol-utilities/src/generateNetwork/constraints/entityCounts.ts`
- Test: `packages/protocol-utilities/src/generateNetwork/constraints/__tests__/entityCounts.test.ts`

**Interfaces:**

- Consumes: `GenerationConfig` from `../config`.
- Produces: `worstCaseEntityCounts(stages: Stage[], config: GenerationConfig): { node: Map<string, number>; edge: Map<string, number> }`

- [ ] **Step 1: Write the failing test**

Create `packages/protocol-utilities/src/generateNetwork/constraints/__tests__/entityCounts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import { resolveGenerationConfig } from '../../config';
import { worstCaseEntityCounts } from '../entityCounts';

const config = resolveGenerationConfig({ today: '2026-07-27' });

function nameGenerator(overrides: Record<string, unknown> = {}): Stage {
  return {
    id: 'stage-1',
    type: 'NameGenerator',
    label: 'Name generator',
    subject: { entity: 'node', type: 'person' },
    prompts: [{ id: 'p1', text: 'Name people' }],
    ...overrides,
  } as Stage;
}

describe('worstCaseEntityCounts', () => {
  it('uses the config node maximum when a stage declares no behaviours', () => {
    const counts = worstCaseEntityCounts([nameGenerator()], config);
    expect(counts.node.get('person')).toBe(config.nodeCount.max);
  });

  it('uses the stage maxNodes when declared', () => {
    const counts = worstCaseEntityCounts(
      [nameGenerator({ behaviours: { maxNodes: 20 } })],
      config,
    );
    expect(counts.node.get('person')).toBe(20);
  });

  it('sums across every stage producing the same node type', () => {
    const counts = worstCaseEntityCounts(
      [
        nameGenerator({ id: 'a', behaviours: { maxNodes: 5 } }),
        nameGenerator({ id: 'b', behaviours: { maxNodes: 7 } }),
      ],
      config,
    );
    expect(counts.node.get('person')).toBe(12);
  });

  it('counts FamilyPedigree nodes against its configured node type', () => {
    const stage = {
      id: 'stage-fp',
      type: 'FamilyPedigree',
      label: 'Pedigree',
      nodeConfig: { type: 'relative' },
      prompts: [],
    } as unknown as Stage;

    const counts = worstCaseEntityCounts([stage], config);
    expect(counts.node.get('relative')).toBe(config.familyPedigreeNodeCount.max);
  });

  it('bounds an edge type by the pair count over its node type', () => {
    const stages = [
      nameGenerator({ behaviours: { maxNodes: 4 } }),
      {
        id: 'stage-2',
        type: 'DyadCensus',
        label: 'Census',
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: 'p1', text: 'Do they know each other?', createEdge: 'knows' }],
      } as unknown as Stage,
    ];

    // C(4, 2) = 6
    const counts = worstCaseEntityCounts(stages, config);
    expect(counts.edge.get('knows')).toBe(6);
  });

  it('returns empty maps for a protocol with no entity-producing stages', () => {
    const stage = {
      id: 'stage-info',
      type: 'Information',
      label: 'Info',
      items: [],
    } as unknown as Stage;

    const counts = worstCaseEntityCounts([stage], config);
    expect(counts.node.size).toBe(0);
    expect(counts.edge.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-utilities test entityCounts`
Expected: FAIL — `Failed to resolve import "../entityCounts"`.

- [ ] **Step 3: Write the implementation**

Create `packages/protocol-utilities/src/generateNetwork/constraints/entityCounts.ts`:

```ts
import type { Stage } from '@codaco/protocol-validation';

import type { GenerationConfig } from '../config';
import { getSubjectType } from '../subject';

export type WorstCaseCounts = {
  node: Map<string, number>;
  edge: Map<string, number>;
};

const NODE_CREATING_TYPES = new Set([
  'NameGenerator',
  'NameGeneratorQuickAdd',
  'NameGeneratorRoster',
  'NetworkComposer',
]);

function add(counts: Map<string, number>, key: string, value: number): void {
  counts.set(key, (counts.get(key) ?? 0) + value);
}

// Not every member of the Stage union carries `subject`, and getSubjectType
// already tolerates an absent or malformed one (see its comment: generateNetwork
// runs on unvalidated, in-progress protocol state).
function subjectOf(stage: Stage): { entity?: string; type?: string } | undefined {
  return 'subject' in stage ? stage.subject : undefined;
}

function maxNodesFor(stage: Stage, config: GenerationConfig): number {
  const behaviours = 'behaviours' in stage ? stage.behaviours : undefined;
  if (
    behaviours &&
    'maxNodes' in behaviours &&
    behaviours.maxNodes !== undefined
  ) {
    return behaviours.maxNodes;
  }
  return config.nodeCount.max;
}

/**
 * Collect every edge type a stage can create, across its prompts and its own
 * edge configuration. Bounding an edge type by pair count over its stage's
 * node type is a genuine upper bound: no census or sociogram prompt creates
 * more than one edge of a type per unordered node pair.
 */
function edgeTypesForStage(stage: Stage): string[] {
  const types: string[] = [];

  if ('prompts' in stage && Array.isArray(stage.prompts)) {
    for (const prompt of stage.prompts) {
      if ('createEdge' in prompt && typeof prompt.createEdge === 'string') {
        types.push(prompt.createEdge);
      }
      if (
        'edges' in prompt &&
        prompt.edges &&
        'create' in prompt.edges &&
        typeof prompt.edges.create === 'string'
      ) {
        types.push(prompt.edges.create);
      }
    }
  }

  if ('edgeConfig' in stage && stage.edgeConfig?.type) {
    types.push(stage.edgeConfig.type);
  }

  if ('edges' in stage && Array.isArray(stage.edges)) {
    for (const edge of stage.edges) {
      const type = getSubjectType(edge.subject, 'edge');
      if (type !== undefined) types.push(type);
    }
  }

  return types;
}

export function worstCaseEntityCounts(
  stages: Stage[],
  config: GenerationConfig,
): WorstCaseCounts {
  const node = new Map<string, number>();
  const edge = new Map<string, number>();

  for (const stage of stages) {
    if (NODE_CREATING_TYPES.has(stage.type)) {
      const type = getSubjectType(subjectOf(stage), 'node');
      if (type !== undefined) add(node, type, maxNodesFor(stage, config));
    }

    if (stage.type === 'FamilyPedigree' && stage.nodeConfig?.type) {
      add(node, stage.nodeConfig.type, config.familyPedigreeNodeCount.max);
    }
  }

  for (const stage of stages) {
    const edgeTypes = edgeTypesForStage(stage);
    if (edgeTypes.length === 0) continue;

    const subjectNodeType =
      getSubjectType(subjectOf(stage), 'node') ??
      ('nodeConfig' in stage ? stage.nodeConfig?.type : undefined);
    const nodeCount =
      subjectNodeType !== undefined ? (node.get(subjectNodeType) ?? 0) : 0;
    const pairs = (nodeCount * (nodeCount - 1)) / 2;

    for (const edgeType of edgeTypes) {
      add(edge, edgeType, pairs);
    }
  }

  return { node, edge };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/protocol-utilities test entityCounts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-utilities/src/generateNetwork/constraints/entityCounts.ts packages/protocol-utilities/src/generateNetwork/constraints/__tests__/entityCounts.test.ts
git commit -m "feat(protocol-utilities): compute worst-case entity counts per type"
```

---

### Task 5: Dependency ordering

Cross-variable rules mean variable B may need A's value. This task computes the order to generate in, collapses `sameAs` groups, and reports cycles that cannot be satisfied.

**Files:**

- Create: `packages/protocol-utilities/src/generateNetwork/constraints/dependencyOrder.ts`
- Test: `packages/protocol-utilities/src/generateNetwork/constraints/__tests__/dependencyOrder.test.ts`

**Interfaces:**

- Consumes: `EntityConstraints`, `COMPARISON_RULES` from Task 2.
- Produces: `resolveGenerationOrder(entity: EntityConstraints): GenerationOrder`, where

```ts
type GenerationOrder = {
  /** Group representative ids, in the order they must be generated. */
  order: string[];
  /** Member ids keyed by their group's representative id. */
  membersOf: Map<string, string[]>;
  /** Representative id keyed by member id. */
  groupOf: Map<string, string>;
  /** Unsatisfiable reference cycles, as lists of variable ids. Empty when none. */
  cycles: string[][];
};
```

- [ ] **Step 1: Write the failing test**

Create `packages/protocol-utilities/src/generateNetwork/constraints/__tests__/dependencyOrder.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildEntityConstraints } from '../buildConstraints';
import { resolveGenerationOrder } from '../dependencyOrder';

const TODAY = '2026-07-27';

describe('resolveGenerationOrder', () => {
  it('puts a sameAs target before nothing, because the pair becomes one group', () => {
    const entity = buildEntityConstraints(
      {
        a: { name: 'A', type: 'text' },
        b: { name: 'B', type: 'text', validation: { sameAs: 'a' } },
      },
      TODAY,
    );

    const result = resolveGenerationOrder(entity);

    expect(result.cycles).toEqual([]);
    expect(result.order).toHaveLength(1);
    const representative = result.order[0]!;
    expect(result.membersOf.get(representative)?.sort()).toEqual(['a', 'b']);
    expect(result.groupOf.get('a')).toBe(representative);
    expect(result.groupOf.get('b')).toBe(representative);
  });

  it('orders a comparator target before its dependent', () => {
    const entity = buildEntityConstraints(
      {
        later: {
          name: 'Later',
          type: 'number',
          validation: { greaterThanVariable: 'earlier' },
        },
        earlier: { name: 'Earlier', type: 'number' },
      },
      TODAY,
    );

    const result = resolveGenerationOrder(entity);

    expect(result.cycles).toEqual([]);
    expect(result.order.indexOf('earlier')).toBeLessThan(
      result.order.indexOf('later'),
    );
  });

  it('orders a differentFrom target before its dependent', () => {
    const entity = buildEntityConstraints(
      {
        b: { name: 'B', type: 'text', validation: { differentFrom: 'a' } },
        a: { name: 'A', type: 'text' },
      },
      TODAY,
    );

    const result = resolveGenerationOrder(entity);

    expect(result.order.indexOf('a')).toBeLessThan(result.order.indexOf('b'));
  });

  it('reports a strict comparator cycle as unsatisfiable', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: { greaterThanVariable: 'b' },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: { greaterThanVariable: 'a' },
        },
      },
      TODAY,
    );

    const result = resolveGenerationOrder(entity);

    expect(result.cycles).toHaveLength(1);
    expect(result.cycles[0]?.sort()).toEqual(['a', 'b']);
  });

  it('reports a mixed sameAs and comparator cycle as unsatisfiable', () => {
    const entity = buildEntityConstraints(
      {
        a: { name: 'A', type: 'number', validation: { sameAs: 'b' } },
        b: {
          name: 'B',
          type: 'number',
          validation: { greaterThanVariable: 'a' },
        },
      },
      TODAY,
    );

    expect(resolveGenerationOrder(entity).cycles).toHaveLength(1);
  });

  it('ignores references to variables outside the entity', () => {
    const entity = buildEntityConstraints(
      { a: { name: 'A', type: 'text', validation: { sameAs: 'missing' } } },
      TODAY,
    );

    const result = resolveGenerationOrder(entity);

    expect(result.cycles).toEqual([]);
    expect(result.order).toEqual(['a']);
  });

  it('orders independent variables deterministically by codebook order', () => {
    const entity = buildEntityConstraints(
      {
        z: { name: 'Z', type: 'text' },
        a: { name: 'A', type: 'text' },
      },
      TODAY,
    );

    expect(resolveGenerationOrder(entity).order).toEqual(['z', 'a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-utilities test dependencyOrder`
Expected: FAIL — `Failed to resolve import "../dependencyOrder"`.

- [ ] **Step 3: Write the implementation**

Create `packages/protocol-utilities/src/generateNetwork/constraints/dependencyOrder.ts`:

```ts
import { COMPARISON_RULES, type EntityConstraints } from './types';

export type GenerationOrder = {
  order: string[];
  membersOf: Map<string, string[]>;
  groupOf: Map<string, string>;
  cycles: string[][];
};

/**
 * `sameAs` is symmetric and transitive in effect — every member of a chain
 * ends up holding one value — so those variables merge into a single group
 * that generates once. Comparator and `differentFrom` references are
 * directional and become edges between groups.
 */
function buildSameAsGroups(entity: EntityConstraints): {
  groupOf: Map<string, string>;
  membersOf: Map<string, string[]>;
} {
  const parent = new Map<string, string>();
  for (const id of entity.keys()) parent.set(id, id);

  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cursor = id;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor)!;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };

  const union = (a: string, b: string): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  for (const [id, variable] of entity) {
    const target = variable.constraints.sameAs;
    if (target !== undefined && entity.has(target)) union(target, id);
  }

  const groupOf = new Map<string, string>();
  const membersOf = new Map<string, string[]>();
  for (const id of entity.keys()) {
    const root = find(id);
    groupOf.set(id, root);
    const members = membersOf.get(root) ?? [];
    members.push(id);
    membersOf.set(root, members);
  }

  return { groupOf, membersOf };
}

function directedTargets(
  entity: EntityConstraints,
  id: string,
): string[] {
  const { constraints } = entity.get(id)!;
  const targets: string[] = [];

  if (constraints.differentFrom !== undefined) {
    targets.push(constraints.differentFrom);
  }
  for (const rule of COMPARISON_RULES) {
    const target = constraints[rule];
    if (target !== undefined) targets.push(target);
  }

  return targets.filter((target) => entity.has(target));
}

export function resolveGenerationOrder(
  entity: EntityConstraints,
): GenerationOrder {
  const { groupOf, membersOf } = buildSameAsGroups(entity);

  const groups = [...new Set([...entity.keys()].map((id) => groupOf.get(id)!))];
  const dependencies = new Map<string, Set<string>>();
  for (const group of groups) dependencies.set(group, new Set());

  for (const id of entity.keys()) {
    const from = groupOf.get(id)!;
    for (const target of directedTargets(entity, id)) {
      const to = groupOf.get(target)!;
      if (to !== from) dependencies.get(from)!.add(to);
    }
  }

  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const cycles: string[][] = [];

  const visit = (group: string, stack: string[]): void => {
    const current = state.get(group);
    if (current === 'done') return;
    if (current === 'visiting') {
      const start = stack.indexOf(group);
      const groupsInCycle = stack.slice(start === -1 ? 0 : start);
      cycles.push(groupsInCycle.flatMap((g) => membersOf.get(g) ?? []));
      return;
    }

    state.set(group, 'visiting');
    for (const dependency of dependencies.get(group)!) {
      visit(dependency, [...stack, group]);
    }
    state.set(group, 'done');
    order.push(group);
  };

  for (const group of groups) visit(group, []);

  // A sameAs group that also holds a directional reference to itself is a
  // contradiction the group merge hides: the members must be equal AND ordered.
  for (const id of entity.keys()) {
    const from = groupOf.get(id)!;
    for (const target of directedTargets(entity, id)) {
      if (groupOf.get(target) === from) {
        cycles.push(membersOf.get(from) ?? []);
      }
    }
  }

  return { order, membersOf, groupOf, cycles };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/protocol-utilities test dependencyOrder`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-utilities/src/generateNetwork/constraints/dependencyOrder.ts packages/protocol-utilities/src/generateNetwork/constraints/__tests__/dependencyOrder.test.ts
git commit -m "feat(protocol-utilities): resolve cross-variable generation order"
```

---

### Task 6: Feasibility analysis

Aggregate every conflict the codebook expresses and throw once, before generating anything.

**Files:**

- Create: `packages/protocol-utilities/src/generateNetwork/constraints/feasibility.ts`
- Modify: `packages/protocol-utilities/src/index.ts`
- Test: `packages/protocol-utilities/src/generateNetwork/constraints/__tests__/feasibility.test.ts`

**Interfaces:**

- Consumes: `buildEntityConstraints` (Task 2), `valueSpaceSize` (Task 3), `worstCaseEntityCounts` (Task 4), `resolveGenerationOrder` (Task 5).
- Produces:
  - `type ConstraintConflict = { entity: 'ego' | 'node' | 'edge'; entityType?: string; variableIds: string[]; variableNames: string[]; rules: string[]; reason: string }`
  - `analyseFeasibility(codebook: StructuralCodebook, stages: Stage[], config: GenerationConfig): ConstraintConflict[]`
  - `class SyntheticDataConstraintError extends Error` with a readonly `conflicts: ConstraintConflict[]`

- [ ] **Step 1: Write the failing test**

Create `packages/protocol-utilities/src/generateNetwork/constraints/__tests__/feasibility.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';

import { resolveGenerationConfig } from '../../config';
import { analyseFeasibility, SyntheticDataConstraintError } from '../feasibility';

const config = resolveGenerationConfig({ today: '2026-07-27' });

const nameGenerator = {
  id: 'stage-1',
  type: 'NameGenerator',
  label: 'Name generator',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'p1', text: 'Name people' }],
  behaviours: { maxNodes: 8 },
} as unknown as Stage;

function codebookWith(variables: Record<string, unknown>): StructuralCodebook {
  return {
    node: {
      person: {
        color: 'node-color-seq-1',
        variables,
      },
    },
  } as unknown as StructuralCodebook;
}

describe('analyseFeasibility', () => {
  it('reports nothing for a satisfiable codebook', () => {
    const codebook = codebookWith({
      name: { name: 'Name', type: 'text', validation: { required: true } },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('reports minLength above maxLength', () => {
    const codebook = codebookWith({
      name: {
        name: 'Name',
        type: 'text',
        validation: { minLength: 24, maxLength: 10 },
      },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.variableNames).toEqual(['Name']);
    expect(conflicts[0]?.rules.sort()).toEqual(['maxLength', 'minLength']);
  });

  it('reports minValue above maxValue', () => {
    const codebook = codebookWith({
      age: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 50, maxValue: 20 },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toHaveLength(1);
  });

  it('reports minSelected above the option count', () => {
    const codebook = codebookWith({
      tags: {
        name: 'Tags',
        type: 'categorical',
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
        ],
        validation: { minSelected: 3 },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toHaveLength(1);
  });

  it('reports sameAs and differentFrom naming the same target', () => {
    const codebook = codebookWith({
      a: { name: 'A', type: 'text' },
      b: {
        name: 'B',
        type: 'text',
        validation: { sameAs: 'a', differentFrom: 'a' },
      },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules.sort()).toEqual(['differentFrom', 'sameAs']);
  });

  it('reports a strict comparator cycle', () => {
    const codebook = codebookWith({
      a: { name: 'A', type: 'number', validation: { greaterThanVariable: 'b' } },
      b: { name: 'B', type: 'number', validation: { greaterThanVariable: 'a' } },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toContain('cycle');
  });

  it('reports disjoint bounds across a comparator', () => {
    const codebook = codebookWith({
      low: { name: 'Low', type: 'number', validation: { maxValue: 5 } },
      high: {
        name: 'High',
        type: 'number',
        validation: { minValue: 10, lessThanVariable: 'low' },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toHaveLength(1);
  });

  it('reports unique against a value space smaller than the worst-case count', () => {
    const codebook = codebookWith({
      band: {
        name: 'Band',
        type: 'ordinal',
        options: [
          { label: 'A', value: 1 },
          { label: 'B', value: 2 },
          { label: 'C', value: 3 },
        ],
        validation: { unique: true },
      },
    });

    // maxNodes 8 against a 3-value space.
    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['unique']);
  });

  it('accepts unique when the value space is large enough', () => {
    const codebook = codebookWith({
      name: { name: 'Name', type: 'text', validation: { unique: true } },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('analyses ego and edge variables too', () => {
    const codebook = {
      ego: {
        variables: {
          a: {
            name: 'A',
            type: 'text',
            validation: { minLength: 10, maxLength: 2 },
          },
        },
      },
    } as unknown as StructuralCodebook;

    const conflicts = analyseFeasibility(codebook, [], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entity).toBe('ego');
  });
});

describe('SyntheticDataConstraintError', () => {
  it('names every conflicting variable in its message', () => {
    const error = new SyntheticDataConstraintError([
      {
        entity: 'node',
        entityType: 'person',
        variableIds: ['name'],
        variableNames: ['Name'],
        rules: ['minLength', 'maxLength'],
        reason: 'minLength 24 exceeds maxLength 10',
      },
    ]);

    expect(error.message).toContain('person');
    expect(error.message).toContain('Name');
    expect(error.message).toContain('minLength 24 exceeds maxLength 10');
    expect(error.conflicts).toHaveLength(1);
    expect(error.name).toBe('SyntheticDataConstraintError');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-utilities test feasibility`
Expected: FAIL — `Failed to resolve import "../feasibility"`.

- [ ] **Step 3: Write the implementation**

Create `packages/protocol-utilities/src/generateNetwork/constraints/feasibility.ts`:

```ts
import type { Stage, StructuralCodebook, Variables } from '@codaco/protocol-validation';

import type { GenerationConfig } from '../config';
import { buildEntityConstraints } from './buildConstraints';
import { resolveGenerationOrder } from './dependencyOrder';
import { worstCaseEntityCounts } from './entityCounts';
import { COMPARISON_RULES, type EntityConstraints } from './types';
import { valueSpaceSize } from './valueSpace';

export type ConstraintConflict = {
  entity: 'ego' | 'node' | 'edge';
  entityType?: string;
  variableIds: string[];
  variableNames: string[];
  rules: string[];
  reason: string;
};

export class SyntheticDataConstraintError extends Error {
  readonly conflicts: ConstraintConflict[];

  constructor(conflicts: ConstraintConflict[]) {
    const lines = conflicts.map((conflict) => {
      const subject =
        conflict.entity === 'ego'
          ? 'ego'
          : `${conflict.entity} "${conflict.entityType}"`;
      return `  - ${subject}, ${conflict.variableNames.map((name) => `"${name}"`).join(' and ')} (${conflict.rules.join(', ')}): ${conflict.reason}`;
    });

    super(
      'Synthetic data cannot be generated: this protocol declares validation ' +
        `rules that no value can satisfy.\n${lines.join('\n')}`,
    );
    this.name = 'SyntheticDataConstraintError';
    this.conflicts = conflicts;
  }
}

type EntityScope = {
  entity: 'ego' | 'node' | 'edge';
  entityType?: string;
  variables: Variables | undefined;
  worstCaseCount: number;
};

function namesOf(entity: EntityConstraints, ids: string[]): string[] {
  return ids.map((id) => entity.get(id)?.entry.name ?? id);
}

function analyseEntity(
  scope: EntityScope,
  config: GenerationConfig,
): ConstraintConflict[] {
  const entity = buildEntityConstraints(scope.variables, config.today);
  const conflicts: ConstraintConflict[] = [];

  const report = (
    variableIds: string[],
    rules: string[],
    reason: string,
  ): void => {
    conflicts.push({
      entity: scope.entity,
      ...(scope.entityType !== undefined
        ? { entityType: scope.entityType }
        : {}),
      variableIds,
      variableNames: namesOf(entity, variableIds),
      rules,
      reason,
    });
  };

  for (const [id, variable] of entity) {
    const { constraints, entry } = variable;

    if (
      constraints.minLength !== undefined &&
      constraints.maxLength !== undefined &&
      constraints.minLength > constraints.maxLength
    ) {
      report(
        [id],
        ['minLength', 'maxLength'],
        `minLength ${constraints.minLength} exceeds maxLength ${constraints.maxLength}`,
      );
    }

    if (
      constraints.minValue !== undefined &&
      constraints.maxValue !== undefined &&
      constraints.minValue > constraints.maxValue
    ) {
      report(
        [id],
        ['minValue', 'maxValue'],
        `minValue ${constraints.minValue} exceeds maxValue ${constraints.maxValue}`,
      );
    }

    if (
      constraints.minSelected !== undefined &&
      constraints.maxSelected !== undefined &&
      constraints.minSelected > constraints.maxSelected
    ) {
      report(
        [id],
        ['minSelected', 'maxSelected'],
        `minSelected ${constraints.minSelected} exceeds maxSelected ${constraints.maxSelected}`,
      );
    }

    const optionCount = entry.options?.length ?? 0;
    if (
      constraints.minSelected !== undefined &&
      optionCount > 0 &&
      constraints.minSelected > optionCount
    ) {
      report(
        [id],
        ['minSelected'],
        `minSelected ${constraints.minSelected} exceeds the ${optionCount} available options`,
      );
    }

    const window = constraints.dateWindow;
    if (window?.min !== undefined && window.max !== undefined && window.min > window.max) {
      report(
        [id],
        ['parameters'],
        `the date range ${window.min} to ${window.max} is empty`,
      );
    }

    if (
      constraints.sameAs !== undefined &&
      constraints.sameAs === constraints.differentFrom
    ) {
      report(
        [id],
        ['sameAs', 'differentFrom'],
        `cannot be both the same as and different from "${namesOf(entity, [constraints.sameAs])[0]}"`,
      );
    }

    for (const rule of COMPARISON_RULES) {
      const targetId = constraints[rule];
      if (targetId === undefined) continue;

      const target = entity.get(targetId);
      if (!target) continue;

      const wantsGreater =
        rule === 'greaterThanVariable' || rule === 'greaterThanOrEqualToVariable';
      const opposite = wantsGreater
        ? constraints.lessThanVariable ?? constraints.lessThanOrEqualToVariable
        : constraints.greaterThanVariable ??
          constraints.greaterThanOrEqualToVariable;

      if (opposite === targetId) {
        report(
          [id, targetId],
          [rule, wantsGreater ? 'lessThanVariable' : 'greaterThanVariable'],
          'cannot be both greater than and less than the same variable',
        );
      }

      const selfBound = wantsGreater ? constraints.maxValue : constraints.minValue;
      const targetBound = wantsGreater
        ? target.constraints.minValue
        : target.constraints.maxValue;

      if (selfBound !== undefined && targetBound !== undefined) {
        const impossible = wantsGreater
          ? selfBound <= targetBound
          : selfBound >= targetBound;
        if (impossible) {
          report(
            [id, targetId],
            [rule],
            `its own bounds cannot reach a value ${wantsGreater ? 'above' : 'below'} "${target.entry.name}"`,
          );
        }
      }
    }

    if (constraints.unique) {
      if (scope.entity === 'ego') {
        report([id], ['unique'], 'unique is not supported on ego variables');
      } else {
        const size = valueSpaceSize(variable, scope.worstCaseCount);
        if (size !== 'unbounded' && size < scope.worstCaseCount) {
          report(
            [id],
            ['unique'],
            `only ${size} distinct values are possible, but up to ${scope.worstCaseCount} ${scope.entity}s of this type can be generated`,
          );
        }
      }
    }
  }

  for (const cycle of resolveGenerationOrder(entity).cycles) {
    report(
      cycle,
      ['sameAs', ...COMPARISON_RULES, 'differentFrom'].filter((rule) =>
        cycle.some((id) => {
          const constraints = entity.get(id)?.constraints;
          return (
            constraints !== undefined &&
            constraints[rule as keyof typeof constraints] !== undefined
          );
        }),
      ),
      'these variables reference each other in a cycle that no assignment can satisfy',
    );
  }

  return conflicts;
}

export function analyseFeasibility(
  codebook: StructuralCodebook,
  stages: Stage[],
  config: GenerationConfig,
): ConstraintConflict[] {
  const counts = worstCaseEntityCounts(stages, config);
  const scopes: EntityScope[] = [
    {
      entity: 'ego',
      variables: codebook.ego?.variables,
      worstCaseCount: 1,
    },
  ];

  for (const [type, definition] of Object.entries(codebook.node ?? {})) {
    scopes.push({
      entity: 'node',
      entityType: type,
      variables: definition.variables,
      worstCaseCount: counts.node.get(type) ?? 0,
    });
  }

  for (const [type, definition] of Object.entries(codebook.edge ?? {})) {
    scopes.push({
      entity: 'edge',
      entityType: type,
      variables: definition.variables,
      worstCaseCount: counts.edge.get(type) ?? 0,
    });
  }

  return scopes.flatMap((scope) => analyseEntity(scope, config));
}
```

- [ ] **Step 4: Export the error from the package entry point**

In `packages/protocol-utilities/src/index.ts`, add:

```ts
export type { ConstraintConflict } from './generateNetwork/constraints/feasibility';
export { SyntheticDataConstraintError } from './generateNetwork/constraints/feasibility';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @codaco/protocol-utilities test feasibility`
Expected: PASS — 11 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/protocol-utilities/src/generateNetwork/constraints/feasibility.ts packages/protocol-utilities/src/generateNetwork/constraints/__tests__/feasibility.test.ts packages/protocol-utilities/src/index.ts
git commit -m "feat(protocol-utilities): analyse constraint feasibility before generating"
```

---

### Task 7: Constrained value primitives

Teach `ValueGenerator` to draw within bounds. This task adds new methods and leaves `generateForVariable` in place, so the package stays green; Task 9 removes the old path.

**Files:**

- Modify: `packages/protocol-utilities/src/ValueGenerator.ts`
- Test: `packages/protocol-utilities/src/__tests__/ValueGenerator.constrained.test.ts`

**Interfaces:**

- Consumes: `VariableConstraints`, `ConstrainedVariable` (Task 2); `addSteps`, `stepsBetween` (Task 1).
- Produces, on `ValueGenerator`:
  - `generateConstrained(variable: ConstrainedVariable, index: number, opts?: { distinctSeq?: number }): VariableValue`
  - `generateComparedTo(variable: ConstrainedVariable, target: VariableValue, direction: 'greater' | 'less' | 'greaterOrEqual' | 'lessOrEqual'): VariableValue`

- [ ] **Step 1: Write the failing test**

Create `packages/protocol-utilities/src/__tests__/ValueGenerator.constrained.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildVariableConstraints } from '../generateNetwork/constraints/buildConstraints';
import type { ConstrainedVariable } from '../generateNetwork/constraints/types';
import type { VariableEntry } from '../types';
import { ValueGenerator } from '../ValueGenerator';

const TODAY = '2026-07-27';

function make(entry: VariableEntry): ConstrainedVariable {
  return { entry, constraints: buildVariableConstraints(entry, TODAY) };
}

describe('generateConstrained', () => {
  it('respects an exact text length', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'text',
      validation: { minLength: 24, maxLength: 24 },
    });

    for (let index = 0; index < 25; index++) {
      expect(String(gen.generateConstrained(variable, index))).toHaveLength(24);
    }
  });

  it('respects a text maximum shorter than a generated name', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'text',
      validation: { maxLength: 3 },
    });

    for (let index = 0; index < 25; index++) {
      expect(
        String(gen.generateConstrained(variable, index)).length,
      ).toBeLessThanOrEqual(3);
    }
  });

  it('produces distinct text for distinct sequence numbers within the budget', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'text',
      validation: { minLength: 24, maxLength: 24, unique: true },
    });

    const values = new Set<string>();
    for (let seq = 0; seq < 200; seq++) {
      const value = String(
        gen.generateConstrained(variable, 0, { distinctSeq: seq }),
      );
      expect(value).toHaveLength(24);
      values.add(value);
    }
    expect(values.size).toBe(200);
  });

  it('respects number bounds', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'number',
      validation: { minValue: 10, maxValue: 12 },
    });

    for (let index = 0; index < 25; index++) {
      const value = Number(gen.generateConstrained(variable, index));
      expect(value).toBeGreaterThanOrEqual(10);
      expect(value).toBeLessThanOrEqual(12);
    }
  });

  it('respects scalar bounds', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'scalar',
      validation: { minValue: 0.25, maxValue: 0.5 },
    });

    for (let index = 0; index < 25; index++) {
      const value = Number(gen.generateConstrained(variable, index));
      expect(value).toBeGreaterThanOrEqual(0.25);
      expect(value).toBeLessThanOrEqual(0.5);
    }
  });

  it('respects categorical selection bounds', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'categorical',
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
        { label: 'C', value: 'c' },
        { label: 'D', value: 'd' },
      ],
      validation: { minSelected: 2, maxSelected: 3 },
    });

    for (let index = 0; index < 25; index++) {
      const value = gen.generateConstrained(variable, index);
      expect(Array.isArray(value)).toBe(true);
      const selected = value as unknown[];
      expect(selected.length).toBeGreaterThanOrEqual(2);
      expect(selected.length).toBeLessThanOrEqual(3);
      expect(new Set(selected).size).toBe(selected.length);
    }
  });

  it('emits a datetime at the component resolution inside its window', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'month', min: '2020-01-01', max: '2020-06-30' },
    });

    for (let index = 0; index < 25; index++) {
      const value = String(gen.generateConstrained(variable, index));
      expect(value).toMatch(/^\d{4}-\d{2}$/);
      expect(value >= '2020-01').toBe(true);
      expect(value <= '2020-06').toBe(true);
    }
  });

  it('emits a full-resolution date for RelativeDatePicker inside its window', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'datetime',
      component: 'RelativeDatePicker',
      parameters: { anchor: TODAY, before: 30, after: 0 },
    });

    for (let index = 0; index < 25; index++) {
      const value = String(gen.generateConstrained(variable, index));
      expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(value >= '2026-06-27').toBe(true);
      expect(value <= TODAY).toBe(true);
    }
  });

  it('is deterministic for a given seed', () => {
    const variable = make({ id: 'v', name: 'V', type: 'text' });
    const first = new ValueGenerator(7).generateConstrained(variable, 0);
    const second = new ValueGenerator(7).generateConstrained(variable, 0);
    expect(first).toBe(second);
  });
});

describe('generateComparedTo', () => {
  it('produces a number strictly greater than its target', () => {
    const gen = new ValueGenerator(1);
    const variable = make({ id: 'v', name: 'V', type: 'number' });
    const value = Number(gen.generateComparedTo(variable, 40, 'greater'));
    expect(value).toBeGreaterThan(40);
  });

  it('produces a number strictly less than its target', () => {
    const gen = new ValueGenerator(1);
    const variable = make({ id: 'v', name: 'V', type: 'number' });
    const value = Number(gen.generateComparedTo(variable, 40, 'less'));
    expect(value).toBeLessThan(40);
  });

  it('allows equality for the inclusive directions', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'number',
      validation: { minValue: 40, maxValue: 40 },
    });
    expect(Number(gen.generateComparedTo(variable, 40, 'greaterOrEqual'))).toBe(40);
  });

  it('produces a date after its target at the window resolution', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2020-01-01', max: '2020-12-31' },
    });

    const value = String(gen.generateComparedTo(variable, '2020-06-15', 'greater'));
    expect(value > '2020-06-15').toBe(true);
    expect(value <= '2020-12-31').toBe(true);
  });

  it('clamps into its own bounds', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'number',
      validation: { minValue: 0, maxValue: 100 },
    });
    const value = Number(gen.generateComparedTo(variable, 99, 'greater'));
    expect(value).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-utilities test ValueGenerator.constrained`
Expected: FAIL — `gen.generateConstrained is not a function`.

- [ ] **Step 3: Write the implementation**

In `packages/protocol-utilities/src/ValueGenerator.ts`, add the imports:

```ts
import { addSteps, stepsBetween } from './generateNetwork/constraints/dateWindow';
import type {
  ConstrainedVariable,
  VariableConstraints,
} from './generateNetwork/constraints/types';
```

Add these module-level helpers above the class:

```ts
const DISTINCT_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Encode `seq` in base 36 and pad it to exactly `length` characters, so
 * distinct sequence numbers give distinct strings that still fit a tight
 * length budget. A suffix would break an exact-length rule such as
 * `minLength: 24, maxLength: 24`.
 */
function distinctText(seq: number, length: number): string {
  let remaining = seq;
  let encoded = '';
  do {
    encoded = DISTINCT_ALPHABET[remaining % DISTINCT_ALPHABET.length]! + encoded;
    remaining = Math.floor(remaining / DISTINCT_ALPHABET.length);
  } while (remaining > 0);

  if (encoded.length >= length) return encoded.slice(-length);
  return DISTINCT_ALPHABET[0]!.repeat(length - encoded.length) + encoded;
}

function fitToLength(
  value: string,
  constraints: VariableConstraints,
): string {
  const { minLength, maxLength } = constraints;
  let result = value;
  if (maxLength !== undefined && result.length > maxLength) {
    result = result.slice(0, maxLength);
  }
  if (minLength !== undefined && result.length < minLength) {
    result = result.padEnd(minLength, DISTINCT_ALPHABET[0]!);
  }
  return result;
}
```

Add the two methods to the class:

```ts
  generateConstrained(
    variable: ConstrainedVariable,
    index: number,
    opts?: { distinctSeq?: number },
  ): VariableValue {
    const { entry, constraints } = variable;
    const seq = opts?.distinctSeq;

    switch (entry.type) {
      case 'text': {
        if (seq !== undefined) {
          const length =
            constraints.minLength ??
            Math.min(constraints.maxLength ?? 12, 12);
          return fitToLength(distinctText(seq, length), constraints);
        }
        return fitToLength(this.faker.person.firstName(), constraints);
      }

      case 'number': {
        const min = Math.ceil(constraints.minValue ?? 18);
        // The default [18, 80] range is far too small to hold a unique value
        // per entity, and valueSpaceSize calls an unbounded number
        // "unbounded" — so a unique variable widens the range to make that
        // claim true. A non-unique variable keeps the realistic default.
        const defaultMax = constraints.unique ? min + this.uniqueHeadroom : 80;
        const max = Math.floor(constraints.maxValue ?? Math.max(min, defaultMax));
        if (seq !== undefined) return min + (seq % Math.max(1, max - min + 1));
        return this.randomInt(min, max);
      }

      case 'scalar': {
        const min = constraints.minValue ?? 0;
        const max = constraints.maxValue ?? 1;
        if (max <= min) return min;
        return Number(this.randomFloat(min, max).toFixed(2));
      }

      case 'boolean':
        return seq !== undefined ? seq % 2 === 0 : this.faker.datatype.boolean();

      case 'ordinal': {
        const options = entry.options ?? [];
        if (options.length === 0) return null;
        const pick = seq ?? index;
        return options[pick % options.length]!.value;
      }

      case 'categorical': {
        const options = entry.options ?? [];
        if (options.length === 0) return null;
        const min = Math.max(1, constraints.minSelected ?? 1);
        const defaultMax = constraints.unique ? options.length : 2;
        const max = Math.min(
          constraints.maxSelected ?? defaultMax,
          options.length,
        );
        const span = Math.max(1, max - min + 1);
        const base = seq ?? index;
        const count = Math.max(min, Math.min(max, min + (base % span)));

        const picked: (number | string | boolean)[] = [];
        for (let i = 0; i < count; i++) {
          picked.push(options[(base + i) % options.length]!.value);
        }
        return [...new Set(picked)];
      }

      case 'datetime': {
        const window = constraints.dateWindow ?? { resolution: 'full' as const };
        const max = window.max ?? this.defaultDateMax(window.resolution);
        const defaultSpan = constraints.unique
          ? this.uniqueHeadroom
          : this.defaultDateSpan(window.resolution);
        const min = window.min ?? addSteps(max, -defaultSpan, window.resolution);
        const span = Math.max(0, stepsBetween(min, max, window.resolution));
        const offset =
          seq !== undefined ? seq % (span + 1) : this.randomInt(0, span);
        return addSteps(min, offset, window.resolution);
      }

      case 'layout':
        return {
          x: 0.1 + ((index * 0.17) % 0.8),
          y: 0.1 + ((index * 0.23) % 0.8),
        };

      case 'location':
        return {
          x: this.faker.location.longitude(),
          y: this.faker.location.latitude(),
        };

      default:
        return null;
    }
  }

  generateComparedTo(
    variable: ConstrainedVariable,
    target: VariableValue,
    direction: 'greater' | 'less' | 'greaterOrEqual' | 'lessOrEqual',
  ): VariableValue {
    const { entry, constraints } = variable;
    const wantsGreater =
      direction === 'greater' || direction === 'greaterOrEqual';
    const inclusive =
      direction === 'greaterOrEqual' || direction === 'lessOrEqual';

    if (entry.type === 'datetime') {
      const window = constraints.dateWindow ?? { resolution: 'full' as const };
      const base = String(target);
      const step = inclusive ? 0 : 1;
      const candidate = addSteps(
        base,
        wantsGreater ? step : -step,
        window.resolution,
      );
      if (wantsGreater && window.max !== undefined && candidate > window.max) {
        return window.max;
      }
      if (!wantsGreater && window.min !== undefined && candidate < window.min) {
        return window.min;
      }
      return candidate;
    }

    const numericTarget = Number(target);
    if (Number.isNaN(numericTarget)) {
      return this.generateConstrained(variable, 0);
    }

    const step = entry.type === 'scalar' ? 0.01 : 1;
    const delta = inclusive ? 0 : step;
    let candidate = wantsGreater ? numericTarget + delta : numericTarget - delta;

    if (constraints.maxValue !== undefined) {
      candidate = Math.min(candidate, constraints.maxValue);
    }
    if (constraints.minValue !== undefined) {
      candidate = Math.max(candidate, constraints.minValue);
    }

    return entry.type === 'scalar'
      ? Number(candidate.toFixed(2))
      : Math.round(candidate);
  }
```

Add the two private helpers to the class:

```ts
  /**
   * How far an unbounded `unique` variable may range beyond its default
   * window. Set well above the largest entity count generation can reach so
   * the value space the feasibility pass calls "unbounded" really is.
   */
  private readonly uniqueHeadroom = 100_000;

  /** Roughly a decade back, replacing the old faker.date.past() window. */
  private defaultDateSpan(resolution: 'full' | 'month' | 'year'): number {
    if (resolution === 'year') return 40;
    if (resolution === 'month') return 480;
    return 3650;
  }

  private defaultDateMax(resolution: 'full' | 'month' | 'year'): string {
    const now = new Date();
    const ymd = `${String(now.getUTCFullYear()).padStart(4, '0')}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
    if (resolution === 'year') return ymd.slice(0, 4);
    if (resolution === 'month') return ymd.slice(0, 7);
    return ymd;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @codaco/protocol-utilities test`
Expected: PASS — the new constrained suite plus every pre-existing suite.

If the `distinct text` test fails because 200 distinct values do not fit the chosen length, the base-36 encoding is wrong — 36² = 1296 fits in two characters, so a 24-character budget has ample room. Debug `distinctText`, do not weaken the test.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-utilities/src/ValueGenerator.ts packages/protocol-utilities/src/__tests__/ValueGenerator.constrained.test.ts
git commit -m "feat(protocol-utilities): draw values within variable constraints"
```

---

### Task 8: Unique registry and entity-level generation

The orchestrator: generate an entity's attributes in dependency order, resolving cross-variable rules and enforcing `unique`.

**Files:**

- Create: `packages/protocol-utilities/src/generateNetwork/constraints/uniqueRegistry.ts`
- Create: `packages/protocol-utilities/src/generateNetwork/constraints/generateEntityAttributes.ts`
- Test: `packages/protocol-utilities/src/generateNetwork/constraints/__tests__/generateEntityAttributes.test.ts`

**Interfaces:**

- Consumes: everything from Tasks 1–7.
- Produces:
  - `class UniqueRegistry` with `isTaken(scope: string, variableId: string, value: VariableValue): boolean`, `claim(scope: string, variableId: string, value: VariableValue): void`, `nextSeq(scope: string, variableId: string): number`
  - `generateEntityAttributes(entity: EntityConstraints, ctx: GenerationContext, scope: string, index: number, options?: { existing?: Record<string, VariableValue>; only?: Set<string> }): Record<string, VariableValue>`

- [ ] **Step 1: Write the failing test**

Create `packages/protocol-utilities/src/generateNetwork/constraints/__tests__/generateEntityAttributes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { GenerationContext } from '../../context';
import { resolveGenerationConfig } from '../../config';
import { ValueGenerator } from '../../../ValueGenerator';
import { buildEntityConstraints } from '../buildConstraints';
import { generateEntityAttributes } from '../generateEntityAttributes';
import { UniqueRegistry } from '../uniqueRegistry';

const TODAY = '2026-07-27';

function makeContext(seed = 1): GenerationContext {
  return {
    codebook: {},
    valueGen: new ValueGenerator(seed),
    config: resolveGenerationConfig({ today: TODAY }),
    usedRosterUids: new Set(),
    externalData: undefined,
    respectSkipLogicAndFiltering: false,
    uniqueRegistry: new UniqueRegistry(),
  } as unknown as GenerationContext;
}

describe('generateEntityAttributes', () => {
  it('satisfies the motivating ego form: two required 24-character fields, one sameAs the other', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'text',
          validation: { required: true, minLength: 24, maxLength: 24 },
        },
        b: {
          name: 'B',
          type: 'text',
          validation: {
            required: true,
            minLength: 24,
            maxLength: 24,
            sameAs: 'a',
          },
        },
      },
      TODAY,
    );

    const attrs = generateEntityAttributes(entity, makeContext(), 'ego', 0);

    expect(String(attrs.a)).toHaveLength(24);
    expect(String(attrs.b)).toHaveLength(24);
    expect(attrs.b).toBe(attrs.a);
  });

  it('satisfies differentFrom', () => {
    const entity = buildEntityConstraints(
      {
        a: { name: 'A', type: 'text' },
        b: { name: 'B', type: 'text', validation: { differentFrom: 'a' } },
      },
      TODAY,
    );

    for (let index = 0; index < 25; index++) {
      const attrs = generateEntityAttributes(
        entity,
        makeContext(index),
        'ego',
        index,
      );
      expect(attrs.b).not.toBe(attrs.a);
    }
  });

  it('satisfies greaterThanVariable', () => {
    const entity = buildEntityConstraints(
      {
        low: { name: 'Low', type: 'number', validation: { minValue: 0, maxValue: 50 } },
        high: {
          name: 'High',
          type: 'number',
          validation: { minValue: 0, maxValue: 100, greaterThanVariable: 'low' },
        },
      },
      TODAY,
    );

    for (let index = 0; index < 25; index++) {
      const attrs = generateEntityAttributes(
        entity,
        makeContext(index),
        'node:person',
        index,
      );
      expect(Number(attrs.high)).toBeGreaterThan(Number(attrs.low));
    }
  });

  it('satisfies lessThanOrEqualToVariable', () => {
    const entity = buildEntityConstraints(
      {
        cap: { name: 'Cap', type: 'number', validation: { minValue: 10, maxValue: 100 } },
        used: {
          name: 'Used',
          type: 'number',
          validation: { minValue: 0, maxValue: 100, lessThanOrEqualToVariable: 'cap' },
        },
      },
      TODAY,
    );

    for (let index = 0; index < 25; index++) {
      const attrs = generateEntityAttributes(
        entity,
        makeContext(index),
        'node:person',
        index,
      );
      expect(Number(attrs.used)).toBeLessThanOrEqual(Number(attrs.cap));
    }
  });

  it('issues unique values across entities in the same scope', () => {
    const entity = buildEntityConstraints(
      {
        band: {
          name: 'Band',
          type: 'ordinal',
          options: [
            { label: 'A', value: 1 },
            { label: 'B', value: 2 },
            { label: 'C', value: 3 },
          ],
          validation: { unique: true },
        },
      },
      TODAY,
    );

    const ctx = makeContext();
    const seen = new Set<unknown>();
    for (let index = 0; index < 3; index++) {
      const attrs = generateEntityAttributes(entity, ctx, 'node:person', index);
      expect(seen.has(attrs.band)).toBe(false);
      seen.add(attrs.band);
    }
  });

  it('keeps unique registries separate per scope', () => {
    const entity = buildEntityConstraints(
      {
        band: {
          name: 'Band',
          type: 'ordinal',
          options: [
            { label: 'A', value: 1 },
            { label: 'B', value: 2 },
          ],
          validation: { unique: true },
        },
      },
      TODAY,
    );

    const ctx = makeContext();
    const first = generateEntityAttributes(entity, ctx, 'node:person', 0);
    const second = generateEntityAttributes(entity, ctx, 'node:place', 0);

    expect(second.band).toBe(first.band);
  });

  it('reads a comparison target from existing attributes when regenerating a subset', () => {
    const entity = buildEntityConstraints(
      {
        low: { name: 'Low', type: 'number', validation: { minValue: 0, maxValue: 100 } },
        high: {
          name: 'High',
          type: 'number',
          validation: { minValue: 0, maxValue: 100, greaterThanVariable: 'low' },
        },
      },
      TODAY,
    );

    const attrs = generateEntityAttributes(entity, makeContext(), 'node:person', 0, {
      existing: { low: 42 },
      only: new Set(['high']),
    });

    expect(Object.keys(attrs)).toEqual(['high']);
    expect(Number(attrs.high)).toBeGreaterThan(42);
  });

  it('is deterministic for a given seed', () => {
    const entity = buildEntityConstraints(
      { a: { name: 'A', type: 'text' }, b: { name: 'B', type: 'number' } },
      TODAY,
    );

    const first = generateEntityAttributes(entity, makeContext(9), 'ego', 0);
    const second = generateEntityAttributes(entity, makeContext(9), 'ego', 0);

    expect(first).toEqual(second);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-utilities test generateEntityAttributes`
Expected: FAIL — `Failed to resolve import "../generateEntityAttributes"`.

- [ ] **Step 3: Write the unique registry**

Create `packages/protocol-utilities/src/generateNetwork/constraints/uniqueRegistry.ts`:

```ts
import type { VariableValue } from '@codaco/shared-consts';

/**
 * Serialise a value into a comparison key. Arrays of primitives are sorted
 * first, because the runtime's `isMatchingValue` compares categorical
 * selections as an order-insensitive multiset — two orderings of the same
 * options are the same value and must not both be issued.
 */
function keyFor(value: VariableValue): string {
  if (Array.isArray(value)) {
    const primitives = value.every(
      (item) =>
        typeof item === 'string' ||
        typeof item === 'number' ||
        typeof item === 'boolean',
    );
    if (primitives) {
      return JSON.stringify(
        [...value].sort((a, b) =>
          `${typeof a}:${String(a)}`.localeCompare(`${typeof b}:${String(b)}`),
        ),
      );
    }
  }
  return JSON.stringify(value ?? null);
}

export class UniqueRegistry {
  private readonly used = new Map<string, Set<string>>();
  private readonly sequences = new Map<string, number>();

  private slot(scope: string, variableId: string): string {
    return `${scope}:${variableId}`;
  }

  isTaken(scope: string, variableId: string, value: VariableValue): boolean {
    return (
      this.used.get(this.slot(scope, variableId))?.has(keyFor(value)) ?? false
    );
  }

  claim(scope: string, variableId: string, value: VariableValue): void {
    const slot = this.slot(scope, variableId);
    const values = this.used.get(slot) ?? new Set<string>();
    values.add(keyFor(value));
    this.used.set(slot, values);
  }

  nextSeq(scope: string, variableId: string): number {
    const slot = this.slot(scope, variableId);
    const next = this.sequences.get(slot) ?? 0;
    this.sequences.set(slot, next + 1);
    return next;
  }
}
```

- [ ] **Step 4: Write the orchestrator**

Create `packages/protocol-utilities/src/generateNetwork/constraints/generateEntityAttributes.ts`:

```ts
import type { VariableValue } from '@codaco/shared-consts';

import type { GenerationContext } from '../context';
import { resolveGenerationOrder } from './dependencyOrder';
import { COMPARISON_RULES, type EntityConstraints } from './types';

const DIRECTION_BY_RULE = {
  greaterThanVariable: 'greater',
  lessThanVariable: 'less',
  greaterThanOrEqualToVariable: 'greaterOrEqual',
  lessThanOrEqualToVariable: 'lessOrEqual',
} as const;

/**
 * How many redraws a `differentFrom` or `unique` variable gets before the run
 * is treated as internally inconsistent. Feasibility has already proven a
 * satisfying value exists, so exhausting this bound is a bug, not a protocol
 * problem.
 */
const MAX_REDRAWS = 1000;

function valuesMatch(a: VariableValue, b: VariableValue): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function generateEntityAttributes(
  entity: EntityConstraints,
  ctx: GenerationContext,
  scope: string,
  index: number,
  options?: {
    existing?: Record<string, VariableValue>;
    only?: Set<string>;
  },
): Record<string, VariableValue> {
  const { order, membersOf } = resolveGenerationOrder(entity);
  const resolved: Record<string, VariableValue> = { ...options?.existing };
  const produced: Record<string, VariableValue> = {};

  for (const group of order) {
    const members = membersOf.get(group) ?? [group];
    const wanted = options?.only
      ? members.filter((id) => options.only!.has(id))
      : members;
    if (wanted.length === 0) continue;

    // The whole group shares one value, so draw against the member carrying
    // the tightest rules — the one that declares the most of them.
    const representative = members.reduce((best, id) => {
      const count = (candidate: string): number =>
        Object.values(entity.get(candidate)!.constraints).filter(
          (rule) => rule !== undefined && rule !== false,
        ).length;
      return count(id) > count(best) ? id : best;
    }, members[0]!);

    const variable = entity.get(representative)!;
    const { constraints } = variable;
    const needsUnique = members.some(
      (id) => entity.get(id)!.constraints.unique,
    );

    let value: VariableValue = null;
    let comparisonApplied = false;

    for (const rule of COMPARISON_RULES) {
      const targetId = constraints[rule];
      if (targetId === undefined) continue;
      const target = resolved[targetId];
      if (target === undefined || target === null) continue;

      value = ctx.valueGen.generateComparedTo(
        variable,
        target,
        DIRECTION_BY_RULE[rule],
      );
      comparisonApplied = true;
      break;
    }

    if (!comparisonApplied) {
      const differentTarget =
        constraints.differentFrom !== undefined
          ? resolved[constraints.differentFrom]
          : undefined;

      let attempts = 0;
      do {
        const seq = needsUnique
          ? ctx.uniqueRegistry.nextSeq(scope, representative)
          : attempts > 0
            ? attempts
            : undefined;
        value = ctx.valueGen.generateConstrained(variable, index, {
          ...(seq !== undefined ? { distinctSeq: seq } : {}),
        });
        attempts += 1;
      } while (
        attempts < MAX_REDRAWS &&
        ((differentTarget !== undefined && valuesMatch(value, differentTarget)) ||
          (needsUnique &&
            ctx.uniqueRegistry.isTaken(scope, representative, value)))
      );

      if (attempts >= MAX_REDRAWS) {
        throw new Error(
          `Could not draw a satisfying value for "${variable.entry.name}" after ${MAX_REDRAWS} attempts. ` +
            'Feasibility analysis should have rejected this protocol first; this is a bug in synthetic data generation.',
        );
      }
    }

    if (needsUnique) {
      ctx.uniqueRegistry.claim(scope, representative, value);
    }

    for (const id of members) {
      resolved[id] = value;
      if (!options?.only || options.only.has(id)) {
        produced[id] = value;
      }
    }
  }

  return produced;
}
```

- [ ] **Step 5: Add the registry to the generation context**

In `packages/protocol-utilities/src/generateNetwork/context.ts`, add the import and the field:

```ts
import type { UniqueRegistry } from './constraints/uniqueRegistry';
```

```ts
  /** Values already issued for `unique` variables, keyed by entity scope. */
  uniqueRegistry: UniqueRegistry;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @codaco/protocol-utilities test generateEntityAttributes`
Expected: PASS — 8 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/protocol-utilities/src/generateNetwork/constraints/uniqueRegistry.ts packages/protocol-utilities/src/generateNetwork/constraints/generateEntityAttributes.ts packages/protocol-utilities/src/generateNetwork/constraints/__tests__/generateEntityAttributes.test.ts packages/protocol-utilities/src/generateNetwork/context.ts
git commit -m "feat(protocol-utilities): generate entity attributes in dependency order"
```

---

### Task 9: Migrate every call site

Replace the per-variable generation path throughout `generateNetwork`, wire the feasibility pass in, and delete the old functions.

**Files:**

- Modify: `packages/protocol-utilities/src/generateNetwork.ts`
- Modify: `packages/protocol-utilities/src/generateNetwork/attributes.ts`
- Modify: `packages/protocol-utilities/src/generateNetwork/nodes.ts:132`
- Modify: `packages/protocol-utilities/src/generateNetwork/edges.ts:41`
- Modify: `packages/protocol-utilities/src/generateNetwork/stageHandlers.ts` (lines 49–64, 189–198, 281–292, 294–352, 372–379)
- Modify: `packages/protocol-utilities/src/SyntheticInterview.ts:1565-1590`
- Modify: `packages/protocol-utilities/src/ValueGenerator.ts` (remove `generateForVariable`)
- Test: `packages/protocol-utilities/src/__tests__/generateNetwork.constraints.test.ts`

**Interfaces:**

- Consumes: `analyseFeasibility`, `SyntheticDataConstraintError` (Task 6); `generateEntityAttributes`, `UniqueRegistry` (Task 8); `buildEntityConstraints` (Task 2).
- Produces: no new exports. `generateAttributes` and `ValueGenerator.generateForVariable` no longer exist.

- [ ] **Step 1: Write the failing test**

Create `packages/protocol-utilities/src/__tests__/generateNetwork.constraints.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../generateNetwork';
import { SyntheticDataConstraintError } from '../generateNetwork/constraints/feasibility';

type Params = Parameters<typeof generateNetwork>[0];

const nameGeneratorStage = {
  id: 'stage-1',
  type: 'NameGenerator',
  label: 'Name generator',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'p1', text: 'Name people' }],
  behaviours: { minNodes: 5, maxNodes: 5 },
} as unknown as Params['stages'][number];

const egoFormStage = {
  id: 'stage-ego',
  type: 'EgoForm',
  label: 'About you',
  form: {
    fields: [
      { variable: 'a', prompt: 'A' },
      { variable: 'b', prompt: 'B' },
    ],
  },
} as unknown as Params['stages'][number];

describe('generateNetwork constraint conformance', () => {
  it('satisfies the motivating ego form', () => {
    const { network } = generateNetwork({
      seed: 3,
      codebook: {
        ego: {
          variables: {
            a: {
              name: 'A',
              type: 'text',
              validation: { required: true, minLength: 24, maxLength: 24 },
            },
            b: {
              name: 'B',
              type: 'text',
              validation: {
                required: true,
                minLength: 24,
                maxLength: 24,
                sameAs: 'a',
              },
            },
          },
        },
      } as unknown as Params['codebook'],
      stages: [egoFormStage],
    });

    const ego = network.ego?.[entityAttributesProperty] ?? {};
    expect(String(ego.a)).toHaveLength(24);
    expect(ego.b).toBe(ego.a);
  });

  it('issues unique node values across a stage', () => {
    const { network } = generateNetwork({
      seed: 3,
      codebook: {
        node: {
          person: {
            color: 'node-color-seq-1',
            variables: {
              code: {
                name: 'Code',
                type: 'text',
                validation: { unique: true, minLength: 4, maxLength: 4 },
              },
            },
          },
        },
      } as unknown as Params['codebook'],
      stages: [nameGeneratorStage],
    });

    const codes = network.nodes.map((node) => node[entityAttributesProperty].code);
    expect(codes).toHaveLength(5);
    expect(new Set(codes).size).toBe(5);
  });

  it('throws before generating when a protocol is unsatisfiable', () => {
    expect(() =>
      generateNetwork({
        seed: 3,
        codebook: {
          node: {
            person: {
              color: 'node-color-seq-1',
              variables: {
                code: {
                  name: 'Code',
                  type: 'text',
                  validation: { minLength: 24, maxLength: 10 },
                },
              },
            },
          },
        } as unknown as Params['codebook'],
        stages: [nameGeneratorStage],
      }),
    ).toThrow(SyntheticDataConstraintError);
  });

  it('throws identically regardless of seed', () => {
    const build = (seed: number) => () =>
      generateNetwork({
        seed,
        codebook: {
          node: {
            person: {
              color: 'node-color-seq-1',
              variables: {
                band: {
                  name: 'Band',
                  type: 'ordinal',
                  options: [
                    { label: 'A', value: 1 },
                    { label: 'B', value: 2 },
                  ],
                  validation: { unique: true },
                },
              },
            },
          },
        } as unknown as Params['codebook'],
        stages: [nameGeneratorStage],
      });

    for (const seed of [1, 2, 3, 4, 5]) {
      expect(build(seed)).toThrow(SyntheticDataConstraintError);
    }
  });

  it('keeps AlterForm regeneration consistent with untouched attributes', () => {
    const { network } = generateNetwork({
      seed: 3,
      codebook: {
        node: {
          person: {
            color: 'node-color-seq-1',
            variables: {
              low: {
                name: 'Low',
                type: 'number',
                validation: { minValue: 0, maxValue: 50 },
              },
              high: {
                name: 'High',
                type: 'number',
                validation: {
                  minValue: 0,
                  maxValue: 100,
                  greaterThanVariable: 'low',
                },
              },
            },
          },
        },
      } as unknown as Params['codebook'],
      stages: [
        nameGeneratorStage,
        {
          id: 'stage-alter',
          type: 'AlterForm',
          label: 'Alter form',
          subject: { entity: 'node', type: 'person' },
          form: { fields: [{ variable: 'high', prompt: 'High' }] },
        } as unknown as Params['stages'][number],
      ],
    });

    for (const node of network.nodes) {
      const attrs = node[entityAttributesProperty];
      expect(Number(attrs.high)).toBeGreaterThan(Number(attrs.low));
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-utilities test generateNetwork.constraints`
Expected: FAIL — the ego-form assertion fails because `b` does not equal `a`, and the unsatisfiable-protocol test does not throw.

- [ ] **Step 3: Build entity constraints once per run and wire the feasibility pass**

In `packages/protocol-utilities/src/generateNetwork.ts`, add the imports:

```ts
import { buildEntityConstraints } from './generateNetwork/constraints/buildConstraints';
import {
  analyseFeasibility,
  SyntheticDataConstraintError,
} from './generateNetwork/constraints/feasibility';
import { UniqueRegistry } from './generateNetwork/constraints/uniqueRegistry';
```

Replace the context construction (currently lines 92–103) with:

```ts
  const valueGen = new ValueGenerator(
    seed ?? Math.floor(Math.random() * 100000),
  );

  const resolvedConfig = resolveGenerationConfig(config);

  const conflicts = analyseFeasibility(codebook, stages, resolvedConfig);
  if (conflicts.length > 0) {
    throw new SyntheticDataConstraintError(conflicts);
  }

  const entityConstraints = {
    ego: buildEntityConstraints(codebook.ego?.variables, resolvedConfig.today),
    node: new Map(
      Object.entries(codebook.node ?? {}).map(([type, definition]) => [
        type,
        buildEntityConstraints(definition.variables, resolvedConfig.today),
      ]),
    ),
    edge: new Map(
      Object.entries(codebook.edge ?? {}).map(([type, definition]) => [
        type,
        buildEntityConstraints(definition.variables, resolvedConfig.today),
      ]),
    ),
  };

  const ctx: GenerationContext = {
    codebook,
    valueGen,
    config: resolvedConfig,
    usedRosterUids: new Set<string>(),
    externalData,
    respectSkipLogicAndFiltering,
    uniqueRegistry: new UniqueRegistry(),
    entityConstraints,
  };
```

- [ ] **Step 4: Add the constraint maps to the context type**

In `packages/protocol-utilities/src/generateNetwork/context.ts`, add:

```ts
import type { EntityConstraints } from './constraints/types';
```

```ts
  /** Constraint descriptors built once per run, keyed by entity type. */
  entityConstraints: {
    ego: EntityConstraints;
    node: Map<string, EntityConstraints>;
    edge: Map<string, EntityConstraints>;
  };
```

- [ ] **Step 5: Add a scope helper and replace `generateAttributes`**

Replace the whole body of `packages/protocol-utilities/src/generateNetwork/attributes.ts` after `toVariableEntry` with:

```ts
import type { GenerationContext } from './context';
import { generateEntityAttributes } from './constraints/generateEntityAttributes';

export type EntityScopeRef =
  | { entity: 'ego' }
  | { entity: 'node' | 'edge'; type: string };

function scopeKey(ref: EntityScopeRef): string {
  return ref.entity === 'ego' ? 'ego' : `${ref.entity}:${ref.type}`;
}

function constraintsFor(
  ctx: GenerationContext,
  ref: EntityScopeRef,
): EntityConstraints {
  if (ref.entity === 'ego') return ctx.entityConstraints.ego;
  return (
    ctx.entityConstraints[ref.entity].get(ref.type) ?? new Map()
  );
}

export function generateAttributesForEntity(
  ctx: GenerationContext,
  ref: EntityScopeRef,
  index: number,
  options?: {
    existing?: Record<string, VariableValue>;
    only?: Set<string>;
  },
): Record<string, VariableValue> {
  return generateEntityAttributes(
    constraintsFor(ctx, ref),
    ctx,
    scopeKey(ref),
    index,
    options,
  );
}
```

Delete the old `generateAttributes` function. Keep `toVariableEntry` — `buildConstraints` imports it. Add the imports it now needs (`EntityConstraints` from `./constraints/types`, `VariableValue` from `@codaco/shared-consts`) and remove the now-unused `ValueGenerator` import.

- [ ] **Step 6: Update `nodes.ts`**

Replace the `generateAttributes` call at line 132 with:

```ts
    const attrs = generateAttributesForEntity(
      ctx,
      { entity: 'node', type: nodeType },
      nodeIndex,
    );
```

Update the import on line 10 to `import { generateAttributesForEntity } from './attributes';`.

- [ ] **Step 7: Update `edges.ts`**

`createEdgesForPairs` currently takes `edgeVariables?: Variables`. Change its signature to take the edge type instead, since the constraints are already built:

```ts
export function createEdgesForPairs(
  ctx: GenerationContext,
  nodes: NcNode[],
  edgeType: string,
  probability: number,
  withAttributes: boolean,
): { edges: NcEdge[]; negativeIndices: [number, number][] } {
```

and inside the loop:

```ts
        const attrs = withAttributes
          ? generateAttributesForEntity(
              ctx,
              { entity: 'edge', type: edgeType },
              edges.length,
            )
          : {};
```

Update the import and drop the now-unused `Variables` type import. There are **four** call sites in `stageHandlers.ts` — at lines 83, 134, 181 and 472. Each passes an `edgeVariables` argument today; change every one to pass a boolean instead. Where the current argument is `edgeTypeDef?.variables`, pass `edgeTypeDef?.variables !== undefined`; where it passes nothing, pass `false`.

- [ ] **Step 8: Update `stageHandlers.ts`**

`handleEgoForm` (lines 281–292):

```ts
export function handleEgoForm(
  ctx: GenerationContext,
  draft: NetworkDraft,
): void {
  Object.assign(
    draft.egoAttributes,
    generateAttributesForEntity(ctx, { entity: 'ego' }, 0),
  );
}
```

`handleAlterForm` (lines 311–321), replacing the inner loop:

```ts
  for (let nodeIndex = 0; nodeIndex < subjectNodes.length; nodeIndex++) {
    const node = subjectNodes[nodeIndex]!;
    Object.assign(
      node[entityAttributesProperty],
      generateAttributesForEntity(
        ctx,
        { entity: 'node', type: subjectType },
        nodeIndex,
        {
          existing: node[entityAttributesProperty],
          only: new Set(formVarIds),
        },
      ),
    );
  }
```

`handleAlterEdgeForm` (lines 341–351), the same shape with `{ entity: 'edge', type: subjectType }` and `edge[entityAttributesProperty]`.

The name-generator stage form fill (lines 49–64) becomes:

```ts
    if (form && nodeTypeDef?.variables && subjectType !== undefined) {
      const formVarIds = form.fields.map((f) => f.variable);
      for (const node of newNodes) {
        const attrs = node[entityAttributesProperty];
        const missing = new Set(formVarIds.filter((varId) => !(varId in attrs)));
        if (missing.size === 0) continue;
        Object.assign(
          attrs,
          generateAttributesForEntity(
            ctx,
            { entity: 'node', type: subjectType },
            draft.nodes.length,
            { existing: attrs, only: missing },
          ),
        );
      }
    }
```

The TieStrengthCensus edge-variable fill (lines 192–198) becomes:

```ts
    if (edgeVariable && edgeVarDef) {
      for (let edgeIdx = 0; edgeIdx < newEdges.length; edgeIdx++) {
        const edge = newEdges[edgeIdx]!;
        Object.assign(
          edge[entityAttributesProperty],
          generateAttributesForEntity(
            ctx,
            { entity: 'edge', type: createEdgeType },
            edgeIdx,
            {
              existing: edge[entityAttributesProperty],
              only: new Set([edgeVariable]),
            },
          ),
        );
      }
    }
```

`handleFamilyPedigree` (lines 374–378) becomes:

```ts
    const attrs = generateAttributesForEntity(
      ctx,
      { entity: 'node', type: nodeType },
      draft.nodes.length + nodeIndex,
    );
```

Remove the now-unused `toVariableEntry` import from `stageHandlers.ts`.

- [ ] **Step 9: Update `SyntheticInterview.getNetwork`**

`SyntheticInterview` holds its own `VariableEntry` maps rather than a codebook, so build constraints from those directly. In `packages/protocol-utilities/src/SyntheticInterview.ts`, add the imports:

```ts
import { buildVariableConstraints } from './generateNetwork/constraints/buildConstraints';
import { todayYmd } from './generateNetwork/constraints/dateWindow';
```

Replace the generation branch at lines 1583–1587 with:

```ts
            attributes[varId] = (
              nodeEntry.manual
                ? valueGen.neutralForVariable(variable)
                : valueGen.generateConstrained(
                    {
                      entry: variable,
                      constraints: buildVariableConstraints(variable, today),
                    },
                    index,
                  )
            ) as VariableValue;
```

Add `const today = todayYmd();` alongside the `valueGen` construction at line 1566. This is the only `generateForVariable` call in the file; confirm with `grep -n "generateForVariable" packages/protocol-utilities/src/SyntheticInterview.ts` before and after.

- [ ] **Step 10: Delete the old generator method**

Remove `generateForVariable` from `packages/protocol-utilities/src/ValueGenerator.ts`. Run a search to confirm nothing references it:

```bash
grep -rn "generateForVariable\|generateAttributes(" packages/protocol-utilities/src
```

Expected: no matches other than `generateAttributesForEntity`.

- [ ] **Step 11: Run the whole suite**

Run: `pnpm --filter @codaco/protocol-utilities test`
Expected: PASS. Pre-existing tests that assert exact generated values will fail because seeded output has changed by design — update those expectations to the new values, but only after confirming the new value satisfies the variable's rules. Do not weaken an assertion to make it pass.

Run: `pnpm --filter @codaco/protocol-utilities typecheck`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add packages/protocol-utilities/src
git commit -m "feat(protocol-utilities): generate constraint-conforming synthetic data"
```

---

### Task 10: Extract the field validation props

The conformance test must validate against the _same_ props `useProtocolForm` builds, or it proves nothing. Extract that mapping into a pure function both use.

**Files:**

- Create: `packages/interview/src/forms/buildFieldValidationProps.ts`
- Modify: `packages/interview/src/forms/useProtocolForm.tsx:210-257`
- Modify: `packages/fresco-ui/package.json` (add the `./form/validation/helpers` export)
- Test: `packages/interview/src/forms/__tests__/buildFieldValidationProps.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `buildFieldValidationProps(field: { type: Variable['type']; variable: string; validation?: Record<string, unknown> }): Partial<ValidationPropsCatalogue>`

- [ ] **Step 1: Write the failing test**

Create `packages/interview/src/forms/__tests__/buildFieldValidationProps.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildFieldValidationProps } from '../buildFieldValidationProps';

describe('buildFieldValidationProps', () => {
  it('returns an empty object when the field has no validation', () => {
    expect(
      buildFieldValidationProps({ type: 'text', variable: 'v1' }),
    ).toEqual({});
  });

  it('maps the scalar rules straight through', () => {
    expect(
      buildFieldValidationProps({
        type: 'text',
        variable: 'v1',
        validation: { required: true, minLength: 2, maxLength: 8 },
      }),
    ).toEqual({ required: true, minLength: 2, maxLength: 8 });
  });

  it('maps unique to the field name, because the validator needs the attribute', () => {
    expect(
      buildFieldValidationProps({
        type: 'text',
        variable: 'v1',
        validation: { unique: true },
      }),
    ).toEqual({ unique: 'v1' });
  });

  it('wraps comparator rules with the field type', () => {
    expect(
      buildFieldValidationProps({
        type: 'number',
        variable: 'v2',
        validation: { greaterThanVariable: 'v1' },
      }),
    ).toEqual({ greaterThanVariable: { attribute: 'v1', type: 'number' } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/interview test buildFieldValidationProps`
Expected: FAIL — `Failed to resolve import "../buildFieldValidationProps"`.

- [ ] **Step 3: Write the implementation**

Create `packages/interview/src/forms/buildFieldValidationProps.ts`:

```ts
import type { ValidationPropsCatalogue } from '@codaco/fresco-ui/form/Field/types';
import type { Variable } from '@codaco/protocol-validation';

type ValidatedField = {
  type: Variable['type'];
  variable: string;
  validation?: Record<string, unknown>;
};

/**
 * Map a codebook variable's validation object onto Field validation props.
 * Extracted from useProtocolForm so the synthetic-data conformance test can
 * assert against exactly the props the interview renders with.
 */
export function buildFieldValidationProps(
  field: ValidatedField,
): Partial<ValidationPropsCatalogue> {
  const props: Partial<ValidationPropsCatalogue> = {};
  const validation = field.validation;
  if (!validation) return props;

  if (validation.required !== undefined)
    props.required = validation.required as boolean;
  if (validation.minLength !== undefined)
    props.minLength = validation.minLength as number;
  if (validation.maxLength !== undefined)
    props.maxLength = validation.maxLength as number;
  if (validation.minValue !== undefined)
    props.minValue = validation.minValue as number;
  if (validation.maxValue !== undefined)
    props.maxValue = validation.maxValue as number;
  if (validation.minSelected !== undefined)
    props.minSelected = validation.minSelected as number;
  if (validation.maxSelected !== undefined)
    props.maxSelected = validation.maxSelected as number;
  if (validation.pattern !== undefined)
    props.pattern = validation.pattern as ValidationPropsCatalogue['pattern'];
  // The protocol stores `unique` as a boolean, but the validator needs the
  // attribute name to collect other entities' values.
  if (validation.unique === true) props.unique = field.variable;
  if (validation.differentFrom !== undefined)
    props.differentFrom = validation.differentFrom as string;
  if (validation.sameAs !== undefined)
    props.sameAs = validation.sameAs as string;
  if (validation.greaterThanVariable !== undefined)
    props.greaterThanVariable = {
      attribute: validation.greaterThanVariable as string,
      type: field.type,
    };
  if (validation.lessThanVariable !== undefined)
    props.lessThanVariable = {
      attribute: validation.lessThanVariable as string,
      type: field.type,
    };
  if (validation.greaterThanOrEqualToVariable !== undefined)
    props.greaterThanOrEqualToVariable = {
      attribute: validation.greaterThanOrEqualToVariable as string,
      type: field.type,
    };
  if (validation.lessThanOrEqualToVariable !== undefined)
    props.lessThanOrEqualToVariable = {
      attribute: validation.lessThanOrEqualToVariable as string,
      type: field.type,
    };

  return props;
}
```

The `as` casts above are carried over verbatim from `useProtocolForm`; the source object is `Record<string, unknown>` from the protocol, so this is the existing boundary, not new type erosion. Do not add any others.

- [ ] **Step 4: Use it from `useProtocolForm`**

In `packages/interview/src/forms/useProtocolForm.tsx`, replace the whole block from `// Pass validation properties directly from the protocol validation object` down to the closing brace before `// Pass validation context for context-dependent validations` with:

```ts
    if ('validation' in field && field.validation) {
      Object.assign(
        props,
        buildFieldValidationProps({
          type: field.type,
          variable: fieldName,
          validation: field.validation as Record<string, unknown>,
        }),
      );
    }
```

Add the import:

```ts
import { buildFieldValidationProps } from './buildFieldValidationProps';
```

Leave the `VisualAnalogScale`, `DatePicker` and `RelativeDatePicker` parameter blocks below it untouched — those set display `min`/`max`, not validation rules.

- [ ] **Step 5: Export the validation helpers from fresco-ui**

In `packages/fresco-ui/package.json`, add an entry to `exports` in the same shape as its neighbours:

```json
    "./form/validation/helpers": "./src/form/validation/helpers.tsx",
```

Then regenerate the publish map:

```bash
pnpm --filter @codaco/fresco-ui sync-exports
```

- [ ] **Step 6: Run tests and checks**

Run: `pnpm --filter @codaco/interview test buildFieldValidationProps`
Expected: PASS — 4 tests.

Run: `pnpm --filter @codaco/fresco-ui test`
Expected: PASS — including the exports-drift guard.

Run: `pnpm --filter @codaco/interview typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/interview/src/forms packages/fresco-ui/package.json
git commit -m "refactor(interview): extract field validation prop mapping"
```

---

### Task 11: Conformance seam test

The real proof: generated values pushed through the actual runtime validators.

**Files:**

- Create: `packages/interview/src/forms/__tests__/syntheticDataConformance.test.ts`

**Interfaces:**

- Consumes: `buildFieldValidationProps` (Task 10); `generateNetwork` from `@codaco/protocol-utilities`; `makeValidationFunction` from `@codaco/fresco-ui/form/validation/helpers`.
- Produces: nothing.

- [ ] **Step 1: Write the test**

Create `packages/interview/src/forms/__tests__/syntheticDataConformance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { makeValidationFunction } from '@codaco/fresco-ui/form/validation/helpers';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import type { Codebook, StageSubject, Variable } from '@codaco/protocol-validation';
import { generateNetwork } from '@codaco/protocol-utilities';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
} from '@codaco/shared-consts';

import { buildFieldValidationProps } from '../buildFieldValidationProps';

type GenerateParams = Parameters<typeof generateNetwork>[0];

/**
 * Push one attribute value through the same validator stack useProtocolForm
 * builds, with the same context the interview supplies.
 */
async function validateAttribute(opts: {
  codebook: Codebook;
  network: NcNetwork;
  subject: StageSubject;
  variableId: string;
  variable: Variable;
  attributes: Record<string, FieldValue>;
  currentEntityId?: string;
}): Promise<string[]> {
  const validation =
    'validation' in opts.variable ? opts.variable.validation : undefined;

  const props: Record<string, unknown> = {
    ...buildFieldValidationProps({
      type: opts.variable.type,
      variable: opts.variableId,
      ...(validation !== undefined ? { validation } : {}),
    }),
    validationContext: {
      codebook: opts.codebook,
      network: opts.network,
      stageSubject: opts.subject,
      ...(opts.currentEntityId !== undefined
        ? { currentEntityId: opts.currentEntityId }
        : {}),
    },
  };

  const schema = makeValidationFunction(props)(opts.attributes);
  const result = await schema.safeParseAsync(opts.attributes[opts.variableId]);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

async function assertNetworkConforms(
  codebook: Codebook,
  network: NcNetwork,
): Promise<void> {
  const failures: string[] = [];

  for (const [varId, variable] of Object.entries(
    codebook.ego?.variables ?? {},
  )) {
    const messages = await validateAttribute({
      codebook,
      network,
      subject: { entity: 'ego' },
      variableId: varId,
      variable,
      attributes: network.ego?.[entityAttributesProperty] ?? {},
    });
    failures.push(...messages.map((m) => `ego.${variable.name}: ${m}`));
  }

  for (const node of network.nodes) {
    const variables = codebook.node?.[node.type]?.variables ?? {};
    for (const [varId, variable] of Object.entries(variables)) {
      const messages = await validateAttribute({
        codebook,
        network,
        subject: { entity: 'node', type: node.type },
        variableId: varId,
        variable,
        attributes: node[entityAttributesProperty],
        currentEntityId: node[entityPrimaryKeyProperty],
      });
      failures.push(...messages.map((m) => `node.${variable.name}: ${m}`));
    }
  }

  for (const edge of network.edges) {
    const variables = codebook.edge?.[edge.type]?.variables ?? {};
    for (const [varId, variable] of Object.entries(variables)) {
      const messages = await validateAttribute({
        codebook,
        network,
        subject: { entity: 'edge', type: edge.type },
        variableId: varId,
        variable,
        attributes: edge[entityAttributesProperty],
        currentEntityId: edge[entityPrimaryKeyProperty],
      });
      failures.push(...messages.map((m) => `edge.${variable.name}: ${m}`));
    }
  }

  expect(failures).toEqual([]);
}

const nameGenerator = {
  id: 'stage-ng',
  type: 'NameGenerator',
  label: 'Name generator',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'p1', text: 'Name people' }],
  behaviours: { minNodes: 6, maxNodes: 6 },
} as unknown as GenerateParams['stages'][number];

const egoForm = {
  id: 'stage-ego',
  type: 'EgoForm',
  label: 'About you',
  form: { fields: [{ variable: 'e1', prompt: 'E1' }] },
} as unknown as GenerateParams['stages'][number];

describe('synthetic data conformance', () => {
  it('generates ego attributes that pass the real validators', async () => {
    const codebook = {
      ego: {
        variables: {
          e1: {
            name: 'Passphrase',
            type: 'text',
            validation: { required: true, minLength: 24, maxLength: 24 },
          },
          e2: {
            name: 'Confirm passphrase',
            type: 'text',
            validation: {
              required: true,
              minLength: 24,
              maxLength: 24,
              sameAs: 'e1',
            },
          },
        },
      },
    } as unknown as Codebook;

    const { network } = generateNetwork({
      seed: 11,
      codebook: codebook as GenerateParams['codebook'],
      stages: [egoForm],
    });

    await assertNetworkConforms(codebook, network);
  });

  it('generates node attributes that pass the real validators for every rule', async () => {
    const codebook = {
      node: {
        person: {
          color: 'node-color-seq-1',
          variables: {
            code: {
              name: 'Code',
              type: 'text',
              validation: { required: true, unique: true, minLength: 6, maxLength: 6 },
            },
            nickname: {
              name: 'Nickname',
              type: 'text',
              validation: { required: true, differentFrom: 'code' },
            },
            age: {
              name: 'Age',
              type: 'number',
              validation: { required: true, minValue: 18, maxValue: 65 },
            },
            yearsKnown: {
              name: 'Years known',
              type: 'number',
              validation: { minValue: 0, maxValue: 65, lessThanVariable: 'age' },
            },
            closeness: {
              name: 'Closeness',
              type: 'scalar',
              component: 'VisualAnalogScale',
              validation: { required: true, minValue: 0.2, maxValue: 0.8 },
            },
            contexts: {
              name: 'Contexts',
              type: 'categorical',
              options: [
                { label: 'Work', value: 'work' },
                { label: 'Home', value: 'home' },
                { label: 'School', value: 'school' },
                { label: 'Sport', value: 'sport' },
              ],
              validation: { required: true, minSelected: 2, maxSelected: 3 },
            },
            band: {
              name: 'Band',
              type: 'ordinal',
              options: [
                { label: 'Low', value: 1 },
                { label: 'Mid', value: 2 },
                { label: 'High', value: 3 },
              ],
              validation: { required: true },
            },
            met: {
              name: 'Met on',
              type: 'datetime',
              component: 'DatePicker',
              parameters: { type: 'month', min: '2015-01-01', max: '2024-12-31' },
              validation: { required: true },
            },
            lastSeen: {
              name: 'Last seen',
              type: 'datetime',
              component: 'RelativeDatePicker',
              parameters: { before: 90, after: 0 },
              validation: { required: true },
            },
          },
        },
      },
    } as unknown as Codebook;

    const { network } = generateNetwork({
      seed: 11,
      codebook: codebook as GenerateParams['codebook'],
      stages: [nameGenerator],
    });

    expect(network.nodes).toHaveLength(6);
    await assertNetworkConforms(codebook, network);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @codaco/interview test syntheticDataConformance`
Expected: PASS — 2 tests. If any assertion fails, the failure message names the entity, variable and the runtime's own validation message. Fix the generator, not the test.

Two typing notes. `network.nodes[n][entityAttributesProperty]` is `Record<string, VariableValue>` while `makeValidationFunction` expects `Record<string, FieldValue>`. If those do not align, widen `validateAttribute`'s `attributes` parameter to accept both (`Record<string, VariableValue | FieldValue>`) and convert once at the `makeValidationFunction` call — the callback only reads values by key, so no runtime conversion is needed. Do not reach for `as never`. And this test deliberately never passes `inProgressStageIndex`: `markStageInProgress` clears values on purpose, which violates `required` by design, so an in-progress stage is not a conformance subject.

- [ ] **Step 3: Verify the guard is red by mutation**

Temporarily break `fitToLength` in `packages/protocol-utilities/src/ValueGenerator.ts` by removing the `maxLength` truncation:

```ts
  if (maxLength !== undefined && result.length > maxLength) {
    // result = result.slice(0, maxLength);
  }
```

Run: `pnpm --filter @codaco/interview test syntheticDataConformance`
Expected: FAIL, with a message containing `Too long. Enter fewer than 6 characters.`

Restore the line and re-run to confirm PASS. A guard that cannot go red proves nothing.

- [ ] **Step 4: Commit**

```bash
git add packages/interview/src/forms/__tests__/syntheticDataConformance.test.ts
git commit -m "test(interview): assert synthetic data passes the real form validators"
```

---

### Task 12: Bundled protocols, snapshots and changeset

Close the loop: prove the throw cannot regress the shipped protocols, refresh what the behaviour change moved, and record the release.

**Files:**

- Create: `packages/interview/src/forms/__tests__/bundledProtocolFeasibility.test.ts`
- Modify: any `packages/protocol-utilities` or `apps/architect` test fixture whose expectations changed
- Create: `.changeset/<generated-name>.md`

**Interfaces:**

- Consumes: `generateNetwork`, `SyntheticDataConstraintError` from `@codaco/protocol-utilities`; protocols from `@codaco/protocols`.
- Produces: nothing.

- [ ] **Step 1: Write the test**

`@codaco/protocols` exposes `./development` and `./sample`, each resolving directly to a `protocol.json` whose top-level keys include `codebook` and `stages`. Load them with `createRequire`, mirroring `packages/interview/e2e/helpers/protocol-paths.ts`.

Create `packages/interview/src/forms/__tests__/bundledProtocolFeasibility.test.ts`:

```ts
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import { generateNetwork } from '@codaco/protocol-utilities';

type GenerateParams = Parameters<typeof generateNetwork>[0];

type BundledProtocol = {
  codebook: GenerateParams['codebook'];
  stages: GenerateParams['stages'];
};

const require = createRequire(import.meta.url);

// A JSON fixture is an untyped boundary; the package's own generateNetwork
// tests already cross it the same way.
const developmentProtocol = require('@codaco/protocols/development') as BundledProtocol;
const sampleProtocol = require('@codaco/protocols/sample') as BundledProtocol;

describe('bundled protocols are feasible for synthetic generation', () => {
  it.each([
    ['development', developmentProtocol],
    ['sample', sampleProtocol],
  ])('generates a network for the %s protocol', (_name, protocol) => {
    expect(() =>
      generateNetwork({
        seed: 1,
        codebook: protocol.codebook,
        stages: protocol.stages,
      }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @codaco/interview test bundledProtocolFeasibility`
Expected: PASS.

If a bundled protocol throws, do not relax the feasibility rules. Read the reported conflict: either the protocol has a real contradiction that must be corrected in `packages/protocols`, or the analyser has a false positive that must be fixed. Report which one before changing anything.

- [ ] **Step 3: Run the full workspace checks**

```bash
pnpm typecheck
```

```bash
pnpm test
```

```bash
pnpm knip
```

Expected: all pass. Fix any fixture whose expectations moved because seeded generation changed — verify each new expected value actually satisfies its variable's rules before accepting it.

- [ ] **Step 4: Regenerate Architect preview visual baselines if they moved**

Only if `pnpm test` or a local Architect e2e run reports pixel diffs traceable to generated data: invoke the `regenerating-e2e-visual-snapshots` skill and follow it. Do not hand-edit PNGs, and do not regenerate baselines that did not change.

- [ ] **Step 5: Write the changeset**

`@codaco/protocol-utilities` and `@codaco/fresco-ui` are published library packages, so this needs a library-lane changeset. Invoke the `creating-a-changeset` skill and follow it. The change is a `minor` for `@codaco/protocol-utilities` (new exported error type, changed generation behaviour) and a `patch` for `@codaco/fresco-ui` (new export subpath). Do not put a gated product in the same changeset.

Verify:

```bash
pnpm check:changesets
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/interview/src/forms/__tests__/bundledProtocolFeasibility.test.ts .changeset
git add -u
git commit -m "test(interview): assert bundled protocols generate synthetic data"
```

---

## Definition of done

- `pnpm typecheck`, `pnpm test` and `pnpm knip` all pass from the repo root.
- The conformance seam test in `packages/interview` passes, and was demonstrated red by mutation.
- `grep -rn "generateForVariable" packages/protocol-utilities/src` returns nothing.
- A protocol with contradictory rules throws `SyntheticDataConstraintError` identically across at least five different seeds.
- A library-lane changeset exists and `pnpm check:changesets` exits 0.
