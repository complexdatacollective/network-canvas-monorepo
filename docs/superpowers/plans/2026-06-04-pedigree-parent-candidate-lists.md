# Family Pedigree Parent Candidate Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every "add/define a parent" flow in the FamilyPedigree offer a topologically-valid candidate list ("select existing person or create new"), filtered tightly for genetic (egg/sperm) parents and loosely for social/adoptive parents, with existing donors reusable.

**Architecture:** One pure topology module computes the candidate id set per role. The genetic (egg/sperm) `BioTriadStep` flows (add-child, add-sibling, define-parents) filter their candidate list with the _tight_ set; `AddParentWizard` (social/surrogate) filters with the _loose_ set. `DefineParentsWizard`'s genetic portion is converted onto `BioTriadStep` + a shared parentage transform, unifying it with add-child.

**Tech Stack:** React, TypeScript, Zustand, Vitest, `@testing-library/react`, fresco-ui form primitives.

**Reference spec:** `docs/superpowers/specs/2026-06-04-pedigree-parent-candidate-lists-design.md`

**Key facts:**

- Pedigree `edges` are `Map<string, FamilyEdge>` where `FamilyEdge = NcEdge & { gameteRole? }`; an edge's relationship type is `edge.attributes[variableConfig.relationshipTypeVariable]`. A parent→child edge has the parent as `from`, child as `to`. `partner` edges are bidirectional. A `donor`-type edge's `from` is the donor.
- `AddChildWizard` is the reference for the genetic BioTriad flow: steps `Child details` → `Biological parents` (`BioTriadStep`) → `Other parents` (`GenericOtherParentsStep`) → `Additional parents` (`GenericAdditionalParentsStep`) → `Parent partnerships` (`NewParentPartnershipsStep`); `onFinish` = `childCellTransform`.
- `childCellTransform(values, anchorId, nodes, edges, variableConfig)` creates a `'child'` node, calls `buildChildParentage('child', values, variableConfig)`, then an additional-parents (social) block and a partnership block.
- `buildNodeOptions(nodes, edges, variableConfig)` exists in both `AddChildWizard` and `AddSiblingWizard`; it labels ego as `'You'` and others via `getNodeLabel`, and currently includes every node.
- `getNodeLabel(nodeId, nodes, edges, variableConfig)` returns name-or-relationship label.

**Run commands (from `packages/interview`):** single test `pnpm vitest run <path>`; typecheck (repo root) `pnpm exec turbo run typecheck --filter=@codaco/interview`; lint `pnpm exec oxlint --fix <files>` then `pnpm exec oxfmt <files>`.

---

## Task 1: Topology candidate helper

Pure module computing the per-role candidate id sets. No React.

**Files:**

