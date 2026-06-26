# Configurable Family Pedigree — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the FamilyPedigree stage's parent terminology configurable (Gamete-based vs Gendered, fixed or participant-chosen), add an optional video+text intro step, add two enforced boundary rules, and add the genetics-data capture (gameteRole on the network, biological sex for non-parent people) that Feature #3 needs.

**Architecture:** The framing is a label-layer indirection over the existing neutral `gameteRole` primitive — a shared term map + a store-backed `useFramedTerms()` hook that every hardcoded-label call site reads from. Schema gains mandatory `framing`/`boundaries` and optional `introScreen`, plus an `edgeConfig.gameteRoleVariable` and `nodeConfig.biologicalSexVariable`. Two new quick-start steps (intro, framing selection) and two new boundary predicates round it out.

**Tech Stack:** TypeScript, Zod (protocol-validation), Zustand (interview store), React + redux-form (architect-web), Vitest, Storybook.

## Global Constraints

- **No `any` types.** Never use `as` assertions to bypass type errors — fix the cause.
- **No barrel files** (no `index.ts` re-export hubs); import from source.
- **No schema migration / no backwards-compat** — schema 8 has no production protocols. New fields are mandatory and explicit except `introScreen` (genuinely optional content).
- **Framing changes labels/copy only** — wizard structure, steps, order, and the `gameteRole` data model are identical across framings.
- **Framing ids:** exactly `['gamete', 'gendered']`. Author labels: `Gamete-based`, `Gendered`. Gamete terms: "Egg Parent"/"Sperm Parent"; Gendered terms: "Mother"/"Father"; carrier/donor stay gamete-based in both.
- **Biological sex values:** `['female', 'male', 'intersex', 'unknown']`.
- Run `pnpm typecheck`, `pnpm lint:fix`, and `pnpm knip` before considering the feature done (pre-commit hooks run lint+format; do not add ignore rules).
- Reference spec: `docs/superpowers/specs/2026-06-26-pedigree-configurable-framing-design.md`.

---

## File Structure

- `packages/shared-consts/src/family-pedigree-framing.ts` (new) — framing ids, author labels, term map.
- `packages/shared-consts/src/family-pedigree.ts` (modify) — add `BIOLOGICAL_SEX_VALUES`.
- `packages/shared-consts/src/index.ts` (modify) — export new module.
- `packages/protocol-validation/src/schemas/8/stages/family-pedigree.ts` (modify) — `framing`, `boundaries`, `introScreen`, `edgeConfig.gameteRoleVariable`, `nodeConfig.biologicalSexVariable`.
- `packages/protocol-validation/src/schemas/8/schema.ts` (modify) — `introScreen.videoAssetId` → `video` asset cross-ref.
- `packages/shared-consts/src/stage-metadata.ts` (modify) — add `selectedFraming?`, remove `gameteRole`.
- `packages/interview/src/interfaces/FamilyPedigree/store.ts` (modify) — `framing`/`setFraming`; write `gameteRole` to network edge var.
- `packages/interview/src/interfaces/FamilyPedigree/hooks/useFramedTerms.ts` (new) — term lookup hook.
- `packages/interview/src/interfaces/FamilyPedigree/FamilyPedigreeProvider.tsx` (modify) — init framing from config.
- `packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/utils/getDisplayLabel.ts` (modify) — `framing` param; read gameteRole from network var.
- Wizard label call sites (modify): `BioParentsIntroStep.tsx`, `EggParentStep.tsx`, `SpermParentStep.tsx`, `GestationalCarrierStep.tsx`, `wizards/steps/BioTriadStep.tsx`, `wizards/EgoCellWizard.tsx`.
- `quickStartWizard/IntroStep.tsx`, `quickStartWizard/FramingSelectionStep.tsx` (new).
- `quickStartWizard/PersonFields.tsx` + person-creating transforms (modify) — biological-sex question.
- `utils/validatePedigree.ts` + `components/PedigreeChecklist.tsx` (modify) — boundary predicates + severities.
- `apps/architect-web/src/components/sections/FamilyPedigree/{FramingConfig,IntroScreen,BoundaryOptions}.tsx` (new) + `NodeConfiguration.tsx`/`EdgeConfiguration.tsx` (modify) + `StageEditor/Interfaces.tsx` (modify).

