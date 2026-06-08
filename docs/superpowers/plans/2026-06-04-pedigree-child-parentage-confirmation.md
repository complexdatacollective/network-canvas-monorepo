# Family Pedigree Child Parentage Confirmation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture each child's egg parent, sperm parent, and gestational carrier through one shared model in every child-creation path, and stop the "Add parent" dialog from offering genetic parent options once a child already has both genetic parents.

**Architecture:** Extract the per-child triad→edges logic from `childCellTransform` into a pure `buildChildParentage` helper reused by both the Add-child wizard and the quick-start. Make `BioTriadStep` namespace-aware so it can run once per quick-start child. Replace the quick-start's hard-coded `biological`-from-both-parents logic with per-child `BioTriadStep` capture. Guard the add-parent dialog by counting a node's genetic parents (`biological`/`donor` edges).

**Tech Stack:** React, TypeScript, Zustand, Vitest, Storybook (`@storybook/addon-vitest` interaction tests), fresco-ui form primitives (`Field`, `FieldNamespace`, `FieldGroup`).

**Reference spec:** `docs/superpowers/specs/2026-06-04-pedigree-child-parentage-confirmation-design.md`

**Key facts established during design:**

- `FieldNamespace` (`packages/fresco-ui/src/form/FieldNamespace.tsx`) composes a dotted prefix; `useFormValue` (used by `FieldGroup` `watch`) resolves names against it exactly like `Field`. So wrapping a subtree in `<FieldNamespace prefix={p}>` namespaces all field names AND watch keys consistently. Namespaced values materialize as nested objects/arrays (`values.childWithPartner[i].parentage['egg-source']`).
- A child has at most two genetic parents (egg + sperm). Genetic edges are `biological` and `donor` (per `pedigree-layout/computeBioRelatives.ts`); `surrogate`/`social`/`adoptive` are not.
- When the egg parent carried the pregnancy, the egg source gets **two** edges to the child: a genetic edge (no GC flag) and a second `biological` edge with `isGestationalCarrier` set. This is intentional and asserted by `childCellTransform.test.ts`. Preserve it.
- The simple "Add person → child" path (`AddPersonFields` mode `'child'`) is unreachable: `NodeContextMenu` emits `'child'`, which `handleMenuAction` routes to `handleAddChild` (the wizard), so `handleAddPerson` is only ever called with `'partner'`.

**Run commands (from `packages/interview`):**

- Single test file: `pnpm vitest run <path>`
- Package typecheck (builds workspace deps first): `pnpm exec turbo run typecheck --filter=@codaco/interview` (run from repo root)
- Lint a file: `pnpm exec oxlint --fix <path>` then `pnpm exec oxfmt <path>` (from `packages/interview`)
- Dead-code check: `pnpm knip` (from repo root)

---

## Task 1: Extract `buildChildParentage` shared helper

Pure function holding the per-child role→edges logic currently inline in `childCellTransform`. Refactor `childCellTransform` to call it. Behaviour-preserving.

**Files:**

- Create: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/transforms/buildChildParentage.ts`
- Create: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/buildChildParentage.test.ts`
- Modify: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/transforms/childCellTransform.ts`
- Test (must still pass): `packages/interview/src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/childCellTransform.test.ts`

- [ ] **Step 1: Write the failing test for the helper**

Create `__tests__/buildChildParentage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import { buildChildParentage } from '../buildChildParentage';

const variableConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'name',
  egoVariable: 'isEgo',
  relationshipTypeVariable: 'relationship',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGC',
};