- Create: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/parentCandidates.ts`
- Create: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/__tests__/parentCandidates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/parentCandidates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { NcEdge } from '@codaco/shared-consts';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import {
  geneticParentCandidates,
  socialParentCandidates,
} from '../parentCandidates';

const variableConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'name',
  egoVariable: 'isEgo',
  relationshipTypeVariable: 'rel',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGC',
};

function edge(from: string, to: string, rel: string): [string, NcEdge] {
  const id = `${from}->${to}:${rel}`;
  return [
    id,
    { _uid: id, type: 'family', from, to, attributes: { rel, isActive: true } },
  ];
}

// Tree: mum + dad -> ego ; grandma -> mum ; ego -> kid ; mum partnered with steve ;
// donor -> otherchild (a previously used donor)
function makeEdges(): Map<string, NcEdge> {
  return new Map<string, NcEdge>([
    edge('mum', 'ego', 'biological'),
    edge('dad', 'ego', 'biological'),
    edge('grandma', 'mum', 'biological'),
    edge('ego', 'kid', 'biological'),
    edge('mum', 'steve', 'partner'),
    edge('donor', 'otherchild', 'donor'),
  ]);
}

describe('geneticParentCandidates', () => {
  it('sibling: parents + their partners + donors, excludes ego/children/grandparents', () => {
    const result = geneticParentCandidates(
      'ego',
      'sibling',
      makeEdges(),
      variableConfig,
    );
    expect(result.has('mum')).toBe(true);
    expect(result.has('dad')).toBe(true);
    expect(result.has('steve')).toBe(true); // partner of a parent
    expect(result.has('donor')).toBe(true); // reusable donor
    expect(result.has('ego')).toBe(false); // self
    expect(result.has('kid')).toBe(false); // child
    expect(result.has('grandma')).toBe(false); // grandparent
  });

  it('child: anchor + partners + donors, excludes the anchor children', () => {
    const result = geneticParentCandidates(
      'ego',
      'child',
      makeEdges(),
      variableConfig,
    );
    expect(result.has('ego')).toBe(true); // anchor is a parent of its child
    expect(result.has('donor')).toBe(true);
    expect(result.has('kid')).toBe(false); // existing child / descendant
    expect(result.has('mum')).toBe(false); // ancestor, not a natural co-parent
  });

  it('define-parents: partners of existing parents + donors, excludes anchor and its existing parents', () => {
    const result = geneticParentCandidates(
      'ego',
      'define-parents',
      makeEdges(),
      variableConfig,
    );
    expect(result.has('steve')).toBe(true); // partner of an existing parent
    expect(result.has('donor')).toBe(true);
    expect(result.has('ego')).toBe(false);
    expect(result.has('mum')).toBe(false); // already a parent
    expect(result.has('dad')).toBe(false); // already a parent
  });
});

describe('socialParentCandidates', () => {
  it('includes grandparents/partners, excludes anchor, descendants, existing parents', () => {
    const nodes = new Map(
      [
        'ego',
        'mum',
        'dad',
        'grandma',
        'kid',
        'steve',
        'donor',
        'otherchild',
      ].map((id) => [id, { _uid: id, type: 'person', attributes: {} }]),
    );
    const result = socialParentCandidates(
      'ego',
      nodes,
      makeEdges(),
      variableConfig,
    );
    expect(result.has('grandma')).toBe(true); // a grandparent can be a social parent
    expect(result.has('steve')).toBe(true);
    expect(result.has('ego')).toBe(false); // self
    expect(result.has('kid')).toBe(false); // descendant
    expect(result.has('mum')).toBe(false); // already a parent
    expect(result.has('dad')).toBe(false); // already a parent
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/interfaces/FamilyPedigree/components/wizards/__tests__/parentCandidates.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the helper**

Create `parentCandidates.ts`:

```ts
import type { NcEdge, NcNode } from '@codaco/shared-consts';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

export type ParentRelation = 'child' | 'sibling' | 'define-parents';

function relTypeOf(
  edge: NcEdge,
  variableConfig: VariableConfig,
): string | undefined {
  const value = edge.attributes[variableConfig.relationshipTypeVariable];
  return typeof value === 'string' ? value : undefined;
}

