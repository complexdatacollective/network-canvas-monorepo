# Automatic Stage Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-populate a new stage's name from its configuration in Architect, live-updating until the researcher types their own name.

**Architecture:** Three pure, unit-tested modules (label composition + dedup + length; stage-part resolution; ownership state machine) plus one thin React hook that wires them to redux-form and the codebook selectors, called from `StageHeading`. No schema, validation, or stage-creation-flow changes.

**Tech Stack:** TypeScript, React, redux-form, `@reduxjs/toolkit` selectors, Vitest + React Testing Library. Spec: `docs/superpowers/specs/2026-06-26-architect-auto-stage-naming-design.md`.

## Global Constraints

- No `any` types; no `as Type` assertions — use generics / structural types instead.
- No barrel files; import each symbol from its source module.
- Only export symbols other modules actually consume.
- App is `@codaco/architect-web` (private, changeset-ignored) — **no changeset**.
- Label cap: **50 characters** (`MAX_LABEL_LENGTH`).
- Form name is `'edit-stage'`, exported as `formName` from `apps/architect-web/src/components/StageEditor/configuration.ts`.
- Types come from `@codaco/protocol-validation`: `StageType`, `StageSubject`, `Panel`, `Item`.
- Comment only where logic is non-obvious (project rule).
- Run only the targeted test file during each task; defer `pnpm typecheck` to the final task.

## File Structure

All new files live in `apps/architect-web/src/components/StageEditor/autoStageName/`:

- `generateStageLabel.ts` — `STAGE_TYPE_NAMES`, `Qualifier` type, `composeStageName`, `dedupeStageLabel`, `generateStageLabel`, `MAX_LABEL_LENGTH`. Pure string assembly.
- `resolveStageNameParts.ts` — `resolveStageSubjectName`, `buildListQualifier`, `resolveStageQualifier`, resolver types. Pure, callback-driven.
- `computeAutoNameUpdate.ts` — the ownership state machine. Pure.
- `useAutoStageName.ts` — React hook gluing selectors + redux-form `change` to the pure modules.
- `__tests__/*.test.ts(x)` — co-located tests per module.

Modified:

- `apps/architect-web/src/components/StageEditor/StageHeading.tsx` — call `useAutoStageName(isNewStage)` before the early return.

Test commands are run from the package directory:

```bash
cd apps/architect-web
```

---

### Task 1: Pure label composition, dedup, and length-fitting

**Files:**

- Create: `apps/architect-web/src/components/StageEditor/autoStageName/generateStageLabel.ts`
- Test: `apps/architect-web/src/components/StageEditor/autoStageName/__tests__/generateStageLabel.test.ts`

**Interfaces:**

- Produces:
  - `MAX_LABEL_LENGTH: 50`
  - `type Qualifier = { full: string; summary: string }`
  - `STAGE_TYPE_NAMES: Record<StageType, string>`
  - `composeStageName(parts: { subjectName?: string | null; typeName: string; qualifier?: string | null }): string`
  - `dedupeStageLabel(base: string, existingLabels: string[]): string`
  - `generateStageLabel(input: { typeName: string; subjectName?: string | null; qualifier?: Qualifier | null; existingLabels: string[] }): string`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/generateStageLabel.test.ts
import { describe, expect, it } from 'vitest';
import type { StageType } from '@codaco/protocol-validation';
import {
  composeStageName,
  dedupeStageLabel,
  generateStageLabel,
  MAX_LABEL_LENGTH,
  STAGE_TYPE_NAMES,
} from '../generateStageLabel';

describe('composeStageName', () => {
  it('joins subject, type, and qualifier with spaces', () => {
    expect(
      composeStageName({
        subjectName: 'Person',
        typeName: 'Form Name Generator',
        qualifier: 'with Roster Panels',
      }),
    ).toBe('Person Form Name Generator with Roster Panels');
  });
  it('omits empty subject and qualifier', () => {
    expect(
      composeStageName({
        subjectName: null,
        typeName: 'Ego Form',
        qualifier: null,
      }),
    ).toBe('Ego Form');
  });
});

describe('dedupeStageLabel', () => {
  it('returns the base when free', () => {
    expect(dedupeStageLabel('Person Sociogram', ['Other'])).toBe(
      'Person Sociogram',
    );
  });
  it('appends the lowest free number on collision, case-insensitively', () => {
    expect(dedupeStageLabel('Person Sociogram', ['person sociogram'])).toBe(
      'Person Sociogram #2',
    );
  });
  it('fills numbering gaps', () => {
    expect(dedupeStageLabel('A', ['A', 'A #3'])).toBe('A #2');
  });
});