describe('buildChildParentage', () => {
  it('emits biological edges from two existing parents, plus a carrier edge when the egg parent carried', () => {
    const { nodes, edges, parents } = buildChildParentage(
      'child',
      {
        'egg-source': 'ego-1',
        'sperm-source': 'partner-1',
        'egg-parent-carried': true,
      },
      variableConfig,
    );

    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(3);

    const egoEdges = edges.filter((e) => e.source === 'ego-1');
    expect(egoEdges).toHaveLength(2);
    expect(
      egoEdges.some(
        (e) =>
          e.data.attributes.relationship === 'biological' &&
          e.data.attributes.isGC === undefined,
      ),
    ).toBe(true);
    expect(egoEdges.some((e) => e.data.attributes.isGC === true)).toBe(true);

    const spermEdge = edges.find((e) => e.source === 'partner-1');
    expect(spermEdge?.data.attributes.relationship).toBe('biological');
    expect(parents.map((p) => p.roleKey)).toContain('egg-source');
  });

  it('creates a donor node and donor edge for a new sperm donor', () => {
    const { nodes, edges } = buildChildParentage(
      'child',
      {
        'egg-source': 'ego-1',
        'sperm-source': 'new',
        'new-sperm-source': { name: 'Donor Dan' },
        'sperm-source-is-donor': true,
        'egg-parent-carried': true,
      },
      variableConfig,
    );

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      tempId: 'new-sperm-source',
      data: { attributes: { name: 'Donor Dan', isEgo: false } },
    });
    const donorEdge = edges.find((e) => e.source === 'new-sperm-source');
    expect(donorEdge?.data.attributes.relationship).toBe('donor');
  });

  it('records a separate gestational carrier as a surrogate', () => {
    const { nodes, edges } = buildChildParentage(
      'child',
      {
        'egg-source': 'ego-1',
        'sperm-source': 'partner-1',
        'egg-parent-carried': false,
        'carrier-source': 'new',
        'new-carrier': { name: 'Surrogate Sue' },
      },
      variableConfig,
    );

    const surrogateNode = nodes.find((n) => n.tempId === 'new-carrier');
    expect(surrogateNode?.data.attributes.name).toBe('Surrogate Sue');
    const surrogateEdge = edges.find((e) => e.source === 'new-carrier');
    expect(surrogateEdge?.data.attributes).toMatchObject({
      relationship: 'surrogate',
      isGC: true,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/buildChildParentage.test.ts`
Expected: FAIL — `buildChildParentage` cannot be imported (module does not exist).

- [ ] **Step 3: Implement the helper**

Create `buildChildParentage.ts`. This is the role/carrier logic lifted verbatim from `childCellTransform.ts:91-194`, returning parent nodes, parent→child edges, and an ordered `parents` list (ref + roleKey) for partnership pairing:

```ts
import type { VariableValue } from '@codaco/shared-consts';
import type {
  CommitBatch,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';

const KNOWN_PERSON_KEYS = new Set(['name']);

function extractCustomAttributes(
  obj: Record<string, unknown>,
): Record<string, VariableValue> | undefined {
  const attrs: Record<string, VariableValue> = {};
  let hasAttrs = false;
  for (const [key, val] of Object.entries(obj)) {
    if (!KNOWN_PERSON_KEYS.has(key) && val !== undefined) {
      attrs[key] = val as VariableValue;
      hasAttrs = true;
    }
  }
  return hasAttrs ? attrs : undefined;
}

export type RoleKey = 'egg-source' | 'sperm-source' | 'carrier-source';
export type ChildRelationshipType = 'biological' | 'donor' | 'surrogate';

const NEW_PERSON_NAMESPACE: Record<RoleKey, string> = {
  'egg-source': 'new-egg-source',
  'sperm-source': 'new-sperm-source',
  'carrier-source': 'new-carrier',
};

export type ResolvedParent = { ref: string; roleKey: RoleKey };

export type ChildParentage = {
  nodes: CommitBatch['nodes'];
  edges: CommitBatch['edges'];
  /** Ordered parents (new entries first, then existing) for partnership pairing. */
  parents: ResolvedParent[];
};

type ParentEntry = {
  tempId: string;
  roleKey: RoleKey;
  attributes: Record<string, VariableValue>;
  relationshipType: ChildRelationshipType;
  isGestationalCarrier: boolean;
};

type ExistingParentEdge = {
  sourceId: string;
  roleKey: RoleKey;
  relationshipType: ChildRelationshipType;
  isGestationalCarrier: boolean;
};

/**
 * Build the parent nodes and parent->child edges for one child from its triad
 * answers (egg-source / sperm-source / carrier-source, donor flags, and
 * whether the egg parent carried). Co-parent `partner` edges are NOT emitted
 * here — callers own those via their own partnership inputs.
 */
export function buildChildParentage(
  childTempId: string,
  triadValues: Record<string, unknown>,
  variableConfig: VariableConfig,
): ChildParentage {
  const nodes: CommitBatch['nodes'] = [];
  const edges: CommitBatch['edges'] = [];

  const parentEntries: ParentEntry[] = [];
  const existingParentEdges: ExistingParentEdge[] = [];
  let resolvedEggSourceId: string | undefined;

  const eggParentCarried = triadValues['egg-parent-carried'] !== false;
  const activeRoles: RoleKey[] = eggParentCarried
    ? ['egg-source', 'sperm-source']
    : ['egg-source', 'sperm-source', 'carrier-source'];

  for (const roleKey of activeRoles) {
    const selection = triadValues[roleKey] as string | undefined;
    if (!selection) continue;

    const isDonor = triadValues[`${roleKey}-is-donor`] === true;
    let relationshipType: ChildRelationshipType = 'biological';
    if (isDonor) relationshipType = 'donor';
    if (roleKey === 'carrier-source') relationshipType = 'surrogate';

    if (selection === 'new') {
      const namespace = NEW_PERSON_NAMESPACE[roleKey];
      const personValues = triadValues[namespace] as
        | Record<string, unknown>
        | undefined;
      if (!personValues) continue;
      const name = (personValues.name as string | undefined) ?? '';
      const extraAttrs = extractCustomAttributes(personValues);
      parentEntries.push({
        tempId: namespace,
        roleKey,
        attributes: {
          [variableConfig.nodeLabelVariable]: name,
          [variableConfig.egoVariable]: false,
          ...extraAttrs,
        },
        relationshipType,
        isGestationalCarrier: roleKey === 'carrier-source',
      });
    } else {
      if (roleKey === 'egg-source') resolvedEggSourceId = selection;
      existingParentEdges.push({
        sourceId: selection,
        roleKey,
        relationshipType,
        isGestationalCarrier: roleKey === 'carrier-source',
      });
    }
  }

  // When the egg parent carried, the egg source is also the gestational carrier.
  // Existing egg source => add a second (carrier) edge; new egg source => flag it.
  if (eggParentCarried) {
    if (resolvedEggSourceId) {
      existingParentEdges.push({
        sourceId: resolvedEggSourceId,
        roleKey: 'carrier-source',
        relationshipType: 'biological',
        isGestationalCarrier: true,
      });
    } else {
      const eggEntry = parentEntries.find(
        (e) => e.tempId === NEW_PERSON_NAMESPACE['egg-source'],
      );
      if (eggEntry) eggEntry.isGestationalCarrier = true;
    }
  }

  for (const entry of parentEntries) {
    nodes.push({
      tempId: entry.tempId,
      data: { attributes: entry.attributes },
    });
    const edgeAttributes: Record<string, VariableValue> = {
      [variableConfig.relationshipTypeVariable]: entry.relationshipType,
      [variableConfig.isActiveVariable]: true,
    };
    if (entry.isGestationalCarrier) {
      edgeAttributes[variableConfig.isGestationalCarrierVariable] = true;
    }
    edges.push({
      source: entry.tempId,
      target: childTempId,
      data: { attributes: edgeAttributes },
    });
  }

  for (const entry of existingParentEdges) {
    const edgeAttributes: Record<string, VariableValue> = {
      [variableConfig.relationshipTypeVariable]: entry.relationshipType,
      [variableConfig.isActiveVariable]: true,
    };
    if (entry.isGestationalCarrier) {
      edgeAttributes[variableConfig.isGestationalCarrierVariable] = true;
    }
    edges.push({
      source: entry.sourceId,
      target: childTempId,
      data: { attributes: edgeAttributes },
    });
  }

  const parents: ResolvedParent[] = [
    ...parentEntries.map((e) => ({ ref: e.tempId, roleKey: e.roleKey })),
    ...existingParentEdges.map((e) => ({
      ref: e.sourceId,
      roleKey: e.roleKey,
    })),
  ];

  return { nodes, edges, parents };
}
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run: `pnpm vitest run src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/buildChildParentage.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor `childCellTransform` to use the helper**

In `childCellTransform.ts`, delete the local `RoleKey`, `NEW_PERSON_NAMESPACE`, `ParentEntry`, `buildParentFromNew`, and the role-resolution/carrier blocks (`childCellTransform.ts:23-63` and `:91-194`). Replace the body between creating the `child` node and the additional-parents block with a call to the helper, and rewrite the partnership block to use the returned `parents`:

```ts
import { buildChildParentage } from './buildChildParentage';
// ...keep KNOWN_PERSON_KEYS / extractCustomAttributes for the child node + additional parents...

export function childCellTransform(
  values: Record<string, unknown>,
  _anchorNodeId: string,
  _nodes: Map<string, NcNode>,
  _edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): CommitBatch {
  const batch: CommitBatch = { nodes: [], edges: [] };

  const childValues = values.child as Record<string, unknown> | undefined;
  const childName = (childValues?.name as string | undefined) ?? '';
  const childExtraAttrs = childValues
    ? extractCustomAttributes(childValues)
    : undefined;

  batch.nodes.push({
    tempId: 'child',
    data: {
      attributes: {
        [variableConfig.nodeLabelVariable]: childName,
        [variableConfig.egoVariable]: false,
        ...childExtraAttrs,
      },
    },
  });

  const { nodes, edges, parents } = buildChildParentage(
    'child',
    values,
    variableConfig,
  );
  batch.nodes.push(...nodes);
  batch.edges.push(...edges);

  // ...additional-parents (social) block unchanged (childCellTransform.ts:196-229)...

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

- [ ] **Step 6: Run the existing childCellTransform tests to verify no behaviour change**

Run: `pnpm vitest run src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/childCellTransform.test.ts`
Expected: PASS (5 tests, unchanged).

- [ ] **Step 7: Lint, format, commit**

```bash
cd packages/interview
pnpm exec oxlint --fix src/interfaces/FamilyPedigree/components/wizards/transforms/buildChildParentage.ts src/interfaces/FamilyPedigree/components/wizards/transforms/childCellTransform.ts src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/buildChildParentage.test.ts
pnpm exec oxfmt src/interfaces/FamilyPedigree/components/wizards/transforms/buildChildParentage.ts src/interfaces/FamilyPedigree/components/wizards/transforms/childCellTransform.ts src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/buildChildParentage.test.ts
cd ../..
git add packages/interview/src/interfaces/FamilyPedigree/components/wizards/transforms/buildChildParentage.ts packages/interview/src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/buildChildParentage.test.ts packages/interview/src/interfaces/FamilyPedigree/components/wizards/transforms/childCellTransform.ts
git commit -m "refactor(interview): extract buildChildParentage from childCellTransform"
```

---

## Task 2: Make `BioTriadStep` namespace-aware

Add an optional `prefix` prop so multiple instances can coexist in one form (one per quick-start child). No prefix = current behaviour.

**Files:**

- Modify: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/steps/BioTriadStep.tsx`

- [ ] **Step 1: Add the `prefix` prop and conditional namespace wrapper**

Import `FieldNamespace` and accept `prefix`. Wrap the returned JSX only when a non-empty prefix is given (an empty prefix in `FieldNamespace` would append a trailing dot):

```tsx
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
// ...existing imports...

export default function BioTriadStep({ prefix }: { prefix?: string } = {}) {
  const { existingNodes, preselection } = useBioTriadConfig();
  // ...existing body that builds `content`...

  const content = (
    <div className="flex flex-col gap-6">
      {/* ...existing ParentSection / carrier FieldGroup / sperm ParentSection... */}
    </div>
  );

  return prefix ? (
    <FieldNamespace prefix={prefix}>{content}</FieldNamespace>
  ) : (
    content
  );
}
```

(Mechanically: extract the current returned `<div>…</div>` into a `content` const, then return the conditional wrapper.)

- [ ] **Step 2: Verify the Add-child wizard path still type-checks and renders unchanged**

Run: `pnpm vitest run src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/childCellTransform.test.ts`
Expected: PASS (the transform is unaffected; this is a smoke check that nothing imported broke).

Run (repo root): `pnpm exec turbo run typecheck --filter=@codaco/interview`
Expected: typecheck PASS.

- [ ] **Step 3: Lint, format, commit**

```bash
cd packages/interview
pnpm exec oxlint --fix src/interfaces/FamilyPedigree/components/wizards/steps/BioTriadStep.tsx
pnpm exec oxfmt src/interfaces/FamilyPedigree/components/wizards/steps/BioTriadStep.tsx
cd ../..
git add packages/interview/src/interfaces/FamilyPedigree/components/wizards/steps/BioTriadStep.tsx
git commit -m "refactor(interview): make BioTriadStep namespace-aware via optional prefix"
```

---

## Task 3: Quick-start — per-child egg/sperm capture

Render a per-child `BioTriadStep` (namespaced under `childWithPartner[i].parentage`) in `ChildrenDetailStep`, and replace `egoCellTransform`'s hard-coded `biological`-from-both-parents children block with `buildChildParentage` per child.

**Files:**

- Modify: `packages/interview/src/interfaces/FamilyPedigree/components/quickStartWizard/ChildrenDetailStep.tsx`
- Modify: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/EgoCellWizard.tsx`
- Modify: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/transforms/egoCellTransform.ts`
- Test: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/egoCellTransform.test.ts`

- [ ] **Step 1: Write failing transform tests for per-child parentage**

Add these cases to `egoCellTransform.test.ts` (reuse the file's existing `variableConfig`/helpers; if it lacks a config, mirror Task 1's `variableConfig`). Each child's triad lives under `childWithPartner[i].parentage`:

```ts
it('nuclear family: each child gets biological edges from ego and partner', () => {
  const values: Record<string, unknown> = {
    hasPartner: true,
    partner: { name: 'Partner' },
    childrenWithPartnerCount: 1,
    childWithPartner: [
      {
        name: 'Kid',
        parentage: {
          'egg-source': 'ego',
          'sperm-source': 'partner',
          'egg-parent-carried': true,
        },
      },
    ],
  };

  const { batch } = egoCellTransform(values, variableConfig);

  const child = batch.nodes.find(
    (n) => n.data.attributes[variableConfig.nodeLabelVariable] === 'Kid',
  );
  expect(child).toBeDefined();
  const childId = child!.tempId;

  const childParentEdges = batch.edges.filter((e) => e.target === childId);
  // ego biological + ego carrier(GC) + partner biological
  expect(childParentEdges).toHaveLength(3);
  expect(
    childParentEdges.some(
      (e) =>
        e.source === 'ego' &&
        e.data.attributes[variableConfig.relationshipTypeVariable] ===
          'biological',
    ),
  ).toBe(true);
  expect(
    childParentEdges.some(
      (e) =>
        e.source === 'partner' &&
        e.data.attributes[variableConfig.relationshipTypeVariable] ===
          'biological',
    ),
  ).toBe(true);
});

it('donor-conceived child: partner is not a parent; a donor is generated', () => {
  const values: Record<string, unknown> = {
    hasPartner: true,
    partner: { name: 'Partner' },
    childrenWithPartnerCount: 1,
    childWithPartner: [
      {
        name: 'Kid',
        parentage: {
          'egg-source': 'ego',
          'sperm-source': 'new',
          'new-sperm-source': { name: 'Donor' },
          'sperm-source-is-donor': true,
          'egg-parent-carried': true,
        },
      },
    ],
  };

  const { batch } = egoCellTransform(values, variableConfig);

  const child = batch.nodes.find(
    (n) => n.data.attributes[variableConfig.nodeLabelVariable] === 'Kid',
  )!;
  const donor = batch.nodes.find(
    (n) => n.data.attributes[variableConfig.nodeLabelVariable] === 'Donor',
  );
  expect(donor).toBeDefined();

  // partner has no parent edge to this child
  expect(
    batch.edges.some(
      (e) => e.source === 'partner' && e.target === child.tempId,
    ),
  ).toBe(false);
  const donorEdge = batch.edges.find(
    (e) => e.source === donor!.tempId && e.target === child.tempId,
  );
  expect(
    donorEdge?.data.attributes[variableConfig.relationshipTypeVariable],
  ).toBe('donor');
});
```

- [ ] **Step 2: Run the transform tests to verify they fail**

Run: `pnpm vitest run src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/egoCellTransform.test.ts`
Expected: FAIL — current `egoCellTransform` ignores `childWithPartner[i].parentage` and instead emits `biological` from ego and partner unconditionally (the donor test fails: partner edge present, no donor node).

- [ ] **Step 3: Replace the children block in `egoCellTransform`**

Add `import { buildChildParentage } from './buildChildParentage';` at the top. Replace the existing children loop (`egoCellTransform.ts:274-324`, the `childrenCount`/`childWithPartner` block) with:

```ts
// Children with partner — each child's biological parentage is captured per
// child via the BioTriad model (egg/sperm/carrier), namespaced under
// `childWithPartner[i].parentage`. The partner is only a parent of a child if
// the participant selected them as the egg or sperm source.
const childrenCount = hasPartner
  ? Number(values.childrenWithPartnerCount ?? 0)
  : 0;
const childrenArray = values.childWithPartner as
  | Record<string, unknown>[]
  | undefined;

for (let i = 0; i < childrenCount; i++) {
  const child = childrenArray?.[i];
  if (!child) continue;

  const childName = (child.name as string | undefined) ?? '';
  const childExtraAttrs = extractUnknownAttributes(
    child,
    new Set(['name', 'parentage']),
  );
  const tempId = `child-${String(i)}`;

  batch.nodes.push({
    tempId,
    data: {
      attributes: {
        [variableConfig.nodeLabelVariable]: childName,
        [variableConfig.egoVariable]: false,
        ...childExtraAttrs,
      },
    },
  });

  const triadValues = (child.parentage ?? {}) as Record<string, unknown>;
  const { nodes: parentNodes, edges: parentEdges } = buildChildParentage(
    tempId,
    triadValues,
    variableConfig,
  );
  batch.nodes.push(...parentNodes);
  batch.edges.push(...parentEdges);
}
```

(Note: `extractUnknownAttributes` already exists in `egoCellTransform.ts`; the new `Set(['name', 'parentage'])` keeps the child's own custom attributes while excluding the triad sub-object. The old code's hard-coded `'biological'` ego/partner edges are removed. The module-level `KNOWN_PERSON_KEYS` constant (`egoCellTransform.ts:15`) was used only by the old children block — remove it, since `oxlint`/`knip` will otherwise flag it as unused.)

- [ ] **Step 4: Run the transform tests to verify they pass**

Run: `pnpm vitest run src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/egoCellTransform.test.ts`
Expected: PASS (existing tests + the two new cases).

- [ ] **Step 5: Render the per-child `BioTriadStep` in `ChildrenDetailStep`**

Rewrite `ChildrenDetailStep.tsx` to wrap the children list in a single `BioTriadConfigProvider` (shared candidate list / preselection) and render a namespaced `BioTriadStep` per child. It needs the ego reference for the "You" option:

```tsx
'use client';

import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import BioTriadStep, {
  BioTriadConfigProvider,
} from '../wizards/steps/BioTriadStep';
import PersonFields from './PersonFields';

export default function ChildrenDetailStep({ egoRef }: { egoRef: string }) {
  const { childrenWithPartnerCount, partner } = useFormValue([
    'childrenWithPartnerCount',
    'partner',
  ]);
  const count = Number(childrenWithPartnerCount ?? 0);
  const partnerName =
    (partner as { name?: string } | undefined)?.name || 'Your partner';

  if (count === 0) return null;

  const bioTriadConfig = {
    existingNodes: [
      { value: egoRef, label: 'You' },
      { value: 'partner', label: partnerName },
    ],
    preselection: {
      eggSource: egoRef,
      spermSource: 'partner',
      carrier: 'egg-source',
    },
  };

  return (
    <BioTriadConfigProvider value={bioTriadConfig}>
      <Paragraph>
        Please tell us about each of your children with your current partner,
        and confirm who their biological parents are.
      </Paragraph>
      <div className="flex flex-col gap-6">
        {Array.from({ length: count }, (_, i) => (
          <Surface key={i} level={1} spacing="sm" shadow="sm">
            <Heading level="h3">Child {i + 1}</Heading>
            <PersonFields namespace={`childWithPartner[${String(i)}]`} />
            <BioTriadStep prefix={`childWithPartner[${String(i)}].parentage`} />
          </Surface>
        ))}
      </div>
    </BioTriadConfigProvider>
  );
}
```

`BioTriadConfigProvider` is already exported from `BioTriadStep.tsx`.

- [ ] **Step 6: Pass `egoRef` into `ChildrenDetailStep` from the wizard**

In `EgoCellWizard.tsx`, change the `Children details` step content to provide the ego reference (matching `egoCellTransform`'s `existingEgoId ?? 'ego'`):

```tsx
        {
          title: 'Children details',
          content: () => <ChildrenDetailStep egoRef={egoId ?? 'ego'} />,
          skip: ({ getFieldValue }) => {
            if (getFieldValue('hasPartner') !== true) return true;
            return Number(getFieldValue('childrenWithPartnerCount') ?? 0) === 0;
          },
        },
```

- [ ] **Step 7: Typecheck**

Run (repo root): `pnpm exec turbo run typecheck --filter=@codaco/interview`
Expected: PASS.

- [ ] **Step 8: Lint, format, commit**

```bash
cd packages/interview
pnpm exec oxlint --fix src/interfaces/FamilyPedigree/components/quickStartWizard/ChildrenDetailStep.tsx src/interfaces/FamilyPedigree/components/wizards/EgoCellWizard.tsx src/interfaces/FamilyPedigree/components/wizards/transforms/egoCellTransform.ts src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/egoCellTransform.test.ts
pnpm exec oxfmt src/interfaces/FamilyPedigree/components/quickStartWizard/ChildrenDetailStep.tsx src/interfaces/FamilyPedigree/components/wizards/EgoCellWizard.tsx src/interfaces/FamilyPedigree/components/wizards/transforms/egoCellTransform.ts src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/egoCellTransform.test.ts
cd ../..
git add packages/interview/src/interfaces/FamilyPedigree/components/quickStartWizard/ChildrenDetailStep.tsx packages/interview/src/interfaces/FamilyPedigree/components/wizards/EgoCellWizard.tsx packages/interview/src/interfaces/FamilyPedigree/components/wizards/transforms/egoCellTransform.ts packages/interview/src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/egoCellTransform.test.ts
git commit -m "feat(interview): capture each quick-start child's egg and sperm parent"
```

---

## Task 4: Retire the dead simple child-creation path

Remove the unreachable `'child'` mode from `AddPersonFields` and the `'child'` branch from `handleAddPerson`. Verify with knip.

**Files:**

- Modify: `packages/interview/src/interfaces/FamilyPedigree/components/AddPersonForm.tsx`
- Modify: `packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeView.tsx`

- [ ] **Step 1: Confirm the path is dead**

Run (repo root): `pnpm knip --workspace packages/interview 2>&1 | grep -i "AddPerson\|child" || echo "no knip hits"`
Also confirm by inspection that `PedigreeView.tsx`'s `handleMenuAction` routes `'child'` to `handleAddChild` (the wizard), so the `else` branch only ever passes `'partner'` to `handleAddPerson`.
Expected: no live caller passes `mode='child'` to `AddPersonFields`.

- [ ] **Step 2: Remove the `'child'` branch from `handleAddPerson`**

In `PedigreeView.tsx`, delete the `case 'child':` block (`PedigreeView.tsx:163-184`) inside `handleAddPerson`'s `switch (mode)`, and remove `'child'` from the `AddPersonMode` usage. The `partners`/`partnerOptions`/`children` computations in `AddPersonFields` tied solely to `'child'`/`'partner'` modes stay only as needed by `'partner'`.

- [ ] **Step 3: Remove `'child'` from `AddPersonFields`**

In `AddPersonForm.tsx`: change `export type AddPersonMode = 'parent' | 'child' | 'partner' | 'sibling';` to `export type AddPersonMode = 'parent' | 'partner' | 'sibling';` and delete the `mode === 'child'` partner-selection block (`AddPersonForm.tsx:49-75` partner-derivation for child, and `:129-136` the `partnerId` field). If knip in Step 1 also flagged `'parent'`/`'sibling'` modes as unreachable, remove those branches too and reduce `AddPersonMode` accordingly; otherwise leave them.

- [ ] **Step 4: Typecheck and run the FamilyPedigree suite**

Run (repo root): `pnpm exec turbo run typecheck --filter=@codaco/interview`
Run (from `packages/interview`): `pnpm vitest run src/interfaces/FamilyPedigree`
Expected: typecheck PASS; tests PASS except the known pre-existing partnership-copy story failure (addressed in Task 6).

- [ ] **Step 5: Lint, format, commit**

```bash
cd packages/interview
pnpm exec oxlint --fix src/interfaces/FamilyPedigree/components/AddPersonForm.tsx src/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeView.tsx
pnpm exec oxfmt src/interfaces/FamilyPedigree/components/AddPersonForm.tsx src/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeView.tsx
cd ../..
git add packages/interview/src/interfaces/FamilyPedigree/components/AddPersonForm.tsx packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeView.tsx
git commit -m "refactor(interview): remove dead simple add-child path"
```

---

## Task 5: Guard the add-parent dialog

Stop `AddParentWizard` offering genetic (`biological`/`donor`) parent types when the node already has two genetic parents.

**Files:**

- Create: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/parentTypeOptions.ts`
- Create: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/__tests__/parentTypeOptions.test.ts`
- Modify: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/AddParentWizard.tsx`
- Modify: `packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeView.tsx`

- [ ] **Step 1: Write the failing test for the pure helpers**

Create `__tests__/parentTypeOptions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { NcEdge } from '@codaco/shared-consts';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import {
  addableParentTypeOptions,
  countGeneticParents,
} from '../parentTypeOptions';

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

describe('countGeneticParents', () => {
  it('counts biological and donor edges into the node, ignoring others', () => {
    const edges = new Map<string, NcEdge>([
      edge('mum', 'child', 'biological'),
      edge('donor', 'child', 'donor'),
      edge('surr', 'child', 'surrogate'),
      edge('step', 'child', 'social'),
      edge('child', 'gkid', 'biological'),
    ]);
    expect(countGeneticParents('child', edges, variableConfig)).toBe(2);
  });
});

describe('addableParentTypeOptions', () => {
  it('excludes biological and donor when both genetic slots are filled', () => {
    const values = addableParentTypeOptions(2).map((o) => o.value);
    expect(values).not.toContain('biological');
    expect(values).not.toContain('donor');
    expect(values).toContain('social');
  });

  it('offers all types when fewer than two genetic parents exist', () => {
    const values = addableParentTypeOptions(1).map((o) => o.value);
    expect(values).toContain('biological');
    expect(values).toContain('donor');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/interfaces/FamilyPedigree/components/wizards/__tests__/parentTypeOptions.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the helpers**

Create `parentTypeOptions.ts`:

```ts
import type { NcEdge } from '@codaco/shared-consts';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import { PARENT_EDGE_TYPE_OPTIONS_ALTER } from '../quickStartWizard/fieldOptions';

const GENETIC_RELATIONSHIPS = new Set(['biological', 'donor']);

export function countGeneticParents(
  nodeId: string,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): number {
  let count = 0;
  for (const edge of edges.values()) {
    if (edge.to !== nodeId) continue;
    const rel = edge.attributes[variableConfig.relationshipTypeVariable] as
      | string
      | undefined;
    if (rel && GENETIC_RELATIONSHIPS.has(rel)) count += 1;
  }
  return count;
}

/**
 * Parent-type options offered when adding a parent. A person has at most two
 * genetic parents (egg + sperm), so once both genetic slots are filled the
 * genetic types (`biological`/`donor`) are removed, leaving non-genetic options.
 */
export function addableParentTypeOptions(geneticParentCount: number) {
  if (geneticParentCount >= 2) {
    return PARENT_EDGE_TYPE_OPTIONS_ALTER.filter(
      (o) => o.value !== 'biological' && o.value !== 'donor',
    );
  }
  return PARENT_EDGE_TYPE_OPTIONS_ALTER;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/interfaces/FamilyPedigree/components/wizards/__tests__/parentTypeOptions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the options into `AddParentWizard`**

In `AddParentWizard.tsx`, accept an options list and use it in `ParentDetailsStep` (replacing the hard-coded `PARENT_EDGE_TYPE_OPTIONS_ALTER` and defaulting to the first allowed value):

```tsx
function ParentDetailsStep({
  parentTypeOptions,
}: {
  parentTypeOptions: typeof PARENT_EDGE_TYPE_OPTIONS_ALTER;
}) {
  return (
    <>
      <PersonFields namespace="parent" />
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

Add a `parentTypeOptions` parameter to `openAddParentWizard` and pass it through to the step:

```tsx
export async function openAddParentWizard(
  openDialog: ReturnType<typeof useDialog>['openDialog'],
  anchorNodeId: string,
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
  parentTypeOptions: typeof PARENT_EDGE_TYPE_OPTIONS_ALTER,
): Promise<CommitBatch | null> {
  // ...existing existingParents computation...
  const result = await openDialog({
    type: 'wizard',
    title: 'Add parent',
    progress: null,
    steps: [
      {
        title: 'Parent details',
        content: () => (
          <ParentDetailsStep parentTypeOptions={parentTypeOptions} />
        ),
      },
      // ...existing partnerships step...
    ],
    // ...existing onFinish...
  });
  // ...existing result handling...
}
```

- [ ] **Step 6: Compute and pass the options in `handleAddParent`**

In `PedigreeView.tsx`, import the helpers and base the routing on the genetic-parent count:

```tsx
import {
  addableParentTypeOptions,
  countGeneticParents,
} from '~/interfaces/FamilyPedigree/components/wizards/parentTypeOptions';

const handleAddParent = async (nodeId: string) => {
  const geneticCount = countGeneticParents(nodeId, edges, variableConfig);

  const result =
    geneticCount >= 2
      ? await openAddParentWizard(
          openDialog,
          nodeId,
          nodes,
          edges,
          variableConfig,
          addableParentTypeOptions(geneticCount),
        )
      : await openDefineParentsWizard(
          openDialog,
          nodeId,
          nodes,
          edges,
          variableConfig,
        );

  if (result) {
    commitBatch(result);
  }
};
```

(This replaces the previous `bioParentCount` block at `PedigreeView.tsx:301-329`, which incorrectly treated `surrogate` as genetic.)

- [ ] **Step 7: Typecheck and run the wizard + transform tests**

Run (repo root): `pnpm exec turbo run typecheck --filter=@codaco/interview`
Run (from `packages/interview`): `pnpm vitest run src/interfaces/FamilyPedigree/components/wizards`
Expected: PASS.

- [ ] **Step 8: Lint, format, commit**

```bash
cd packages/interview
pnpm exec oxlint --fix src/interfaces/FamilyPedigree/components/wizards/parentTypeOptions.ts src/interfaces/FamilyPedigree/components/wizards/__tests__/parentTypeOptions.test.ts src/interfaces/FamilyPedigree/components/wizards/AddParentWizard.tsx src/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeView.tsx
pnpm exec oxfmt src/interfaces/FamilyPedigree/components/wizards/parentTypeOptions.ts src/interfaces/FamilyPedigree/components/wizards/__tests__/parentTypeOptions.test.ts src/interfaces/FamilyPedigree/components/wizards/AddParentWizard.tsx src/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeView.tsx
cd ../..
git add packages/interview/src/interfaces/FamilyPedigree/components/wizards/parentTypeOptions.ts packages/interview/src/interfaces/FamilyPedigree/components/wizards/__tests__/parentTypeOptions.test.ts packages/interview/src/interfaces/FamilyPedigree/components/wizards/AddParentWizard.tsx packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeView.tsx
git commit -m "fix(interview): only offer genetic parent types when a genetic slot is free"
```

---

## Task 6: Update Storybook interaction tests + optional new coverage

The quick-start scenario walkthroughs now pass through the per-child egg/sperm `BioTriadStep`. Update the existing interaction tests to match, then optionally add new scenario coverage.

**Files:**

- Modify: `packages/interview/src/interfaces/FamilyPedigree/FamilyPedigree.stories.tsx`

- [ ] **Step 1: Identify the affected play functions**

Run (from `packages/interview`): `pnpm vitest run --project=storybook src/interfaces/FamilyPedigree/FamilyPedigree.stories.tsx`
Expected: one or more FAILs where a play function drives the old "Partner and children" → "Children details" flow (the steps no longer match: a per-child "Egg Parent"/"Sperm Parent" `BioTriadStep` now appears in the Children details step). Note the failing story names and the exact step in each play function that diverges.

(Reminder: the pre-existing partnership-copy failure in this file is unrelated — see the spec's Risks section. Do not let it mask the new failures; identify failures specifically tied to the children flow.)

- [ ] **Step 2: Update each affected play function**

For each failing children-flow play function, after the "Children details" step fills the child's name, drive the new per-child `BioTriadStep`. For a nuclear-family child, the egg/sperm sources default to "You" and the partner via preselection, so the play function only needs to advance past the step (or explicitly assert the egg/sperm radios are present and pre-selected). Concretely, within the children step's dialog:

```ts
// after entering the child's name
const childDialog = await getDialog();
// the per-child BioTriad renders egg/sperm parent selectors
expect(within(childDialog).getByText('Egg Parent')).toBeInTheDocument();
expect(within(childDialog).getByText('Sperm Parent')).toBeInTheDocument();
// defaults (You / partner) are acceptable for the nuclear scenario — continue
await userEvent.click(
  within(childDialog).getByRole('button', { name: /next|finish|continue/i }),
);
```

Match the helper utilities (`getDialog`, `within`, `userEvent`) already used in this file; adjust button-name regexes to the wizard's actual control labels. Update any post-finish assertions about child→parent edges to reflect that edges now come from the triad (still `biological` from You and partner in the nuclear default).

- [ ] **Step 3: (Optional) Add new scenario stories/tests**

If adding coverage, create play functions for: donor-conceived child (set sperm source to "Create a new person", flag donor, assert a `donor` edge and no partner→child edge), and the add-parent regression (build the nuclear family, open "Add parent" on a child, assert the parent-type options contain "Social Parent" but not "Biological Parent" or "Donor"). Keep these additive — do not remove existing coverage.

- [ ] **Step 4: Run the storybook project to verify**

Run (from `packages/interview`): `pnpm vitest run --project=storybook src/interfaces/FamilyPedigree/FamilyPedigree.stories.tsx`
Expected: PASS for all children-flow stories. (The unrelated partnership-copy assertion may still fail if that WIP is unresolved; confirm any remaining failure is that one and not a children-flow regression.)

- [ ] **Step 5: Lint, format, commit**

```bash
cd packages/interview
pnpm exec oxlint --fix src/interfaces/FamilyPedigree/FamilyPedigree.stories.tsx
pnpm exec oxfmt src/interfaces/FamilyPedigree/FamilyPedigree.stories.tsx
cd ../..
git add packages/interview/src/interfaces/FamilyPedigree/FamilyPedigree.stories.tsx
git commit -m "test(interview): update pedigree quick-start stories for per-child parentage"
```

---

## Task 7: Changeset and full verification

**Files:**

- Create: `.changeset/interview-pedigree-child-parentage.md`

- [ ] **Step 1: Write the changeset**

Create `.changeset/interview-pedigree-child-parentage.md`:

```markdown
---
'@codaco/interview': patch
---

`FamilyPedigree`: confirm each child's egg and sperm parent. The quick-start
previously asked only how many children the participant had with a partner and
then assumed both were the child's biological parents, which made the "Add
parent" dialog offer impossible genetic options on those children. The
quick-start now captures each child's egg parent, sperm parent, and gestational
carrier with the same `BioTriad` model used by the "Add child" wizard
(generating donor/surrogate parents as needed), and the "Add parent" dialog no
longer offers a biological or donor parent type once a child already has two
genetic parents.
```

- [ ] **Step 2: Full verification**

Run (repo root): `pnpm exec turbo run typecheck --filter=@codaco/interview`
Run (from `packages/interview`): `pnpm vitest run src/interfaces/FamilyPedigree`
Run (repo root): `pnpm knip --workspace packages/interview`
Expected: typecheck PASS; all FamilyPedigree unit + storybook tests PASS (modulo the unrelated partnership-copy WIP if still present); knip reports no new unused exports from the files touched.

- [ ] **Step 3: Commit**

```bash
git add .changeset/interview-pedigree-child-parentage.md
git commit -m "chore(interview): changeset for child parentage confirmation"
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** Task 1 = shared helper; Task 2 = namespace-aware `BioTriadStep`; Task 3 = quick-start capture; Task 4 = retire dead path; Task 5 = add-parent guard; Task 6 = storybook tests (+ optional); Task 7 = changeset/verify. Every spec section maps to a task.
- **Behaviour preservation:** Task 1 keeps `childCellTransform`'s carrier double-edge (genetic edge + GC-flagged edge from a carried egg source), asserted by the existing tests.
- **Type consistency:** `RoleKey`, `ResolvedParent`, `ChildParentage`, `buildChildParentage`, `countGeneticParents`, `addableParentTypeOptions` are used with the same signatures across tasks.
- **Known unrelated failure:** the partnership-copy Storybook assertion already fails due to in-progress copy edits and is out of scope (spec Risks).