/** Children, grandchildren, … reached by following parent->child edges down. */
export function descendantIds(
  nodeId: string,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): Set<string> {
  const result = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const edge of edges.values()) {
      if (
        edge.from === current &&
        relTypeOf(edge, variableConfig) !== 'partner' &&
        !result.has(edge.to)
      ) {
        result.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return result;
}

function parentIdsOf(
  nodeId: string,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): Set<string> {
  const result = new Set<string>();
  for (const edge of edges.values()) {
    if (edge.to === nodeId && relTypeOf(edge, variableConfig) !== 'partner') {
      result.add(edge.from);
    }
  }
  return result;
}

function partnerIdsOf(
  nodeId: string,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): Set<string> {
  const result = new Set<string>();
  for (const edge of edges.values()) {
    if (relTypeOf(edge, variableConfig) !== 'partner') continue;
    if (edge.from === nodeId) result.add(edge.to);
    else if (edge.to === nodeId) result.add(edge.from);
  }
  return result;
}

function donorIds(
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): Set<string> {
  const result = new Set<string>();
  for (const edge of edges.values()) {
    if (relTypeOf(edge, variableConfig) === 'donor') result.add(edge.from);
  }
  return result;
}

/**
 * Existing people who can plausibly be the genetic (egg/sperm) parent of the
 * node being added/defined relative to `anchorId`. Donors are always reusable;
 * descendants are never eligible.
 */
export function geneticParentCandidates(
  anchorId: string,
  relation: ParentRelation,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): Set<string> {
  const candidates = new Set<string>();

  if (relation === 'child') {
    candidates.add(anchorId);
    for (const p of partnerIdsOf(anchorId, edges, variableConfig)) {
      candidates.add(p);
    }
  } else {
    const parents = parentIdsOf(anchorId, edges, variableConfig);
    if (relation === 'sibling') {
      for (const p of parents) candidates.add(p);
    }
    for (const parent of parents) {
      for (const pp of partnerIdsOf(parent, edges, variableConfig)) {
        candidates.add(pp);
      }
    }
  }

  for (const d of donorIds(edges, variableConfig)) candidates.add(d);

  for (const d of descendantIds(anchorId, edges, variableConfig)) {
    candidates.delete(d);
  }
  if (relation !== 'child') {
    candidates.delete(anchorId);
    if (relation === 'define-parents') {
      for (const p of parentIdsOf(anchorId, edges, variableConfig)) {
        candidates.delete(p);
      }
    }
  }

  return candidates;
}

/**
 * Existing people who can be a social/adoptive/surrogate parent of `anchorId`.
 * No genetic-generation constraint — only the node itself, its descendants, and
 * its existing parents are excluded.
 */
export function socialParentCandidates(
  anchorId: string,
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): Set<string> {
  const excluded = new Set<string>([anchorId]);
  for (const d of descendantIds(anchorId, edges, variableConfig)) {
    excluded.add(d);
  }
  for (const p of parentIdsOf(anchorId, edges, variableConfig)) {
    excluded.add(p);
  }
  const result = new Set<string>();
  for (const id of nodes.keys()) {
    if (!excluded.has(id)) result.add(id);
  }
  return result;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/interfaces/FamilyPedigree/components/wizards/__tests__/parentCandidates.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint, format, commit**

```bash
cd packages/interview
pnpm exec oxlint --fix src/interfaces/FamilyPedigree/components/wizards/parentCandidates.ts src/interfaces/FamilyPedigree/components/wizards/__tests__/parentCandidates.test.ts
pnpm exec oxfmt src/interfaces/FamilyPedigree/components/wizards/parentCandidates.ts src/interfaces/FamilyPedigree/components/wizards/__tests__/parentCandidates.test.ts
cd ../..
git add packages/interview/src/interfaces/FamilyPedigree/components/wizards/parentCandidates.ts packages/interview/src/interfaces/FamilyPedigree/components/wizards/__tests__/parentCandidates.test.ts
git commit -m "feat(interview): topology helper for pedigree parent candidate sets"
```

---

## Task 2: Filter the genetic BioTriad lists (add-child, add-sibling)

Constrain the `existingNodes` each wizard passes to `BioTriadStep`.

**Files:**

- Modify: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/AddSiblingWizard.tsx`
- Modify: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/AddChildWizard.tsx`

- [ ] **Step 1: Add a candidate-id parameter to `buildNodeOptions` in `AddSiblingWizard`**

In `AddSiblingWizard.tsx`, import the helper and pass the sibling candidate set. Change `buildNodeOptions` to accept the allowed ids and filter to them:

```tsx
import { geneticParentCandidates } from './parentCandidates';

function buildNodeOptions(
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
  candidateIds: Set<string>,
): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (const [id, node] of nodes) {
    if (!candidateIds.has(id)) continue;
    if (node.attributes[variableConfig.egoVariable] === true) {
      options.push({ value: id, label: 'You' });
      continue;
    }
    options.push({
      value: id,
      label: getNodeLabel(id, nodes, edges, variableConfig),
    });
  }
  return options;
}
```

Update the call site in `openAddSiblingWizard`:

```tsx
const candidateIds = geneticParentCandidates(
  anchorNodeId,
  'sibling',
  edges,
  variableConfig,
);
const existingNodes = buildNodeOptions(
  nodes,
  edges,
  variableConfig,
  candidateIds,
);
```

- [ ] **Step 2: Same change in `AddChildWizard`**

In `AddChildWizard.tsx`, identically: import `geneticParentCandidates`, add the `candidateIds: Set<string>` parameter to `buildNodeOptions` and `if (!candidateIds.has(id)) continue;`, and at the call site in `openAddChildWizard`:

```tsx
const candidateIds = geneticParentCandidates(
  anchorNodeId,
  'child',
  edges,
  variableConfig,
);
const existingNodes = buildNodeOptions(
  nodes,
  edges,
  variableConfig,
  candidateIds,
);
```

- [ ] **Step 3: Verify the existing BioTriad render test still passes and add a sibling-exclusion render assertion**

In `packages/interview/src/interfaces/FamilyPedigree/components/wizards/steps/__tests__/BioTriadStep.test.tsx` the existing mutual-exclusion test is unaffected (it sets `existingNodes` directly). No change needed there.

Run the FamilyPedigree suite to confirm nothing regressed:
Run: `cd packages/interview && pnpm vitest run src/interfaces/FamilyPedigree`
Expected: PASS.

- [ ] **Step 4: Typecheck**

Run (repo root): `pnpm exec turbo run typecheck --filter=@codaco/interview`
Expected: 6 successful.

- [ ] **Step 5: Lint, format, commit**

```bash
cd packages/interview
pnpm exec oxlint --fix src/interfaces/FamilyPedigree/components/wizards/AddSiblingWizard.tsx src/interfaces/FamilyPedigree/components/wizards/AddChildWizard.tsx
pnpm exec oxfmt src/interfaces/FamilyPedigree/components/wizards/AddSiblingWizard.tsx src/interfaces/FamilyPedigree/components/wizards/AddChildWizard.tsx
cd ../..
git add packages/interview/src/interfaces/FamilyPedigree/components/wizards/AddSiblingWizard.tsx packages/interview/src/interfaces/FamilyPedigree/components/wizards/AddChildWizard.tsx
git commit -m "feat(interview): restrict add-child/add-sibling parent candidates by topology"
```

---

## Task 3: Social candidate list in `AddParentWizard`

Let an existing person (e.g. an aunt/uncle or grandparent) be selected as a social/surrogate parent, instead of only creating a new one.

**Files:**

- Modify: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/AddParentWizard.tsx`

- [ ] **Step 1: Add the candidate selector to `ParentDetailsStep`**

`ParentDetailsStep` currently renders `PersonFields namespace="parent"` + the parent-type `edgeType` field. Add a `parent-selection` radio (existing candidates + a `new` option), and only show `PersonFields` when `new` is selected. The component receives the candidate options:

```tsx
import FieldGroup from '@codaco/fresco-ui/form/FieldGroup';
// ...
function ParentDetailsStep({
  parentTypeOptions,
  candidateOptions,
}: {
  parentTypeOptions: typeof PARENT_EDGE_TYPE_OPTIONS_ALTER;
  candidateOptions: { value: string; label: string }[];
}) {
  const selectionOptions = [
    ...candidateOptions,
    { value: 'new', label: 'Create a new person' },
  ];
  const onlyNew =
    selectionOptions.length === 1 && selectionOptions[0]?.value === 'new';
  return (
    <>
      {onlyNew ? (
        <div className="hidden">
          <Field
            name="parent-selection"
            label="Who is this parent?"
            component={RadioGroupField}
            options={[{ value: 'new', label: 'new' }]}
            initialValue="new"
          />
        </div>
      ) : (
        <Field
          name="parent-selection"
          label="Who is this parent?"
          hint="Select an existing person or create a new one."
          component={RadioGroupField}
          options={selectionOptions}
          initialValue="new"
          required
        />
      )}
      <FieldGroup
        watch={['parent-selection']}
        condition={(values) => values['parent-selection'] === 'new'}
      >
        <PersonFields namespace="parent" />
      </FieldGroup>
      <Field
        name="edgeType"
        label="Parent type"
        component={RichSelectGroupField}
        options={parentTypeOptions}
        initialValue={parentTypeOptions[0]?.value ?? 'social'}
        required
      />
    </>
  );
}
```

- [ ] **Step 2: Resolve the selection in `transformToCommitBatch`**

Modify `transformToCommitBatch` so that when `parent-selection` is an existing node id, it adds only the parent→anchor edge (no new node); when it is `new`, it keeps the current create-new behaviour. Replace the node/edge construction:

```tsx
const selection =
  (formValues['parent-selection'] as string | undefined) ?? 'new';
const edgeType = (formValues.edgeType as string | undefined) ?? 'biological';

const edgeAttributes: Record<string, VariableValue> = {
  [variableConfig.relationshipTypeVariable]: edgeType,
  [variableConfig.isActiveVariable]: true,
};
if (edgeType === 'surrogate') {
  edgeAttributes[variableConfig.isGestationalCarrierVariable] = true;
}

const batch: CommitBatch = { nodes: [], edges: [] };

let parentRef: string;
if (selection === 'new') {
  const parentValues = (formValues.parent ?? {}) as Record<string, unknown>;
  const name = (parentValues.name as string | undefined) ?? '';
  const customAttrs = extractCustomAttributes(parentValues);
  parentRef = '__new-parent__';
  batch.nodes.push({
    tempId: parentRef,
    data: {
      attributes: {
        [variableConfig.nodeLabelVariable]: name,
        [variableConfig.egoVariable]: false,
        ...customAttrs,
      },
    },
  });
} else {
  parentRef = selection;
}

batch.edges.push({
  source: parentRef,
  target: anchorNodeId,
  data: { attributes: edgeAttributes },
});

// ...existing partnership loop, using `parentRef` instead of `parentTempId`...
```

Replace the two `parentTempId` references in the partnership loop with `parentRef`.

- [ ] **Step 3: Build candidate options and pass them through `openAddParentWizard`**

Import the helper and `getNodeLabel`, compute the social candidates, and pass options into the step:

```tsx
import { socialParentCandidates } from './parentCandidates';
import { getNodeLabel } from '~/interfaces/FamilyPedigree/pedigree-layout/utils/getDisplayLabel';

// inside openAddParentWizard, after existingParents is built:
const candidateIds = socialParentCandidates(
  anchorNodeId,
  nodes,
  edges,
  variableConfig,
);
const candidateOptions = [...candidateIds]
  .filter((id) => nodes.has(id))
  .map((id) => ({
    id,
    label: getNodeLabel(id, nodes, edges, variableConfig),
  }))
  .map(({ id, label }) => ({ value: id, label }));
```

And the `Parent details` step content:

```tsx
      {
        title: 'Parent details',
        content: () => (
          <ParentDetailsStep
            parentTypeOptions={parentTypeOptions}
            candidateOptions={candidateOptions}
          />
        ),
      },
```

- [ ] **Step 4: Test the transform handles an existing selection**

Add a test file `packages/interview/src/interfaces/FamilyPedigree/components/wizards/__tests__/addParentTransform.test.ts`. To test `transformToCommitBatch` it must be exported — add `export` to it in `AddParentWizard.tsx`. Test:

```ts
import { describe, expect, it } from 'vitest';

import type { NcEdge } from '@codaco/shared-consts';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import { transformToCommitBatch } from '../AddParentWizard';

const variableConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'name',
  egoVariable: 'isEgo',
  relationshipTypeVariable: 'rel',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGC',
};

describe('AddParentWizard transformToCommitBatch', () => {
  it('uses an existing selection as the parent without creating a node', () => {
    const batch = transformToCommitBatch(
      { 'parent-selection': 'uncle-1', 'edgeType': 'social' },
      'child-1',
      new Map<string, NcEdge>(),
      variableConfig,
    );
    expect(batch.nodes).toHaveLength(0);
    expect(batch.edges).toEqual([
      {
        source: 'uncle-1',
        target: 'child-1',
        data: { attributes: { rel: 'social', isActive: true } },
      },
    ]);
  });

  it('creates a new node when selection is "new"', () => {
    const batch = transformToCommitBatch(
      {
        'parent-selection': 'new',
        'parent': { name: 'New Person' },
        'edgeType': 'social',
      },
      'child-1',
      new Map<string, NcEdge>(),
      variableConfig,
    );
    expect(batch.nodes).toHaveLength(1);
    expect(batch.nodes[0]?.data.attributes.name).toBe('New Person');
  });
});
```

- [ ] **Step 5: Run the test (fail → implement already done → pass), typecheck**

Run: `pnpm vitest run src/interfaces/FamilyPedigree/components/wizards/__tests__/addParentTransform.test.ts`
Expected: PASS (2 tests).
Run (repo root): `pnpm exec turbo run typecheck --filter=@codaco/interview` — 6 successful.

- [ ] **Step 6: Lint, format, commit**

```bash
cd packages/interview
pnpm exec oxlint --fix src/interfaces/FamilyPedigree/components/wizards/AddParentWizard.tsx src/interfaces/FamilyPedigree/components/wizards/__tests__/addParentTransform.test.ts
pnpm exec oxfmt src/interfaces/FamilyPedigree/components/wizards/AddParentWizard.tsx src/interfaces/FamilyPedigree/components/wizards/__tests__/addParentTransform.test.ts
cd ../..
git add packages/interview/src/interfaces/FamilyPedigree/components/wizards/AddParentWizard.tsx packages/interview/src/interfaces/FamilyPedigree/components/wizards/__tests__/addParentTransform.test.ts
git commit -m "feat(interview): allow selecting an existing person as a social parent"
```

---

## Task 4: Give `DefineParentsWizard` a genetic candidate list (convert onto BioTriad)

Convert the genetic egg/sperm portion of `DefineParentsWizard` from the "Generic" new-person steps onto `BioTriadStep` + a shared parentage transform, so defining a node's parents offers the tight candidate set (and reuses donors), mirroring `AddChildWizard` with the target being the existing focal node.

**Files:**

- Modify: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/transforms/childCellTransform.ts`
- Create: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/transforms/buildParentageBatch.ts`
- Create: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/transforms/defineParentsTransform.ts`
- Modify: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/DefineParentsWizard.tsx`
- Tests: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/defineParentsTransform.test.ts`

- [ ] **Step 1: Extract `buildParentageBatch` (the target-agnostic part of `childCellTransform`)**

`childCellTransform` does: create `'child'` node, `buildChildParentage('child', values)`, an additional-parents (social) block emitting edges to `'child'`, and a partnership block. Everything after the child-node creation is target-agnostic. Create `buildParentageBatch.ts` holding that logic parameterised by `targetTempId`:

```ts
import type { VariableValue } from '@codaco/shared-consts';
import type {
  CommitBatch,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';

import { buildChildParentage } from './buildChildParentage';
import { extractCustomAttributes } from './personAttributes';

/**
 * Build the parent nodes + parent->target edges (genetic triad, additional
 * social parents, and partnerships between the resolved parents) for a target
 * node that already has a temp/real id. Does NOT create the target node.
 */
export function buildParentageBatch(
  targetTempId: string,
  values: Record<string, unknown>,
  variableConfig: VariableConfig,
): CommitBatch {
  const batch: CommitBatch = { nodes: [], edges: [] };

  const { nodes, edges, parents } = buildChildParentage(
    targetTempId,
    values,
    variableConfig,
  );
  batch.nodes.push(...nodes);
  batch.edges.push(...edges);

  const additionalParents = values['additional-parent'] as
    | Record<string, unknown>[]
    | undefined;
  if (values.hasOtherParents === true && Array.isArray(additionalParents)) {
    for (let i = 0; i < additionalParents.length; i++) {
      const ap = additionalParents[i];
      if (!ap) continue;
      const apName = (ap.name as string | undefined) ?? '';
      const apExtraAttrs = extractCustomAttributes(ap);
      const tempId = `additional-parent-${String(i)}`;
      batch.nodes.push({
        tempId,
        data: {
          attributes: {
            [variableConfig.nodeLabelVariable]: apName,
            [variableConfig.egoVariable]: false,
            ...apExtraAttrs,
          },
        },
      });
      batch.edges.push({
        source: tempId,
        target: targetTempId,
        data: {
          attributes: {
            [variableConfig.relationshipTypeVariable]: 'social',
            [variableConfig.isActiveVariable]: true,
          },
        },
      });
    }
  }

  for (let i = 0; i < parents.length; i++) {
    for (let j = i + 1; j < parents.length; j++) {
      const key = `partnership-${parents[i]!.roleKey}-${parents[j]!.roleKey}`;
      const val = values[key] as string | undefined;
      if (val === 'current' || val === 'ex') {
        batch.edges.push({
          source: parents[i]!.ref,
          target: parents[j]!.ref,
          data: {
            attributes: {
              [variableConfig.relationshipTypeVariable]: 'partner',
              [variableConfig.isActiveVariable]: val === 'current',
            },
          },
        });
      }
    }
  }

  return batch;
}
```

Then refactor `childCellTransform.ts` to create the `'child'` node and delegate the rest to `buildParentageBatch('child', values, variableConfig)`, merging its `nodes`/`edges` into the batch. The existing `childCellTransform` tests must still pass unchanged.

- [ ] **Step 2: Verify childCellTransform tests still pass**

Run: `pnpm vitest run src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/childCellTransform.test.ts`
Expected: PASS (unchanged).

- [ ] **Step 3: Write the failing `defineParentsTransform` test**

Create `__tests__/defineParentsTransform.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import { defineParentsTransform } from '../defineParentsTransform';

const variableConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'name',
  egoVariable: 'isEgo',
  relationshipTypeVariable: 'rel',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGC',
};

describe('defineParentsTransform', () => {
  it('attaches genetic parents to the existing focal node without creating it', () => {
    const batch = defineParentsTransform(
      {
        'egg-source': 'new',
        'new-egg-source': { name: 'Mum' },
        'sperm-source': 'donor-1',
        'sperm-source-is-donor': true,
        'egg-parent-carried': true,
      },
      'focal-1',
      variableConfig,
    );

    // No node is created for the focal person.
    expect(batch.nodes.some((n) => n.tempId === 'focal-1')).toBe(false);
    // The donor and new mum attach to the focal node.
    expect(
      batch.edges.some(
        (e) =>
          e.source === 'donor-1' &&
          e.target === 'focal-1' &&
          e.gameteRole === 'sperm',
      ),
    ).toBe(true);
    const mum = batch.nodes.find((n) => n.tempId === 'new-egg-source');
    expect(mum?.data.attributes.name).toBe('Mum');
  });
});
```

- [ ] **Step 4: Implement `defineParentsTransform`**

Create `defineParentsTransform.ts`:

```ts
import type {
  CommitBatch,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';

import { buildParentageBatch } from './buildParentageBatch';

/** Build the parent nodes/edges for an existing focal node (its parents are
 *  being defined). The focal node already exists, so it is never created. */
export function defineParentsTransform(
  values: Record<string, unknown>,
  focalNodeId: string,
  variableConfig: VariableConfig,
): CommitBatch {
  return buildParentageBatch(focalNodeId, values, variableConfig);
}
```

Run: `pnpm vitest run src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/defineParentsTransform.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite `DefineParentsWizard` to use `BioTriadStep` + the candidate list**

Rewrite `openDefineParentsWizard` to mirror `AddChildWizard` (read `AddChildWizard.tsx` as the reference), with the target being the existing focal node:

- Build candidates: `const candidateIds = geneticParentCandidates(focalNodeId, 'define-parents', edges, variableConfig);` and `existingNodes = buildNodeOptions(nodes, edges, variableConfig, candidateIds)` (reuse the same `buildNodeOptions` shape as `AddChildWizard` — extract it to a shared module `components/wizards/buildNodeOptions.ts` and import it in all three wizards to avoid a third copy).
- Build `preselection` from the focal node's existing parents the way `AddSiblingWizard.derivePreselection` does (a focal node with one known parent preselects that as egg, etc.) — or leave preselection empty if that is simpler; the candidate list is the key requirement.
- Steps: `Biological parents` (`BioTriadStep` wrapped in `BioTriadConfigProvider value={{ existingNodes, preselection }}`), `Other parents` (`GenericOtherParentsStep`), `Additional parents` (`GenericAdditionalParentsStep`, same skip), `Parent partnerships` (`NewParentPartnershipsStep`, `shouldSkipNewParentPartnerships`). These match `AddChildWizard`.
- `onFinish: (formValues) => defineParentsTransform(formValues, focalNodeId, variableConfig)`.
- Remove the now-unused imports of `GenericEggParentStep`, `GenericGestationalCarrierStep`, `GenericSpermParentStep`, `GenericOtherParentsStep`'s old wiring as needed, `ParentPartnershipsStep`, and `egoCellTransform`. Run `pnpm knip` afterward; if `GenericEggParentStep`/`GenericGestationalCarrierStep`/`GenericSpermParentStep` become unused across the repo, delete those files.

- [ ] **Step 6: Verify**

Run: `cd packages/interview && pnpm vitest run src/interfaces/FamilyPedigree` — expect PASS.
Run (repo root): `pnpm exec turbo run typecheck --filter=@codaco/interview` — 6 successful.
Run (repo root): `pnpm knip --workspace packages/interview` — confirm no new unused exports; delete any Generic step files it reports as unused (and re-run knip).

- [ ] **Step 7: Lint, format, commit**

```bash
cd packages/interview
pnpm exec oxlint --fix src/interfaces/FamilyPedigree/components/wizards/transforms/childCellTransform.ts src/interfaces/FamilyPedigree/components/wizards/transforms/buildParentageBatch.ts src/interfaces/FamilyPedigree/components/wizards/transforms/defineParentsTransform.ts src/interfaces/FamilyPedigree/components/wizards/DefineParentsWizard.tsx src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/defineParentsTransform.test.ts
pnpm exec oxfmt src/interfaces/FamilyPedigree/components/wizards/transforms/childCellTransform.ts src/interfaces/FamilyPedigree/components/wizards/transforms/buildParentageBatch.ts src/interfaces/FamilyPedigree/components/wizards/transforms/defineParentsTransform.ts src/interfaces/FamilyPedigree/components/wizards/DefineParentsWizard.tsx src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/defineParentsTransform.test.ts
cd ../..
git add -A -- packages/interview/src/interfaces/FamilyPedigree
git commit -m "feat(interview): give DefineParentsWizard a genetic candidate list via BioTriad"
```

(Use `git add -A -- packages/interview/src/interfaces/FamilyPedigree` here only because this task may delete Generic step files; confirm `git status` first that nothing unrelated is staged.)

---

## Task 5: Shared buildNodeOptions, changeset, full verification

- [ ] **Step 1: De-duplicate `buildNodeOptions`**

If not already done in Task 4, extract the identical `buildNodeOptions` into `packages/interview/src/interfaces/FamilyPedigree/components/wizards/buildNodeOptions.ts` (exporting one function taking `nodes, edges, variableConfig, candidateIds`) and import it in `AddChildWizard`, `AddSiblingWizard`, and `DefineParentsWizard`, deleting the local copies. Run the FamilyPedigree suite to confirm.

- [ ] **Step 2: Changeset**

Create `.changeset/interview-pedigree-parent-candidates.md`:

```markdown
---
'@codaco/interview': patch
---

`FamilyPedigree`: the wizards that pick a parent now offer a topology-aware
candidate list. Genetic (egg/sperm) parents are restricted to people who could
plausibly be a genetic parent of the new node — the relevant co-parents plus any
existing donor (reusable) — so adding a sibling no longer offers the
participant, their children, or their grandparents. Social/adoptive parents
(via "Add parent") can now be an existing person, such as an aunt/uncle or
grandparent who became a child's adoptive parent, instead of only a newly
created one. Defining a node's parents offers the same genetic candidate list.
```

- [ ] **Step 3: Full verification**

Run (repo root): `pnpm exec turbo run typecheck --filter=@codaco/interview` — 6 successful.
Run (from `packages/interview`): `pnpm vitest run src/interfaces/FamilyPedigree` — all pass.
Run (repo root): `pnpm knip --workspace packages/interview` — no new unused exports tied to this work.

- [ ] **Step 4: Commit**

```bash
git add .changeset/interview-pedigree-parent-candidates.md packages/interview/src/interfaces/FamilyPedigree/components/wizards/buildNodeOptions.ts packages/interview/src/interfaces/FamilyPedigree/components/wizards/AddChildWizard.tsx packages/interview/src/interfaces/FamilyPedigree/components/wizards/AddSiblingWizard.tsx packages/interview/src/interfaces/FamilyPedigree/components/wizards/DefineParentsWizard.tsx
git commit -m "refactor(interview): share buildNodeOptions; changeset for parent candidate lists"
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** Task 1 = topology helper (both filters); Task 2 = tight filter in add-child/add-sibling; Task 3 = loose filter + existing-person selection in add-parent; Task 4 = define-parents genetic candidate list (BioTriad conversion); Task 5 = de-dup + changeset + verify. Every spec section maps to a task.
- **Type consistency:** `geneticParentCandidates(anchorId, relation, edges, variableConfig)`, `socialParentCandidates(anchorId, nodes, edges, variableConfig)`, `descendantIds`, `buildParentageBatch(targetTempId, values, variableConfig)`, `defineParentsTransform(values, focalNodeId, variableConfig)` are used with the same signatures throughout.
- **Reference implementation:** `AddChildWizard` is the template for the Task 4 wizard rewrite — read it before rewriting `DefineParentsWizard`.
- **Known risk:** Task 4 is the largest. If the `BioTriad` conversion of `DefineParentsWizard` proves to diverge from `AddChildWizard` in a way that breaks carrier/partnership behaviour, stop and report rather than forcing it.