describe('generateStageLabel', () => {
  it('builds a full name', () => {
    expect(
      generateStageLabel({
        typeName: 'Form Name Generator',
        subjectName: 'Person',
        qualifier: {
          full: 'with Roster Panels',
          summary: 'with Roster Panels',
        },
        existingLabels: [],
      }),
    ).toBe('Person Form Name Generator with Roster Panels');
  });
  it('summarizes a listed qualifier when too long, before dropping the subject', () => {
    const label = generateStageLabel({
      typeName: 'Family Pedigree',
      subjectName: 'Extended Family Member Person',
      qualifier: {
        full: 'with Diabetes, Hypertension & Coronary Heart Disease Nominations',
        summary: 'with Nominations',
      },
      existingLabels: [],
    });
    expect(label.length).toBeLessThanOrEqual(MAX_LABEL_LENGTH);
    expect(label).toContain('with Nominations');
  });
  it('never exceeds the length cap even with a dedup suffix', () => {
    const long = 'X'.repeat(60);
    const label = generateStageLabel({
      typeName: long,
      subjectName: null,
      qualifier: null,
      existingLabels: [long.slice(0, 50)],
    });
    expect(label.length).toBeLessThanOrEqual(MAX_LABEL_LENGTH);
  });
});

describe('STAGE_TYPE_NAMES', () => {
  it('has the expected concise names', () => {
    const expected: Record<StageType, string> = {
      NameGenerator: 'Form Name Generator',
      NameGeneratorQuickAdd: 'Quick Add Name Generator',
      NameGeneratorRoster: 'Roster Name Generator',
      FamilyPedigree: 'Family Pedigree',
      DyadCensus: 'Dyad Census',
      OneToManyDyadCensus: 'One to Many Dyad Census',
      TieStrengthCensus: 'Tie-Strength Census',
      Sociogram: 'Sociogram',
      Narrative: 'Narrative',
      OrdinalBin: 'Ordinal Bin',
      CategoricalBin: 'Categorical Bin',
      AlterForm: 'Per Alter Form',
      Geospatial: 'Geospatial',
      AlterEdgeForm: 'Per Alter Edge Form',
      EgoForm: 'Ego Form',
      Information: 'Information',
      Anonymisation: 'Anonymisation',
    };
    expect(STAGE_TYPE_NAMES).toStrictEqual(expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/StageEditor/autoStageName/__tests__/generateStageLabel.test.ts`
Expected: FAIL — cannot resolve `../generateStageLabel`.

- [ ] **Step 3: Write minimal implementation**

```ts
// generateStageLabel.ts
import type { StageType } from '@codaco/protocol-validation';

export const MAX_LABEL_LENGTH = 50;

export type Qualifier = { full: string; summary: string };

export const STAGE_TYPE_NAMES: Record<StageType, string> = {
  NameGenerator: 'Form Name Generator',
  NameGeneratorQuickAdd: 'Quick Add Name Generator',
  NameGeneratorRoster: 'Roster Name Generator',
  FamilyPedigree: 'Family Pedigree',
  DyadCensus: 'Dyad Census',
  OneToManyDyadCensus: 'One to Many Dyad Census',
  TieStrengthCensus: 'Tie-Strength Census',
  Sociogram: 'Sociogram',
  Narrative: 'Narrative',
  OrdinalBin: 'Ordinal Bin',
  CategoricalBin: 'Categorical Bin',
  AlterForm: 'Per Alter Form',
  Geospatial: 'Geospatial',
  AlterEdgeForm: 'Per Alter Edge Form',
  EgoForm: 'Ego Form',
  Information: 'Information',
  Anonymisation: 'Anonymisation',
};

export function composeStageName(parts: {
  subjectName?: string | null;
  typeName: string;
  qualifier?: string | null;
}): string {
  return [parts.subjectName, parts.typeName, parts.qualifier]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ');
}

export function dedupeStageLabel(
  base: string,
  existingLabels: string[],
): string {
  const taken = new Set(
    existingLabels.map((label) => label.trim().toLowerCase()),
  );
  if (!taken.has(base.trim().toLowerCase())) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base} #${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${base} #${suffix}`;
}

function truncateToWord(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  const slice = value.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  const trimmed = (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd();
  return trimmed || slice.trimEnd();
}

export function generateStageLabel(input: {
  typeName: string;
  subjectName?: string | null;
  qualifier?: Qualifier | null;
  existingLabels: string[];
}): string {
  const { typeName, subjectName, qualifier, existingLabels } = input;

  // Most-informative first; each candidate sheds detail so a long name can fit 50 chars.
  const candidates: string[] = [];
  if (qualifier) {
    candidates.push(
      composeStageName({ subjectName, typeName, qualifier: qualifier.full }),
    );
    if (qualifier.summary !== qualifier.full) {
      candidates.push(
        composeStageName({
          subjectName,
          typeName,
          qualifier: qualifier.summary,
        }),
      );
    }
    candidates.push(
      composeStageName({
        subjectName: null,
        typeName,
        qualifier: qualifier.summary,
      }),
    );
  } else {
    candidates.push(
      composeStageName({ subjectName, typeName, qualifier: null }),
    );
    candidates.push(
      composeStageName({ subjectName: null, typeName, qualifier: null }),
    );
  }

  for (const base of candidates) {
    const deduped = dedupeStageLabel(base, existingLabels);
    if (deduped.length <= MAX_LABEL_LENGTH) {
      return deduped;
    }
  }

  const fallbackBase = candidates[candidates.length - 1] ?? typeName;
  const truncated = truncateToWord(fallbackBase, MAX_LABEL_LENGTH - 4);
  return dedupeStageLabel(truncated, existingLabels).slice(0, MAX_LABEL_LENGTH);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/StageEditor/autoStageName/__tests__/generateStageLabel.test.ts`
Expected: PASS (all assertions).

- [ ] **Step 5: Commit**

```bash
git add apps/architect-web/src/components/StageEditor/autoStageName/generateStageLabel.ts apps/architect-web/src/components/StageEditor/autoStageName/__tests__/generateStageLabel.test.ts
git commit -m "feat(architect): add pure stage-label composition and dedup"
```

---

### Task 2: Resolve subject and qualifier from a stage

**Files:**

- Create: `apps/architect-web/src/components/StageEditor/autoStageName/resolveStageNameParts.ts`
- Test: `apps/architect-web/src/components/StageEditor/autoStageName/__tests__/resolveStageNameParts.test.ts`

**Interfaces:**

- Consumes: `Qualifier` from `../generateStageLabel`.
- Produces (only these three are exported — the resolver/param types stay **local, non-exported**, so knip does not flag unused exports):
  - `resolveStageSubjectName(subject: StageSubject | undefined, resolveEntityName: (entity: 'node' | 'edge', type: string) => string | null): string | null`
  - `buildListQualifier(rawValues: string[], options: { singularNoun?: string; pluralNoun?: string; summaryNoun: string }): Qualifier | null`
  - `resolveStageQualifier(stage: { type?: StageType; panels?: Panel[]; items?: Item[]; nominationPrompts?: { variable: string }[] }, resolvers: { resolveAssetType: (assetId: string) => string | null; resolveVariableName: (variableId: string) => string | null }): Qualifier | null`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/resolveStageNameParts.test.ts
import { describe, expect, it } from 'vitest';
import {
  buildListQualifier,
  resolveStageQualifier,
  resolveStageSubjectName,
} from '../resolveStageNameParts';

const nameByType: Record<string, string> = {
  person: 'Person',
  friendship: 'Friendship',
};
const resolveEntityName = (_entity: 'node' | 'edge', type: string) =>
  nameByType[type] ?? null;

describe('resolveStageSubjectName', () => {
  it('resolves a node subject', () => {
    expect(
      resolveStageSubjectName(
        { entity: 'node', type: 'person' },
        resolveEntityName,
      ),
    ).toBe('Person');
  });
  it('resolves an edge subject', () => {
    expect(
      resolveStageSubjectName(
        { entity: 'edge', type: 'friendship' },
        resolveEntityName,
      ),
    ).toBe('Friendship');
  });
  it('returns null for ego and for missing/unknown subjects', () => {
    expect(
      resolveStageSubjectName({ entity: 'ego' }, resolveEntityName),
    ).toBeNull();
    expect(resolveStageSubjectName(undefined, resolveEntityName)).toBeNull();
    expect(
      resolveStageSubjectName(
        { entity: 'node', type: 'ghost' },
        resolveEntityName,
      ),
    ).toBeNull();
  });
});

describe('buildListQualifier', () => {
  it('returns null for no values', () => {
    expect(buildListQualifier([], { summaryNoun: 'Media' })).toBeNull();
  });
  it('lists up to three values with an ampersand', () => {
    expect(
      buildListQualifier(['Image', 'Video'], { summaryNoun: 'Media' }),
    ).toStrictEqual({
      full: 'with Image & Video',
      summary: 'with Media',
    });
    expect(
      buildListQualifier(['A', 'B', 'C'], { summaryNoun: 'Media' })?.full,
    ).toBe('with A, B & C');
  });
  it('summarizes four or more values', () => {
    expect(
      buildListQualifier(['A', 'B', 'C', 'D'], { summaryNoun: 'Media' }),
    ).toStrictEqual({
      full: 'with Media',
      summary: 'with Media',
    });
  });
  it('applies singular/plural nouns and de-duplicates', () => {
    expect(
      buildListQualifier(['Diabetes'], {
        singularNoun: 'Nomination',
        pluralNoun: 'Nominations',
        summaryNoun: 'Nominations',
      })?.full,
    ).toBe('with Diabetes Nomination');
    expect(
      buildListQualifier(['Diabetes', 'Diabetes', 'Asthma'], {
        singularNoun: 'Nomination',
        pluralNoun: 'Nominations',
        summaryNoun: 'Nominations',
      })?.full,
    ).toBe('with Diabetes & Asthma Nominations');
  });
});

describe('resolveStageQualifier', () => {
  const resolvers = {
    resolveAssetType: () => null,
    resolveVariableName: () => null,
  };

  it('classifies name-generator panels by data source', () => {
    expect(
      resolveStageQualifier(
        {
          type: 'NameGenerator',
          panels: [{ id: 'p1', title: 'A', dataSource: 'existing' }],
        },
        resolvers,
      )?.full,
    ).toBe('with Network Panels');
    expect(
      resolveStageQualifier(
        {
          type: 'NameGenerator',
          panels: [{ id: 'p1', title: 'A', dataSource: 'roster-1' }],
        },
        resolvers,
      )?.full,
    ).toBe('with Roster Panels');
    expect(
      resolveStageQualifier(
        {
          type: 'NameGeneratorQuickAdd',
          panels: [
            { id: 'p1', title: 'A', dataSource: 'existing' },
            { id: 'p2', title: 'B', dataSource: 'roster-1' },
          ],
        },
        resolvers,
      )?.full,
    ).toBe('with Panels');
    expect(
      resolveStageQualifier({ type: 'NameGenerator', panels: [] }, resolvers),
    ).toBeNull();
  });

  it('lists Information asset media types via the manifest', () => {
    const r = {
      ...resolvers,
      resolveAssetType: (id: string) => (id === 'a1' ? 'video' : 'image'),
    };
    expect(
      resolveStageQualifier(
        {
          type: 'Information',
          items: [{ id: 'i1', type: 'asset', content: 'a1' }],
        },
        r,
      )?.full,
    ).toBe('with Video');
    expect(
      resolveStageQualifier(
        {
          type: 'Information',
          items: [
            { id: 'i1', type: 'asset', content: 'a1' },
            { id: 'i2', type: 'asset', content: 'a2' },
          ],
        },
        r,
      )?.full,
    ).toBe('with Video & Image');
    expect(
      resolveStageQualifier(
        {
          type: 'Information',
          items: [{ id: 'i1', type: 'text', content: 'hello' }],
        },
        r,
      ),
    ).toBeNull();
  });

  it('lists Family Pedigree nominated attribute names via the codebook', () => {
    const r = {
      ...resolvers,
      resolveVariableName: (id: string) =>
        id === 'v1' ? 'Diabetes' : 'Asthma',
    };
    expect(
      resolveStageQualifier(
        { type: 'FamilyPedigree', nominationPrompts: [{ variable: 'v1' }] },
        r,
      )?.full,
    ).toBe('with Diabetes Nomination');
    expect(
      resolveStageQualifier(
        {
          type: 'FamilyPedigree',
          nominationPrompts: [{ variable: 'v1' }, { variable: 'v2' }],
        },
        r,
      )?.full,
    ).toBe('with Diabetes & Asthma Nominations');
  });

  it('returns null for stage types without qualifiers', () => {
    expect(resolveStageQualifier({ type: 'Sociogram' }, resolvers)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/StageEditor/autoStageName/__tests__/resolveStageNameParts.test.ts`
Expected: FAIL — cannot resolve `../resolveStageNameParts`.

- [ ] **Step 3: Write minimal implementation**

```ts
// resolveStageNameParts.ts
import type {
  Item,
  Panel,
  StageSubject,
  StageType,
} from '@codaco/protocol-validation';
import type { Qualifier } from './generateStageLabel';

type EntityNameResolver = (
  entity: 'node' | 'edge',
  type: string,
) => string | null;

type QualifierResolvers = {
  resolveAssetType: (assetId: string) => string | null;
  resolveVariableName: (variableId: string) => string | null;
};

type QualifierStageFields = {
  type?: StageType;
  panels?: Panel[];
  items?: Item[];
  nominationPrompts?: { variable: string }[];
};

export function resolveStageSubjectName(
  subject: StageSubject | undefined,
  resolveEntityName: EntityNameResolver,
): string | null {
  if (!subject || subject.entity === 'ego' || !subject.type) {
    return null;
  }
  return resolveEntityName(subject.entity, subject.type) || null;
}

function joinList(values: string[]): string {
  if (values.length === 1) {
    return values[0]!;
  }
  if (values.length === 2) {
    return `${values[0]} & ${values[1]}`;
  }
  return `${values.slice(0, -1).join(', ')} & ${values[values.length - 1]}`;
}

export function buildListQualifier(
  rawValues: string[],
  options: { singularNoun?: string; pluralNoun?: string; summaryNoun: string },
): Qualifier | null {
  const values = [
    ...new Set(rawValues.filter((value) => value && value.trim())),
  ];
  if (values.length === 0) {
    return null;
  }
  const summary = `with ${options.summaryNoun}`;
  if (values.length > 3) {
    return { full: summary, summary };
  }
  const noun =
    options.singularNoun && options.pluralNoun
      ? ` ${values.length === 1 ? options.singularNoun : options.pluralNoun}`
      : '';
  return { full: `with ${joinList(values)}${noun}`, summary };
}

const MEDIA_LABELS: Record<string, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
};

function resolvePanelQualifier(panels: Panel[] | undefined): Qualifier | null {
  if (!panels || panels.length === 0) {
    return null;
  }
  const hasExisting = panels.some((panel) => panel.dataSource === 'existing');
  const hasRoster = panels.some((panel) => panel.dataSource !== 'existing');
  let text = 'with Network Panels';
  if (hasExisting && hasRoster) {
    text = 'with Panels';
  } else if (hasRoster) {
    text = 'with Roster Panels';
  }
  return { full: text, summary: text };
}

function resolveInformationQualifier(
  items: Item[] | undefined,
  resolveAssetType: (assetId: string) => string | null,
): Qualifier | null {
  if (!items) {
    return null;
  }
  const mediaLabels = items
    .filter((item) => item.type === 'asset')
    .map((item) => resolveAssetType(item.content))
    .map((type) => (type ? (MEDIA_LABELS[type] ?? null) : null))
    .filter((label): label is string => Boolean(label));
  return buildListQualifier(mediaLabels, { summaryNoun: 'Media' });
}

function resolveNominationQualifier(
  prompts: { variable: string }[] | undefined,
  resolveVariableName: (variableId: string) => string | null,
): Qualifier | null {
  if (!prompts) {
    return null;
  }
  const names = prompts
    .map((prompt) => resolveVariableName(prompt.variable))
    .filter((name): name is string => Boolean(name));
  return buildListQualifier(names, {
    singularNoun: 'Nomination',
    pluralNoun: 'Nominations',
    summaryNoun: 'Nominations',
  });
}

export function resolveStageQualifier(
  stage: QualifierStageFields,
  resolvers: QualifierResolvers,
): Qualifier | null {
  switch (stage.type) {
    case 'NameGenerator':
    case 'NameGeneratorQuickAdd':
      return resolvePanelQualifier(stage.panels);
    case 'Information':
      return resolveInformationQualifier(
        stage.items,
        resolvers.resolveAssetType,
      );
    case 'FamilyPedigree':
      return resolveNominationQualifier(
        stage.nominationPrompts,
        resolvers.resolveVariableName,
      );
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/StageEditor/autoStageName/__tests__/resolveStageNameParts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/architect-web/src/components/StageEditor/autoStageName/resolveStageNameParts.ts apps/architect-web/src/components/StageEditor/autoStageName/__tests__/resolveStageNameParts.test.ts
git commit -m "feat(architect): resolve stage subject and per-type name qualifiers"
```

---

### Task 3: Ownership state machine

**Files:**

- Create: `apps/architect-web/src/components/StageEditor/autoStageName/computeAutoNameUpdate.ts`
- Test: `apps/architect-web/src/components/StageEditor/autoStageName/__tests__/computeAutoNameUpdate.test.ts`

**Interfaces:**

- Produces:
  - `computeAutoNameUpdate(args: { isNewStage: boolean; isCustom: boolean; liveLabel: string; lastGenerated: string | undefined; generatedLabel: string }): { nextIsCustom: boolean; label?: string }`

Semantics: while creating a new stage and the researcher has not taken ownership, the generated label is applied; the first non-empty value the researcher types (one that differs from what we last generated) locks it; clearing the field re-engages auto-naming.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/computeAutoNameUpdate.test.ts
import { describe, expect, it } from 'vitest';
import { computeAutoNameUpdate } from '../computeAutoNameUpdate';

describe('computeAutoNameUpdate', () => {
  it('never auto-names an existing stage', () => {
    expect(
      computeAutoNameUpdate({
        isNewStage: false,
        isCustom: false,
        liveLabel: 'Existing',
        lastGenerated: undefined,
        generatedLabel: 'Person Sociogram',
      }),
    ).toStrictEqual({ nextIsCustom: true });
  });

  it('fills an empty label on first run', () => {
    expect(
      computeAutoNameUpdate({
        isNewStage: true,
        isCustom: false,
        liveLabel: '',
        lastGenerated: undefined,
        generatedLabel: 'Form Name Generator',
      }),
    ).toStrictEqual({ nextIsCustom: false, label: 'Form Name Generator' });
  });

  it('updates the label when the generated name changes', () => {
    expect(
      computeAutoNameUpdate({
        isNewStage: true,
        isCustom: false,
        liveLabel: 'Form Name Generator',
        lastGenerated: 'Form Name Generator',
        generatedLabel: 'Person Form Name Generator',
      }),
    ).toStrictEqual({
      nextIsCustom: false,
      label: 'Person Form Name Generator',
    });
  });

  it('locks when the researcher types a custom value', () => {
    expect(
      computeAutoNameUpdate({
        isNewStage: true,
        isCustom: false,
        liveLabel: 'My stage',
        lastGenerated: 'Person Form Name Generator',
        generatedLabel: 'Person Form Name Generator',
      }),
    ).toStrictEqual({ nextIsCustom: true });
  });

  it('stays locked once custom', () => {
    expect(
      computeAutoNameUpdate({
        isNewStage: true,
        isCustom: true,
        liveLabel: 'My stage',
        lastGenerated: 'Person Form Name Generator',
        generatedLabel: 'Person Sociogram',
      }),
    ).toStrictEqual({ nextIsCustom: true });
  });

  it('re-engages when the field is cleared', () => {
    expect(
      computeAutoNameUpdate({
        isNewStage: true,
        isCustom: true,
        liveLabel: '   ',
        lastGenerated: 'My stage',
        generatedLabel: 'Person Sociogram',
      }),
    ).toStrictEqual({ nextIsCustom: false, label: 'Person Sociogram' });
  });

  it('does nothing when already in sync', () => {
    expect(
      computeAutoNameUpdate({
        isNewStage: true,
        isCustom: false,
        liveLabel: 'Person Sociogram',
        lastGenerated: 'Person Sociogram',
        generatedLabel: 'Person Sociogram',
      }),
    ).toStrictEqual({ nextIsCustom: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/StageEditor/autoStageName/__tests__/computeAutoNameUpdate.test.ts`
Expected: FAIL — cannot resolve `../computeAutoNameUpdate`.

- [ ] **Step 3: Write minimal implementation**

```ts
// computeAutoNameUpdate.ts
export function computeAutoNameUpdate(args: {
  isNewStage: boolean;
  isCustom: boolean;
  liveLabel: string;
  lastGenerated: string | undefined;
  generatedLabel: string;
}): { nextIsCustom: boolean; label?: string } {
  const { isNewStage, isCustom, liveLabel, lastGenerated, generatedLabel } =
    args;

  if (!isNewStage) {
    return { nextIsCustom: true };
  }

  // Empty field (initial or cleared) re-engages auto-naming.
  if (liveLabel.trim() === '') {
    if (generatedLabel && generatedLabel !== liveLabel) {
      return { nextIsCustom: false, label: generatedLabel };
    }
    return { nextIsCustom: false };
  }

  if (isCustom) {
    return { nextIsCustom: true };
  }

  // A non-empty value we did not generate means the researcher took ownership.
  if (liveLabel !== lastGenerated) {
    return { nextIsCustom: true };
  }

  if (generatedLabel !== liveLabel) {
    return { nextIsCustom: false, label: generatedLabel };
  }
  return { nextIsCustom: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/StageEditor/autoStageName/__tests__/computeAutoNameUpdate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/architect-web/src/components/StageEditor/autoStageName/computeAutoNameUpdate.ts apps/architect-web/src/components/StageEditor/autoStageName/__tests__/computeAutoNameUpdate.test.ts
git commit -m "feat(architect): add stage auto-name ownership state machine"
```

---

### Task 4: The hook and wiring into StageHeading

**Files:**

- Create: `apps/architect-web/src/components/StageEditor/autoStageName/useAutoStageName.ts`
- Modify: `apps/architect-web/src/components/StageEditor/StageHeading.tsx`
- Test: `apps/architect-web/src/components/StageEditor/autoStageName/__tests__/useAutoStageName.test.tsx`

**Interfaces:**

- Consumes: `generateStageLabel`, `STAGE_TYPE_NAMES` from `./generateStageLabel`; `resolveStageSubjectName`, `resolveStageQualifier` from `./resolveStageNameParts`; `computeAutoNameUpdate` from `./computeAutoNameUpdate`; `formName` from `../configuration`; selectors `getNodeTypes`, `getEdgeTypes`, `getAllVariablesByUUID` from `~/selectors/codebook`; `getAssetManifest`, `getCodebook`, `getStageList` from `~/selectors/protocol`.
- Produces: `useAutoStageName(isNewStage: boolean): void`

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/useAutoStageName.test.tsx
import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { change, reducer as formReducer } from 'redux-form';
import { describe, expect, it } from 'vitest';

import Editor from '~/components/Editor';
import { formName } from '../../configuration';
import StageHeading from '../../StageHeading';

const protocol = {
  codebook: {
    node: { person: { name: 'Person', color: 'node-1', variables: {} } },
    edge: {},
  },
  stages: [{ id: 'other', type: 'Sociogram', label: 'An existing stage' }],
  assetManifest: {},
};

function renderHeading(initialValues: Record<string, unknown>) {
  const store = configureStore({
    reducer: {
      form: formReducer,
      activeProtocol: () => ({ present: protocol }),
    },
  });
  const utils = render(
    <Provider store={store}>
      <Editor form={formName} initialValues={initialValues} onSubmit={() => {}}>
        <StageHeading stageNumber={1} totalStages={1} />
      </Editor>
    </Provider>,
  );
  const input = utils.getByLabelText('Stage name') as HTMLInputElement;
  return { store, input };
}

describe('useAutoStageName (wired into StageHeading)', () => {
  it('auto-names a new stage and refines as the subject is set', async () => {
    const { store, input } = renderHeading({ type: 'NameGenerator' });

    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));

    store.dispatch(
      change(formName, 'subject', { entity: 'node', type: 'person' }),
    );
    await waitFor(() =>
      expect(input).toHaveValue('Person Form Name Generator'),
    );
  });

  it('stops auto-naming once the researcher types a custom name', async () => {
    const { store, input } = renderHeading({ type: 'NameGenerator' });
    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));

    // Replace the value in one change (mirrors selecting all then typing).
    fireEvent.change(input, { target: { value: 'My custom stage' } });
    await waitFor(() => expect(input).toHaveValue('My custom stage'));

    store.dispatch(
      change(formName, 'subject', { entity: 'node', type: 'person' }),
    );
    // Give the effect a chance to (incorrectly) overwrite, then assert it didn't.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(input).toHaveValue('My custom stage');
  });

  it('does not auto-name an existing stage', async () => {
    const { input } = renderHeading({
      type: 'Sociogram',
      id: 's1',
      label: 'Hand named',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(input).toHaveValue('Hand named');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/StageEditor/autoStageName/__tests__/useAutoStageName.test.tsx`
Expected: FAIL — cannot resolve `../useAutoStageName` (and `StageHeading` does not yet call the hook).

- [ ] **Step 3: Write the hook**

```ts
// useAutoStageName.ts
import { useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { change, getFormValues } from 'redux-form';

import type {
  Item,
  Panel,
  StageSubject,
  StageType,
} from '@codaco/protocol-validation';
import {
  getAllVariablesByUUID,
  getEdgeTypes,
  getNodeTypes,
} from '~/selectors/codebook';
import {
  getAssetManifest,
  getCodebook,
  getStageList,
} from '~/selectors/protocol';

import { formName } from '../configuration';
import { computeAutoNameUpdate } from './computeAutoNameUpdate';
import { generateStageLabel, STAGE_TYPE_NAMES } from './generateStageLabel';
import {
  resolveStageQualifier,
  resolveStageSubjectName,
} from './resolveStageNameParts';

type StageFormValues = {
  type?: StageType;
  label?: string;
  subject?: StageSubject;
  panels?: Panel[];
  items?: Item[];
  nominationPrompts?: { variable: string }[];
};

export function useAutoStageName(isNewStage: boolean): void {
  const dispatch = useDispatch();
  const formValues = useSelector(
    getFormValues<StageFormValues | undefined>(formName),
  );
  const nodeTypes = useSelector(getNodeTypes);
  const edgeTypes = useSelector(getEdgeTypes);
  const codebook = useSelector(getCodebook);
  const assetManifest = useSelector(getAssetManifest);
  const stageList = useSelector(getStageList);

  const liveLabel = formValues?.label ?? '';

  const generatedLabel = useMemo(() => {
    const type = formValues?.type;
    if (!type) {
      return '';
    }
    const variablesByUuid = getAllVariablesByUUID(codebook);
    const subjectName = resolveStageSubjectName(
      formValues?.subject,
      (entity, entityType) => {
        const types = entity === 'node' ? nodeTypes : edgeTypes;
        return types[entityType]?.name ?? null;
      },
    );
    const qualifier = resolveStageQualifier(
      {
        type,
        panels: formValues?.panels,
        items: formValues?.items,
        nominationPrompts: formValues?.nominationPrompts,
      },
      {
        resolveAssetType: (assetId) => assetManifest[assetId]?.type ?? null,
        resolveVariableName: (variableId) =>
          variablesByUuid[variableId]?.name ?? null,
      },
    );
    const existingLabels = stageList
      .map((stage) => stage.label)
      .filter((label): label is string => Boolean(label));
    return generateStageLabel({
      typeName: STAGE_TYPE_NAMES[type],
      subjectName,
      qualifier,
      existingLabels,
    });
  }, [formValues, nodeTypes, edgeTypes, codebook, assetManifest, stageList]);

  const isCustomRef = useRef(false);
  const lastGeneratedRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const update = computeAutoNameUpdate({
      isNewStage,
      isCustom: isCustomRef.current,
      liveLabel,
      lastGenerated: lastGeneratedRef.current,
      generatedLabel,
    });
    isCustomRef.current = update.nextIsCustom;
    if (update.label !== undefined) {
      lastGeneratedRef.current = update.label;
      dispatch(change(formName, 'label', update.label));
    }
  }, [generatedLabel, liveLabel, isNewStage, dispatch]);
}
```

- [ ] **Step 4: Wire the hook into StageHeading**

In `apps/architect-web/src/components/StageEditor/StageHeading.tsx`, add the import and call the hook **before** the `if (!type) return null;` early return (Rules of Hooks).

Add import:

```tsx
import { useAutoStageName } from './autoStageName/useAutoStageName';
```

Change the body around the existing lines:

```tsx
const type = get(values, 'type') as string | undefined;
const isNewStage = !get(initialValues, 'label');

if (!type) {
  return null;
}
```

to:

```tsx
const type = get(values, 'type') as string | undefined;
const isNewStage = !get(initialValues, 'label');

useAutoStageName(isNewStage);

if (!type) {
  return null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/StageEditor/autoStageName/__tests__/useAutoStageName.test.tsx`
Expected: PASS (all three cases).

If `getFormValues<StageFormValues>(formName)` reports a type error in the editor, confirm redux-form's generic signature is being used (no `as` cast); the value may be `undefined` at runtime, which the `formValues ?? {}` / `formValues?.label ?? ''` guards already handle.

- [ ] **Step 6: Commit**

```bash
git add apps/architect-web/src/components/StageEditor/autoStageName/useAutoStageName.ts apps/architect-web/src/components/StageEditor/autoStageName/__tests__/useAutoStageName.test.tsx apps/architect-web/src/components/StageEditor/StageHeading.tsx
git commit -m "feat(architect): live auto-naming of new stages in the stage editor"
```

---

### Task 5: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full architect-web test suite**

Run: `pnpm --filter @codaco/architect-web test`
Expected: PASS, including the four new test files.

- [ ] **Step 2: Lint and format the new/modified files**

Run: `pnpm lint:fix`
Expected: no remaining errors; formatter applies cleanly. (Pre-commit hooks also run lint/format.)

- [ ] **Step 3: Typecheck the workspace**

Run: `pnpm typecheck`
Expected: PASS with no errors. Resolve any `any`/assertion findings at the source (no ignore directives).

- [ ] **Step 4: Knip (unused exports/deps)**

Run: `pnpm knip`
Expected: no new unused exports. Every exported symbol in the new modules is consumed by a test or by the hook; if knip flags one that is only used by tests, confirm it is genuinely needed and not dead code.

- [ ] **Step 5: Commit any lint/format fixups**

```bash
git add -A
git commit -m "chore(architect): lint and format auto-stage-naming" || echo "nothing to commit"
```