---

## Task 1: shared-consts framing module + biological-sex values

**Files:**

- Create: `packages/shared-consts/src/family-pedigree-framing.ts`
- Modify: `packages/shared-consts/src/family-pedigree.ts`
- Modify: `packages/shared-consts/src/index.ts`
- Test: `packages/shared-consts/src/__tests__/family-pedigree-framing.test.ts`

**Interfaces:**

- Produces: `FRAMING_IDS: readonly ['gamete','gendered']`, `type FramingId`, `FRAMING_AUTHOR_LABELS: Record<FramingId,string>`, `type FramingTerms`, `FRAMING_TERMS: Record<FramingId, FramingTerms>`, and `BIOLOGICAL_SEX_VALUES: readonly ['female','male','intersex','unknown']`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import {
  FRAMING_IDS,
  FRAMING_AUTHOR_LABELS,
  FRAMING_TERMS,
} from '../family-pedigree-framing';
import { BIOLOGICAL_SEX_VALUES } from '../family-pedigree';

describe('family-pedigree-framing', () => {
  it('has exactly two framings with author labels', () => {
    expect(FRAMING_IDS).toEqual(['gamete', 'gendered']);
    expect(FRAMING_AUTHOR_LABELS).toEqual({
      gamete: 'Gamete-based',
      gendered: 'Gendered',
    });
  });
  it('maps gamete vs gendered parent terms, sharing carrier/donor', () => {
    expect(FRAMING_TERMS.gamete.eggParent).toBe('Egg Parent');
    expect(FRAMING_TERMS.gamete.spermParent).toBe('Sperm Parent');
    expect(FRAMING_TERMS.gendered.eggParent).toBe('Mother');
    expect(FRAMING_TERMS.gendered.spermParent).toBe('Father');
    for (const id of FRAMING_IDS) {
      expect(FRAMING_TERMS[id].gestationalCarrier).toBe('Gestational Carrier');
      expect(FRAMING_TERMS[id].eggDonor).toBe('Egg Donor');
      expect(FRAMING_TERMS[id].spermDonor).toBe('Sperm Donor');
    }
  });
  it('exposes the canonical biological-sex values', () => {
    expect(BIOLOGICAL_SEX_VALUES).toEqual([
      'female',
      'male',
      'intersex',
      'unknown',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/shared-consts test -- family-pedigree-framing`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the module + sex values**

In `family-pedigree-framing.ts`, write `FRAMING_IDS`, `FramingId`, `FRAMING_AUTHOR_LABELS`, `FramingTerms`, `FRAMING_TERMS` exactly as in spec §2. In `family-pedigree.ts` append:

```ts
export const BIOLOGICAL_SEX_VALUES = [
  'female',
  'male',
  'intersex',
  'unknown',
] as const;
export type BiologicalSex = (typeof BIOLOGICAL_SEX_VALUES)[number];
```

Add `export * from './family-pedigree-framing';` to `src/index.ts` (this is the established index pattern in shared-consts; do not create a new barrel).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/shared-consts test -- family-pedigree-framing`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-consts/src/family-pedigree-framing.ts packages/shared-consts/src/family-pedigree.ts packages/shared-consts/src/index.ts packages/shared-consts/src/__tests__/family-pedigree-framing.test.ts
git commit -m "feat(shared-consts): add family-pedigree framing terms and biological-sex values"
```

---

## Task 2: Schema — framing, boundaries, introScreen, new variable bindings

**Files:**

- Modify: `packages/protocol-validation/src/schemas/8/stages/family-pedigree.ts`
- Modify: `packages/protocol-validation/src/schemas/8/schema.ts` (video asset cross-ref)
- Test: `packages/protocol-validation/src/schemas/8/stages/__tests__/family-pedigree.test.ts` (create if absent)

**Interfaces:**

- Consumes: `FRAMING_IDS`, `BIOLOGICAL_SEX_VALUES` from Task 1.
- Produces: extended `familyPedigreeStage` with `framing`, `boundaries`, `introScreen?`, `edgeConfig.gameteRoleVariable`, `nodeConfig.biologicalSexVariable`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { familyPedigreeStage } from '../family-pedigree';

const base = /* a minimal valid FamilyPedigree stage object — copy from an existing fixture */;

describe('familyPedigreeStage framing/boundaries/introScreen', () => {
  it('accepts fixed framing with a value', () => {
    expect(familyPedigreeStage.safeParse({ ...base, framing: { mode: 'fixed', value: 'gamete' },
      boundaries: { requireGrandparents: 'off', requireChildrenContributors: 'off' } }).success).toBe(true);
  });
  it('rejects fixed framing without a value', () => {
    expect(familyPedigreeStage.safeParse({ ...base, framing: { mode: 'fixed' },
      boundaries: { requireGrandparents: 'off', requireChildrenContributors: 'off' } }).success).toBe(false);
  });
  it('accepts participantChoice framing', () => {
    expect(familyPedigreeStage.safeParse({ ...base, framing: { mode: 'participantChoice' },
      boundaries: { requireGrandparents: 'required', requireChildrenContributors: 'recommended' } }).success).toBe(true);
  });
  it('requires both boundary keys', () => {
    expect(familyPedigreeStage.safeParse({ ...base, framing: { mode: 'participantChoice' },
      boundaries: { requireGrandparents: 'off' } }).success).toBe(false);
  });
  it('accepts an optional intro screen', () => {
    expect(familyPedigreeStage.safeParse({ ...base, framing: { mode: 'participantChoice' },
      boundaries: { requireGrandparents: 'off', requireChildrenContributors: 'off' },
      introScreen: { text: 'Welcome' } }).success).toBe(true);
  });
});
```

Build `base` from the existing development-protocol or an existing test fixture for a FamilyPedigree stage (search `packages/protocol-validation` tests for an existing example) — include the now-required `framing`/`boundaries` in `base` only after you add them so the prior tests still construct valid stages.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/protocol-validation test -- family-pedigree`
Expected: FAIL (fields not yet on schema).

- [ ] **Step 3: Extend the schema**

In `family-pedigree.ts`, import `FRAMING_IDS`, `BIOLOGICAL_SEX_VALUES` from `@codaco/shared-consts`. Add to `NodeConfigSchema`:

```ts
biologicalSexVariable: entityAttributeReference({ subject: { sibling: 'type', entity: 'node' } }),
```

Add to `EdgeConfigSchema`:

```ts
gameteRoleVariable: entityAttributeReference({ subject: { sibling: 'type', entity: 'edge' } }),
```

Add to `familyPedigreeStage.extend({ ... })`:

```ts
framing: z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('fixed'), value: z.enum(FRAMING_IDS) }),
  z.object({ mode: z.literal('participantChoice') }),
]),
boundaries: z.object({
  requireGrandparents: z.enum(['required', 'recommended', 'off']),
  requireChildrenContributors: z.enum(['required', 'recommended', 'off']),
}),
introScreen: z.object({
  title: z.string().optional(),
  text: z.string(),
  videoAssetId: z.string().optional(),
}).optional(),
```

- [ ] **Step 4: Add the video-asset cross-reference in `schema.ts`**

In the protocol-level `superRefine` in `schemas/8/schema.ts`, alongside the existing Geospatial/Roster asset checks, add: for each stage where `stage.type === 'FamilyPedigree' && stage.introScreen?.videoAssetId`, assert `protocol.assetManifest?.[videoAssetId]?.type === 'video'`, else `ctx.addIssue` with a clear message and path. Mirror the existing Geospatial block exactly.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @codaco/protocol-validation test -- family-pedigree`
Expected: PASS. Also run the full schema suite: `pnpm --filter @codaco/protocol-validation test` and fix any fixtures that now need `framing`/`boundaries`.

- [ ] **Step 6: Commit**

```bash
git add packages/protocol-validation/src/schemas/8/stages/family-pedigree.ts packages/protocol-validation/src/schemas/8/schema.ts packages/protocol-validation/src/schemas/8/stages/__tests__/family-pedigree.test.ts
git commit -m "feat(protocol-validation): add framing, boundaries, introScreen, and sex/gamete variable bindings to FamilyPedigree"
```

---

## Task 3: Store framing state + `useFramedTerms` hook

**Files:**

- Modify: `packages/interview/src/interfaces/FamilyPedigree/store.ts`
- Create: `packages/interview/src/interfaces/FamilyPedigree/hooks/useFramedTerms.ts`
- Modify: `packages/interview/src/interfaces/FamilyPedigree/FamilyPedigreeProvider.tsx`
- Test: `packages/interview/src/interfaces/FamilyPedigree/hooks/__tests__/useFramedTerms.test.tsx`

**Interfaces:**

- Consumes: `FramingId`, `FRAMING_TERMS` (Task 1).
- Produces: store `framing: FramingId | null`, `setFraming(framing: FramingId): void`; `useFramedTerms(): FramingTerms | null`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
// Wrap with whatever store provider the FamilyPedigree store uses (see store.ts test setup).
import { useFramedTerms } from '../useFramedTerms';

describe('useFramedTerms', () => {
  it('returns gamete terms when framing is gamete', () => {
    const { result } = renderHook(() => useFramedTerms(), {
      wrapper: framingWrapper('gamete'),
    });
    expect(result.current?.eggParent).toBe('Egg Parent');
  });
  it('returns gendered terms when framing is gendered', () => {
    const { result } = renderHook(() => useFramedTerms(), {
      wrapper: framingWrapper('gendered'),
    });
    expect(result.current?.spermParent).toBe('Father');
  });
  it('returns null before the participant has chosen', () => {
    const { result } = renderHook(() => useFramedTerms(), {
      wrapper: framingWrapper(null),
    });
    expect(result.current).toBeNull();
  });
});
```

Implement `framingWrapper(framing)` using the store's existing test harness (see `FamilyPedigree/__tests__/store.test.ts` for how the store is created/seeded).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/interview test -- useFramedTerms`
Expected: FAIL.

- [ ] **Step 3: Add store state + hook + provider init**

In `store.ts`: add `framing: FramingId | null` to state (initialised `null`) and `setFraming: (f: FramingId) => void`. In `useFramedTerms.ts`:

```ts
import { FRAMING_TERMS, type FramingTerms } from '@codaco/shared-consts';
import { useFamilyPedigreeStore } from '../store'; // use the actual store selector hook

export function useFramedTerms(): FramingTerms | null {
  const framing = useFamilyPedigreeStore((s) => s.framing);
  return framing ? FRAMING_TERMS[framing] : null;
}
```

In `FamilyPedigreeProvider.tsx`: read the stage config; if `framing.mode === 'fixed'` call `setFraming(framing.value)` on init; if `participantChoice` leave `null`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/interview test -- useFramedTerms`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/interfaces/FamilyPedigree/store.ts packages/interview/src/interfaces/FamilyPedigree/hooks/useFramedTerms.ts packages/interview/src/interfaces/FamilyPedigree/FamilyPedigreeProvider.tsx packages/interview/src/interfaces/FamilyPedigree/hooks/__tests__/useFramedTerms.test.tsx
git commit -m "feat(interview): add framing store state and useFramedTerms hook"
```

---

## Task 4: Thread framing into `getDisplayLabel`

**Files:**

- Modify: `packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/utils/getDisplayLabel.ts`
- Modify: `packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeView.tsx`
- Test: `packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/__tests__/getDisplayLabel.test.ts` (extend)

**Interfaces:**

- Consumes: `FramingId`, `FRAMING_TERMS`.
- Produces: `gameteParentLabel(gameteRole, kind, framing)`, and `getDisplayLabel`/`computeAllDisplayLabels`/`getNodeLabel` gaining a trailing `framing: FramingId` parameter.

- [ ] **Step 1: Write the failing test** — extend the existing test to assert that an unnamed egg-biological parent of ego labels as `'Egg Parent'` under `'gamete'` and `'Mother'` under `'gendered'`, and that neutral labels (Grandparent, Cousin) are unchanged across framings.

- [ ] **Step 2: Run** `pnpm --filter @codaco/interview test -- getDisplayLabel` → FAIL.

- [ ] **Step 3: Implement** — change `gameteParentLabel` to look up `FRAMING_TERMS[framing]` (egg→`eggParent`/`eggDonor`, sperm→`spermParent`/`spermDonor`); add the `framing` parameter through `getDisplayLabel`, `computeAllDisplayLabels`, `getNodeLabel`. In `PedigreeView.tsx`, read `framing` from the store (fallback `'gamete'` only if the view can render before selection — confirm it cannot, per spec §4.1) and pass it to the label computation.

- [ ] **Step 4: Run** the test → PASS, plus `pnpm --filter @codaco/interview test -- getDisplayLabel computeBioRelatives` to confirm no regressions.

- [ ] **Step 5: Commit** `feat(interview): frame gamete-parent display labels`.

---

## Task 5: Swap wizard label call sites to `useFramedTerms`

**Files:**

- Modify: `quickStartWizard/{BioParentsIntroStep,EggParentStep,SpermParentStep,GestationalCarrierStep}.tsx`
- Modify: `wizards/steps/BioTriadStep.tsx`
- Modify: `wizards/EgoCellWizard.tsx` (step titles)
- Test: `wizards/steps/__tests__/BioTriadStep.test.tsx` (extend) + a new render test per step.

**Interfaces:**

- Consumes: `useFramedTerms()`.

- [ ] **Step 1: Write the failing test** — render `BioTriadStep` inside a gamete-framing wrapper and assert it shows "Egg Parent"/"Sperm Parent"; render inside a gendered wrapper and assert "Mother"/"Father". Repeat for `EggParentStep`/`SpermParentStep` titles+copy and `GestationalCarrierStep`.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — in each component, call `const terms = useFramedTerms();` and replace every hardcoded "Egg Parent"/"Sperm Parent"/"Gestational Carrier"/donor literal with `terms?.eggParent` etc. For `EgoCellWizard.tsx` step titles, read framing from the store at dialog-open time and title the steps from `FRAMING_TERMS[framing]`. Longer explanatory copy that differs by framing (the BioParentsIntro paragraph, framing-chooser blurbs) lives as local constants keyed by `FramingId` in the component — not in shared-consts.

- [ ] **Step 4: Run** the step tests → PASS.

- [ ] **Step 5: Commit** `refactor(interview): route pedigree wizard parent labels through useFramedTerms`.

---

## Task 6: Intro step + framing-selection step

**Files:**

- Create: `quickStartWizard/IntroStep.tsx`, `quickStartWizard/FramingSelectionStep.tsx`
- Modify: `wizards/EgoCellWizard.tsx` (prepend the two steps with `skip` predicates)
- Modify: `store.ts` (record selected framing — see Task 9 for metadata persistence; here just `setFraming`)
- Test: a Storybook play story (`FamilyPedigree.framing.stories.tsx`) + unit tests for the `skip` predicates.

**Interfaces:**

- Consumes: stage `introScreen`, `framing` config; `setFraming`.

- [ ] **Step 1: Write the failing test** — unit-test the two `skip` predicates: IntroStep skipped iff `introScreen` absent; FramingSelectionStep skipped iff `framing.mode !== 'participantChoice'`. Add a Storybook play story driving participantChoice: intro → select "gendered" → assert the next bio-parent step reads "Mother".

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — `IntroStep` renders `introScreen.title`/`text` and, if `videoAssetId`, the existing interview asset video component (find how `Information`/prompts render a video asset and reuse it). `FramingSelectionStep` shows the two framings with example copy and, on selection, calls `setFraming(choice)`. In `EgoCellWizard.tsx` prepend both steps to the `steps` array with the `skip` predicates.

- [ ] **Step 4: Run** unit + story → PASS.

- [ ] **Step 5: Commit** `feat(interview): add pedigree intro and framing-selection quick-start steps`.

---

## Task 7: Persist `gameteRole` on the network edge

**Files:**

- Modify: `packages/interview/src/interfaces/FamilyPedigree/store.ts` (finalize/commit), the parent-building transforms under `components/wizards/transforms/` that emit edges with `gameteRole`, and `pedigree-layout/utils/getDisplayLabel.ts` + `components/wizards/parentCandidates.ts` (`nominatedGameteRoles`) to read from the network variable.
- Modify: `packages/shared-consts/src/stage-metadata.ts` (remove `gameteRole`).
- Test: `FamilyPedigree/__tests__/commitBatch.test.ts` / `store.test.ts` (extend).

**Interfaces:**

- Consumes: `variableConfig.gameteRoleVariable` (new, threaded through `VariableConfig`).
- Produces: edges whose `attributes[gameteRoleVariable] === 'egg' | 'sperm'`.

- [ ] **Step 1: Write the failing test** — finalize a network containing an egg parent→ego edge; assert the resulting Redux edge has `attributes[gameteRoleVariable] === 'egg'`, and that `nominatedGameteRoles`/`getDisplayLabel` derive the egg/sperm role from that attribute (not from metadata).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — add `gameteRoleVariable` to the interview `VariableConfig` (sourced from `edgeConfig`). Where edges are written to Redux (`finalizeNetwork`/`commitBatch`), set `attributes[gameteRoleVariable]` from the in-store `FamilyEdge.gameteRole`. Update `nominatedGameteRoles` and `getDisplayLabel`'s gamete lookups to read the edge attribute. Remove `gameteRole` from `FamilyPedigreeStageMetadataSchema` and any code that wrote/read it from metadata.

- [ ] **Step 4: Run** the pedigree store/label suites → PASS (`pnpm --filter @codaco/interview test -- FamilyPedigree`).

- [ ] **Step 5: Commit** `feat(interview): persist pedigree gameteRole as a network edge variable`.

---

## Task 8: Capture biological sex for non-parent people

**Files:**

- Modify: `quickStartWizard/PersonFields.tsx` (add the sex question) and the person-creating wizards/transforms so the value is written to `nodeConfig.biologicalSexVariable` for ego/children/siblings/social parents; egg/sperm parents are not asked.
- Test: render tests for PersonFields (question shown for a non-gamete-parent person, omitted for a gamete-parent creation) + a transform test asserting the attribute is written.

**Interfaces:**

- Consumes: `BIOLOGICAL_SEX_VALUES`, `variableConfig.biologicalSexVariable`.

- [ ] **Step 1: Write the failing test** — `PersonFields` with `namespace="child"` renders a "Biological sex" radio with the four `BIOLOGICAL_SEX_VALUES`; the egg/sperm parent creation path does not render it; the relevant transform writes `attributes[biologicalSexVariable]` from the answer.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — add a `biologicalSex` field to `PersonFields` gated by a prop `askBiologicalSex` (true for ego/child/sibling/social-parent creation, false for egg/sperm parent steps). Thread the value into the person-attribute builders (`buildPersonAttributes`) so it is written to `biologicalSexVariable`.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `feat(interview): capture biological sex for non-parent pedigree people`.

---

## Task 9: Boundary predicates + checklist severities + recorded framing

**Files:**

- Modify: `utils/validatePedigree.ts` (add `geneticParentIds`, `requireGrandparents`, `requireChildrenContributors`, wire severities), `components/PedigreeChecklist.tsx` (surface items), `store.ts` (write `selectedFraming` to metadata on finalize for participantChoice; "no children" affirmation flag).
- Modify: `packages/shared-consts/src/stage-metadata.ts` (add `selectedFraming?: FramingId`).
- Test: `utils/__tests__/validatePedigree.test.ts` (extend).

**Interfaces:**

- Consumes: stage `boundaries`, `variableConfig`.
- Produces: `geneticParentIds(nodeId, edges, variableConfig): string[]` (edges into node with relType `biological`|`donor`); boundary predicate functions returning `ValidationIssue[]` tagged by severity.

- [ ] **Step 1: Write the failing tests** — per spec §4.3: `requireGrandparents` unmet when a genetic parent has <2 genetic parents, met (incl. placeholder nodes) when each has 2; `requireChildrenContributors` unmet without ≥1 child or a "no children" affirmation, and unmet until each genetic co-parent has 2 parents + each of those has 2; severity `required` → blocking issue, `recommended` → non-blocking checklist item, `off` → absent.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — add `geneticParentIds` and the two predicates; have `validatePedigreeCompleteness` include `required` boundary issues (joining the ≥2-parents rule); `PedigreeChecklist` reads severities to render blockers vs nudges. Add `selectedFraming?: FramingId` to the metadata schema and write it on finalize when `participantChoice`. Add the "no children" affirmation flag captured at the children step.

- [ ] **Step 4: Run** the validate suite → PASS.

- [ ] **Step 5: Commit** `feat(interview): enforce configurable pedigree boundary rules and record framing choice`.

---

## Task 10: Architect config UI

**Files:**

- Create: `apps/architect-web/src/components/sections/FamilyPedigree/{FramingConfig,IntroScreen,BoundaryOptions}.tsx`
- Modify: `apps/architect-web/src/components/sections/FamilyPedigree/{NodeConfiguration,EdgeConfiguration}.tsx` (bind `biologicalSexVariable`/`gameteRoleVariable`)
- Modify: `apps/architect-web/src/components/StageEditor/Interfaces.tsx` (register the three sections for FamilyPedigree)
- Test: section render/interaction tests following the existing `sections/FamilyPedigree/__tests__` patterns.

**Interfaces:**

- Consumes: `FRAMING_AUTHOR_LABELS`, the schema shapes; redux-form `"edit-stage"`.

- [ ] **Step 1: Write the failing test** — `FramingConfig` renders a fixed/participant-choice radio and a Gamete-based/Gendered select shown only for fixed; `BoundaryOptions` renders two Required/Recommended/Off selects; `IntroScreen` renders title/text/video-asset fields. Assert each writes the right redux-form path.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — build the three sections following `sections/Narrative/NarrativeBehaviours.tsx` (toggles/selects) and the existing asset-picker control for the video. Register them in `INTERFACE_CONFIGS` for `FamilyPedigree`. Add `biologicalSexVariable`/`gameteRoleVariable` variable bindings to Node/Edge configuration. Provide new-stage defaults: `framing: { mode: 'fixed', value: 'gamete' }`, both boundaries `'off'`, no `introScreen`.

- [ ] **Step 4: Run** the architect section tests → PASS.

- [ ] **Step 5: Commit** `feat(architect): add FamilyPedigree framing, intro, boundary, and sex/gamete config UI`.

---

## Task 11: Integration story + full verification

**Files:**

- Create/modify: `FamilyPedigree.framing.stories.tsx` covering gamete vs gendered quick-start, participant-choice flow, and a boundary set to `required` showing the completion block.

- [ ] **Step 1** Write the Storybook play stories described in spec §7 Testing.
- [ ] **Step 2** Run `pnpm --filter @codaco/interview test --project units` and the storybook tests locally for these stories only.
- [ ] **Step 3** Run `pnpm typecheck`, `pnpm lint:fix`, `pnpm knip` at the root; fix issues at the source (no ignore rules, no `any`).
- [ ] **Step 4: Commit** `test(interview): integration stories for configurable family pedigree`.

---

## Self-Review notes (author)

- **Spec coverage:** framing (T1,3,5), umbrella names (T1,10), intro (T6,10), participant choice (T6,9), boundaries (T9,10), gameteRole-on-network (T7), biological-sex capture (T8), architect (T10) — all mapped.
- **Type consistency:** `framing` is `FramingId | null` in the store; `setFraming` takes `FramingId`; `geneticParentIds` returns `string[]`; `gameteRoleVariable`/`biologicalSexVariable` are `entityAttributeReference` strings on `VariableConfig`.
- **Ordering:** Tasks 7–8 (data-model) are independent of 3–6 (framing) and can be done in parallel; 9 depends on 8 (no-children flag) and 2 (schema). 10 depends on 2.
