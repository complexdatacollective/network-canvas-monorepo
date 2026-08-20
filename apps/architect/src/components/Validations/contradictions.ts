import {
  findValidationContradictions,
  VARIABLE_REFERENCE_VALIDATIONS,
  type ValidationContradiction,
} from '@codaco/protocol-validation';
import { getTypeForComponent } from '~/config/variables';
import type { WriterClass } from '~/selectors/roleFilters';

import { ruleMapPrecheck } from './ruleValue';

type UnknownRecord = Record<string, unknown>;

const DRAFT_VARIABLE_ID_BASE = '__draft-variable__';

/**
 * A placeholder id for the variable being CREATED, guaranteed absent from
 * `allVariables`. Twelfth-wave Finding 2: the base literal is itself a
 * schema-valid variable id, so an imported protocol may genuinely contain a
 * variable under it — injecting the draft at a fixed literal would overwrite
 * that real variable, collapsing the draft's rules against it into
 * self-references and letting genuine contradictions past the dialog guard
 * (they would then surface only at protocol validation).
 */
export const draftVariableId = (allVariables: UnknownRecord): string => {
  let candidate = DRAFT_VARIABLE_ID_BASE;
  let suffix = 1;
  while (Object.hasOwn(allVariables, candidate)) {
    suffix += 1;
    candidate = `${DRAFT_VARIABLE_ID_BASE}${suffix}`;
  }
  return candidate;
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const draftVariableBase = (
  existing: unknown,
  variableType: string,
  draftVariableName: unknown,
): UnknownRecord =>
  isRecord(existing)
    ? existing
    : {
        name:
          typeof draftVariableName === 'string' && draftVariableName.trim()
            ? draftVariableName
            : 'this attribute',
        type: variableType,
      };

export type ProspectiveDraft = {
  /** Every variable of the owning entity, keyed by id, from the codebook. */
  allVariables: UnknownRecord;
  /** Codebook id of the variable being edited; '' while creating a new one. */
  currentVariableId: string;
  variableType: string;
  /** The rule map as it would be committed. */
  validation: UnknownRecord;
  /**
   * Draft input control (e.g. switching a datetime variable from
   * RelativeDatePicker to DatePicker), from form state. Without this, the
   * prospective variable would keep the EXISTING committed component even
   * though `parameters` reflects the draft — e.g. the analyser would still
   * treat a draft's absolute min/max window as a RelativeDatePicker's (which
   * contributes no static bounds) and silently miss a new contradiction.
   */
  component?: unknown;
  /** Draft options for ordinal/categorical variables, from form state. */
  options?: unknown;
  /** Draft component parameters (e.g. DatePicker min/max), from form state. */
  parameters?: unknown;
  draftVariableName?: unknown;
  /**
   * Threaded straight through to `findValidationContradictions`'
   * `stageEffectiveComponents` option (see @codaco/protocol-validation's
   * `booleanDomain`): vouches that every variable's `component` in
   * `allVariables` is its RESOLVED stage-effective rendering, not a
   * codebook default a NetworkComposer field elsewhere is still free to
   * override (e.g. to `Toggle`, which ignores `options` and always offers
   * both values). Only then may an explicit `component: 'Boolean'` read its
   * `options` as a pinned domain for the singleton-domain `differentFrom`
   * check. Only a caller holding a stage-scoped overlay (the composer field
   * editor's `buildComposerFieldOverlay`) can make that guarantee; a plain
   * codebook dialog has no stage in scope and must leave this at its
   * default `false`, matching protocol-validation's own record-level check
   * and the v7→v8 migration.
   */
  stageEffectiveComponents?: boolean;
};

export const buildProspectiveVariables = ({
  allVariables,
  currentVariableId,
  variableType,
  validation,
  component,
  options,
  parameters,
  draftVariableName,
}: ProspectiveDraft): UnknownRecord => {
  const id = currentVariableId || draftVariableId(allVariables);
  const base = draftVariableBase(
    allVariables[id],
    variableType,
    draftVariableName,
  );
  return {
    ...allVariables,
    [id]: {
      ...base,
      type: variableType,
      validation,
      ...(component !== undefined ? { component } : {}),
      ...(options !== undefined ? { options } : {}),
      ...(parameters !== undefined ? { parameters } : {}),
    },
  };
};

/**
 * `class` + sorted `variableIds` + sorted `variableId:rule` strips: stable
 * across which analyser run produced a contradiction, and never depends on
 * variable NAMES (the draft placeholder invents one for a brand new
 * variable). Mirrors schema.ts's `validateComposerFieldContradictions`
 * `keyOf`, used there for the identical purpose — telling a contradiction
 * present in one run apart from an identically-shaped one in another.
 */
const contradictionKey = (contradiction: ValidationContradiction): string =>
  [
    contradiction.class,
    [...contradiction.variableIds].toSorted().join(','),
    contradiction.strips
      .map((strip) => `${strip.variableId}:${strip.rule}`)
      .toSorted()
      .join(','),
  ].join('|');

/**
 * Per-`allVariables`-reference cache of the DRAFT-FREE analyser run, keyed
 * further by `stageEffectiveComponents` (the only other input that changes
 * its result — see `findDraftContradictions` for why the baseline always
 * matches the WITH-draft run's own flag rather than a fixed default).
 * `allVariables` stays the same object reference for as long as a
 * field-editor dialog is open — react-redux/reselect only hand the caller a
 * new one once the underlying codebook actually changes, which the dialog's
 * own local draft never does — so this turns what would otherwise be a
 * second full analyser pass on every keystroke (`findDraftContradictions`
 * runs once for the row-level check and once more in the form-level
 * validate, both re-invoked on every value change) into one pass per dialog
 * session. A WeakMap needs no explicit invalidation: once the dialog closes
 * and its `allVariables` snapshot is no longer referenced anywhere, the
 * cache entry is collected with it.
 */
const baselineCache = new WeakMap<
  UnknownRecord,
  Map<boolean, ValidationContradiction[]>
>();

const getBaselineContradictions = (
  allVariables: UnknownRecord,
  stageEffectiveComponents: boolean,
): ValidationContradiction[] => {
  let byFlag = baselineCache.get(allVariables);
  if (!byFlag) {
    byFlag = new Map();
    baselineCache.set(allVariables, byFlag);
  }
  let contradictions = byFlag.get(stageEffectiveComponents);
  if (!contradictions) {
    contradictions = findValidationContradictions(allVariables, {
      stageEffectiveComponents,
    });
    byFlag.set(stageEffectiveComponents, contradictions);
  }
  return contradictions;
};

/**
 * Contradictions a draft would introduce: every contradiction the WITH-draft
 * analyser run reports where EITHER the edited variable is directly named in
 * `variableIds` (the original membership check) OR the contradiction's
 * identity (`contradictionKey`) is absent from a WITHOUT-draft baseline run
 * over the same `allVariables`.
 *
 * Twenty-seventh-wave Finding 2: a draft can make a contradiction infeasible
 * between TWO OTHER variables it never appears in itself. E.g. required A
 * declares `A.sameAs = B`; B declares `B.lessThanVariable = C`; required C
 * has `maxValue: 10`. Widening A's `minValue` to 10 propagates that bound
 * into B's range through the sameAs equality group, and B's OWN comparator
 * to C then becomes unsatisfiable against C's committed `maxValue`. The
 * analyser correctly reports that as a `disjointBounds` contradiction
 * between B and C — the two ends of the broken comparator — since A
 * contributed the bound but is not one of its `variableIds`. A PURE
 * membership filter on the edited variable's id therefore let the dialog
 * save an edit that protocol-level validation then rejected. Diffing the
 * WITH-draft run against a WITHOUT-draft baseline catches this: B/C's
 * contradiction is absent from the baseline (A's old, looser bound left
 * B < C satisfiable) and so reports as caused by the draft, regardless of
 * which variables it names.
 *
 * The baseline is NOT pure diffing alone, though — it runs WITH the exact
 * same `stageEffectiveComponents` reading as the WITH-draft run, and the
 * result is the UNION with the original membership check, not a
 * replacement for it. Both choices exist to avoid a false positive the
 * naive "always record-level baseline, diff only" version produces: a
 * stage-scoped overlay caller (`makeFieldEditorValidate`'s `overlay`
 * argument) can pass `stageEffectiveComponents: true` on EVERY validate
 * call regardless of which field is being edited, and `allVariables` (the
 * whole subject's codebook) can hold a contradiction between two OTHER,
 * completely unrelated variables that is only provable in that stage-scoped
 * mode (e.g. two Boolean singletons the CURRENT stage's sibling fields both
 * still render as `Boolean`). Diffing that pair against a record-level
 * (`false`) baseline would report it as "new" on every keystroke of an
 * unrelated field's dialog, since record-level mode can never see it either
 * way. Matching the baseline's flag to the WITH-draft run's keeps such an
 * unrelated, already-latent pair OUT of the diff (it is identically present
 * in both runs), while the ORIGINAL membership check still catches it on
 * the rare occasion the edited variable IS one of that pair (see the
 * `stage-effective boolean domains` tests) — matching this function's
 * pre-existing, still-correct behaviour for that case.
 *
 * `draft.allVariables` IS already the correct baseline in both draft shapes
 * `buildProspectiveVariables` handles: editing an EXISTING variable leaves
 * its COMMITTED definition in place there (the draft only replaces it in
 * the WITH-draft copy `buildProspectiveVariables` returns), and a NEW
 * variable is simply absent from it altogether — no separate baseline
 * construction is needed.
 */
export const findDraftContradictions = (
  draft: ProspectiveDraft,
): ValidationContradiction[] => {
  const id = draft.currentVariableId || draftVariableId(draft.allVariables);
  const stageEffectiveComponents = draft.stageEffectiveComponents ?? false;
  const withDraft = findValidationContradictions(
    buildProspectiveVariables(draft),
    { stageEffectiveComponents },
  );
  const baselineKeys = new Set(
    getBaselineContradictions(draft.allVariables, stageEffectiveComponents).map(
      contradictionKey,
    ),
  );
  return withDraft.filter(
    (contradiction) =>
      contradiction.variableIds.includes(id) ||
      !baselineKeys.has(contradictionKey(contradiction)),
  );
};

/**
 * Path-compressing union-find over variable ids, used only to decide which
 * candidates in `findLegalReferenceTargets` are reference-connected to each
 * other — never fed to the analyser itself.
 */
class UnionFind {
  private readonly parent = new Map<string, string>();

  find(id: string): string {
    if (!this.parent.has(id)) {
      this.parent.set(id, id);
      return id;
    }
    let root = id;
    while (true) {
      const next = this.parent.get(root);
      if (next === undefined || next === root) break;
      root = next;
    }
    let current = id;
    while (current !== root) {
      const next = this.parent.get(current);
      if (next === undefined) break;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      this.parent.set(rootA, rootB);
    }
  }
}

const referenceTargetOf = (
  entry: unknown,
  rule: string,
): string | undefined => {
  if (!isRecord(entry)) return undefined;
  const entryValidation = entry.validation;
  if (!isRecord(entryValidation)) return undefined;
  const target = entryValidation[rule];
  return typeof target === 'string' ? target : undefined;
};

export type ReferenceTargetLegalityInput = {
  allVariables: UnknownRecord;
  currentVariableId: string;
  variableType: string;
  /** The row's own COMMITTED rule map (before the candidate under test is applied). */
  validation: UnknownRecord;
  /** The reference-type rule being edited (e.g. `sameAs`). */
  ruleKey: string;
  /** Candidate target ids to evaluate — typically every id in `existingVariables`. */
  candidateIds: string[];
  component?: unknown;
  options?: unknown;
  parameters?: unknown;
  draftVariableName?: unknown;
  /**
   * See `ProspectiveDraft.stageEffectiveComponents` — threaded through
   * unchanged to every `findValidationContradictions` call this makes.
   * `Validations.tsx` is the only caller today, and it only ever backs the
   * plain codebook `ValidationSection` (never a stage-scoped overlay), so it
   * leaves this at its default `false`; a future stage-scoped
   * reference-target picker would need to pass `true` to stay consistent
   * with the validate path it feeds.
   */
  stageEffectiveComponents?: boolean;
};

/**
 * Twenty-third-wave Finding 3: `referenceTargetOptions` (Validation.tsx) used
 * to call `findDraftContradictions` once per candidate target, and each call
 * re-ran the analyser over the WHOLE variable record — quadratic in variable
 * count (1,000 simple variables took ~4.7s, 2,000 took ~19s). Every one of the
 * analyser's passes (bound propagation, equality groups, cycle detection)
 * only ever discovers a relationship along an EXPLICIT reference edge
 * (`sameAs`/`differentFrom`/the four comparators), so a variable outside the
 * edited variable's reference-connected component can never affect its
 * contradiction status. Candidates in components disjoint from both the
 * edited variable's component AND each other are therefore provably
 * independent and can be tested together in ONE shared analyser call, each
 * against its own disposable clone of the edited variable (no other variable
 * ever references a clone's synthetic id, and a clone only ever references
 * its own candidate — see the "isolated" candidates in the tests below).
 * Candidates that already share the edited variable's component (e.g. a
 * third variable whose OWN rule already targets it — the strict-cycle case
 * covered in Validations.behaviour.test.tsx) keep a one-call-per-candidate
 * path, pruned to just the relevant component so it stays cheap.
 *
 * Twenty-eighth-wave finding: the batched clone's own synthetic id is a
 * poor stand-in for the edited variable whenever some OTHER, already-fixed
 * variable references it — that third party's edge would need to resolve
 * against every candidate's clone simultaneously, which one shared literal
 * id cannot do (see `editedVariableHasExternalReferences` below). Batching
 * is therefore only offered while the edited variable's OWN pre-existing
 * component is just itself; the moment it already has a fixed neighbour,
 * every candidate — not only the ones that would introduce a NEW shared
 * component — is routed through the individual, fully-pruned path so that
 * neighbour's constraint is never silently dropped.
 *
 * Thirtieth-wave Finding 2: a candidate's legality used to be decided by
 * whether ITS OWN id (or, in the batched path, its disposable clone id) was
 * among a contradiction's `variableIds` — the same membership-only mistake
 * `findDraftContradictions` (twenty-seventh-wave Finding 2) and
 * `validateComposerFieldContradictions` (thirtieth-wave Finding 1) made and
 * fixed the same way. A draft's OTHER, already-committed rule can propagate
 * through the chosen candidate into a completely different pair: editing
 * `A` with a draft `minValue: 10`, testing candidate `B` for `A.sameAs`,
 * where `B.lessThanVariable = C` and `C`'s `maxValue` is `10` — choosing `B`
 * makes B's OWN comparator against C infeasible, reported with
 * `variableIds: [B, C]`. Neither `B` nor a batched clone of `A` is named,
 * so the membership check waved the candidate through; Architect then
 * offered a target whose selection immediately produced an unsavable
 * inline error.
 *
 * Legality is now a set-difference, computed once for every candidate of
 * this call: a BASELINE analyser run over `graph` (the edited variable's
 * row exactly as committed/drafted, with the rule under test absent — the
 * question is "does ADDING this reference introduce a contradiction", so
 * the baseline must already carry every OTHER draft change) against each
 * candidate's WITH-candidate run. A contradiction is candidate-caused, and
 * makes that candidate illegal, when its `contradictionKey` is absent from
 * the baseline — regardless of whether the candidate's id, its clone, or
 * neither appears in `variableIds`. The baseline intentionally differs from
 * `findDraftContradictions`'s (which diffs against the fully UNDRAFTED
 * record): a contradiction the OTHER draft edits alone already cause,
 * independent of which target this rule picks, must not disqualify every
 * candidate in the picker, so it stays baselined in rather than diffed out.
 * The baseline record — and therefore its analyser run — does not depend on
 * the candidate at all, so it is computed exactly once per invocation, not
 * once per candidate; both the batched and individual loops below diff
 * against the same `baselineContradictionKeys`. In the batched run, a new
 * contradiction is attributed to whichever candidate's pre-existing
 * component (or clone id) it names — always exactly one, since batched
 * candidates' components are pairwise disjoint from each other and from
 * `id`'s own by construction (see `usedRoots` and
 * `editedVariableHasExternalReferences` above).
 */
export const findLegalReferenceTargets = ({
  allVariables,
  currentVariableId,
  variableType,
  validation,
  ruleKey,
  candidateIds,
  component,
  options,
  parameters,
  draftVariableName,
  stageEffectiveComponents = false,
}: ReferenceTargetLegalityInput): Set<string> => {
  const id = currentVariableId || draftVariableId(allVariables);

  const baseline: UnknownRecord = { ...validation };
  delete baseline[ruleKey];

  const draftEntry = (draftValidation: UnknownRecord): UnknownRecord => {
    const base = draftVariableBase(
      allVariables[id],
      variableType,
      draftVariableName,
    );
    return {
      ...base,
      type: variableType,
      validation: draftValidation,
      ...(component !== undefined ? { component } : {}),
      ...(options !== undefined ? { options } : {}),
      ...(parameters !== undefined ? { parameters } : {}),
    };
  };

  // The graph used only to decide, per candidate, whether it is safe to
  // share a batched analyser call — never itself fed to the analyser. `id`
  // carries the baseline (no edge for the rule under test yet), so a third
  // party's FIXED edge into `id` (e.g. `a.lessThanVariable = id`) is already
  // visible here, before any candidate has been chosen.
  const graph: UnknownRecord = { ...allVariables, [id]: draftEntry(baseline) };
  const unionFind = new UnionFind();
  for (const sourceId of Object.keys(graph)) {
    for (const rule of VARIABLE_REFERENCE_VALIDATIONS) {
      const target = referenceTargetOf(graph[sourceId], rule);
      if (target !== undefined && target in graph) {
        unionFind.union(sourceId, target);
      }
    }
  }

  const componentMembers = new Map<string, string[]>();
  for (const memberId of Object.keys(graph)) {
    const root = unionFind.find(memberId);
    const members = componentMembers.get(root);
    if (members) {
      members.push(memberId);
    } else {
      componentMembers.set(root, [memberId]);
    }
  }

  // The candidate-free baseline (Thirtieth-wave Finding 2 — see the function
  // comment): `graph` already carries `id`'s row exactly as committed/drafted
  // with the rule under test absent, so one analyser pass over it, run here
  // ONCE regardless of how many candidates follow, is every candidate's
  // "before" state to diff against.
  const baselineContradictionKeys = new Set(
    findValidationContradictions(graph, { stageEffectiveComponents }).map(
      contradictionKey,
    ),
  );

  const idRoot = unionFind.find(id);
  // Twenty-eighth-wave Finding: a batched clone (below) represents `id`
  // ONLY by its own baseline validation, keyed under a synthetic
  // `${id}::${candidateId}` id — it never carries any OTHER variable's
  // FIXED rule that targets `id` itself (e.g. a third variable `x` with
  // `x.lessThanVariable = id`). The batched record deletes `id`'s own
  // literal entry outright before adding those clones, so a third party's
  // edge into `id` resolves to nothing once that happens, silently
  // dropping `x`'s constraint from every batched candidate's judgement —
  // `x < id < candidate` can read as satisfiable even when it is not. The
  // individual path below has no such gap: it prunes to `id`'s FULL
  // pre-existing component (`componentMembers.get(idRoot)`) verbatim, so
  // `x` stays present and addressable under `id`'s own, unrenamed key.
  // Whenever `id` already has such a component (more than just itself),
  // every candidate that would otherwise share the batched clone is routed
  // through that correct, per-candidate path instead — batching stays
  // limited to the (typical) case where the edited variable carries no
  // OTHER fixed reference relationship yet, which is exactly when nothing
  // outside `id` needs to keep addressing it by its own literal id.
  const editedVariableHasExternalReferences =
    (componentMembers.get(idRoot) ?? [id]).length > 1;
  const usedRoots = new Set<string>();
  const batched: string[] = [];
  const individual: string[] = [];
  for (const candidateId of candidateIds) {
    const root =
      candidateId in graph ? unionFind.find(candidateId) : candidateId;
    // A candidate sharing the edited variable's component is already
    // reference-connected to it through some OTHER, fixed relationship — its
    // legality can depend on that wider component, so it needs its own call.
    // A candidate whose component another candidate already claimed for the
    // batch is routed the same way: attaching a second clone to that
    // component would let the two hypothetical choices interact with each
    // other, which never happens when `id` can only hold one candidate at a
    // time.
    if (
      root === idRoot ||
      usedRoots.has(root) ||
      editedVariableHasExternalReferences
    ) {
      individual.push(candidateId);
      continue;
    }
    usedRoots.add(root);
    batched.push(candidateId);
  }

  const legal = new Set<string>();

  if (batched.length > 0) {
    const batchRecord: UnknownRecord = { ...allVariables };
    if (currentVariableId) {
      delete batchRecord[currentVariableId];
    }
    const clones: { candidateId: string; cloneId: string; root: string }[] = [];
    for (const candidateId of batched) {
      let cloneId = `${id}::${candidateId}`;
      while (Object.hasOwn(batchRecord, cloneId)) {
        cloneId = `${cloneId}:`;
      }
      const candidateRoot =
        candidateId in graph ? unionFind.find(candidateId) : candidateId;
      clones.push({ candidateId, cloneId, root: candidateRoot });
      batchRecord[cloneId] = draftEntry({
        ...baseline,
        [ruleKey]: candidateId,
      });
    }
    const contradictions = findValidationContradictions(batchRecord, {
      stageEffectiveComponents,
    });
    // Contradictions absent from the candidate-free baseline are introduced
    // by ADDING one of this call's candidate rules — never by anything
    // already present without them — so every one of them is attributable
    // to exactly one candidate: batched candidates' pre-existing components
    // are pairwise disjoint from each other (`usedRoots`, above), and the
    // only new edge each clone adds runs from that clone into its own
    // candidate's component, never into another candidate's.
    const introducedContradictions = contradictions.filter(
      (contradiction) =>
        !baselineContradictionKeys.has(contradictionKey(contradiction)),
    );
    for (const { candidateId, cloneId, root } of clones) {
      const candidateScope = new Set(
        componentMembers.get(root) ?? [candidateId],
      );
      candidateScope.add(cloneId);
      const hasIntroducedContradiction = introducedContradictions.some(
        (contradiction) =>
          contradiction.variableIds.some((variableId) =>
            candidateScope.has(variableId),
          ),
      );
      if (!hasIntroducedContradiction) {
        legal.add(candidateId);
      }
    }
  }

  for (const candidateId of individual) {
    const candidateRoot =
      candidateId in graph ? unionFind.find(candidateId) : candidateId;
    const pruned: UnknownRecord = {};
    for (const memberId of componentMembers.get(idRoot) ?? [id]) {
      pruned[memberId] = graph[memberId];
    }
    if (candidateRoot !== idRoot) {
      for (const memberId of componentMembers.get(candidateRoot) ?? [
        candidateId,
      ]) {
        pruned[memberId] = graph[memberId] ?? allVariables[memberId];
      }
    }
    pruned[id] = draftEntry({ ...baseline, [ruleKey]: candidateId });
    const contradictions = findValidationContradictions(pruned, {
      stageEffectiveComponents,
    });
    // Every contradiction `pruned` can produce is already scoped to `id`'s
    // and this candidate's components, so — unlike the batched run above,
    // which shares one baseline across many disjoint candidates — anything
    // here absent from the baseline is this candidate's doing without
    // needing a separate attribution check.
    const hasIntroducedContradiction = contradictions.some(
      (contradiction) =>
        !baselineContradictionKeys.has(contradictionKey(contradiction)),
    );
    if (!hasIntroducedContradiction) {
      legal.add(candidateId);
    }
  }

  return legal;
};

/**
 * A stage-scoped override of a variable's rendering, keyed by variable id.
 * NetworkComposer stage fields carry their OWN `component`/`parameters`
 * independent of the codebook variable (see network-composer.ts's
 * ComposerFormFieldSchema), so a contradiction check scoped to one stage must
 * see how a variable actually renders there, not just its codebook
 * definition.
 *
 * The field currently being edited must contribute NO entry: its pre-draft
 * committed value must never shadow the live draft values
 * `buildProspectiveVariables` layers on afterwards. Eleventh-wave Finding 4:
 * that exclusion happens at CONSTRUCTION time, by the field's array index
 * (see composerHelpers.ts's `buildComposerFieldOverlay`) — the index
 * identifies the row even when an imported field has no `id`
 * (ComposerFormFieldSchema.id is optional) and survives the edit reassigning
 * the field to a different variable, both of which an id- or variable-keyed
 * exclusion here would miss.
 */
export type VariableOverlay = Record<
  string,
  { component?: unknown; parameters?: unknown }
>;

/**
 * One form's resolved rendering for a subject. Keeping views distinct is
 * essential: two stages can render the same codebook variable through
 * different controls, and a codebook edit must remain satisfiable in every
 * one of those participant-facing views.
 */
export type ResolvedFormValidationView = {
  renderedVariableIds: ReadonlySet<string>;
  overlay: VariableOverlay;
  /** The live draft row belongs to this form even before its array is saved. */
  includesEditedVariable?: boolean;
};

/**
 * `allVariables` with `overlay` layered on top. Only
 * `component`/`parameters` are overridden — everything else (`options`,
 * `validation`, `type`, ...) still comes from the codebook. An overlay entry
 * naming a variable absent from `allVariables` is ignored defensively.
 */
const withOverlay = (
  allVariables: UnknownRecord,
  overlay: VariableOverlay | undefined,
): UnknownRecord => {
  if (!overlay) return allVariables;
  const entries = Object.entries(overlay).filter(([id]) =>
    isRecord(allVariables[id]),
  );
  if (entries.length === 0) return allVariables;
  const overlaid = { ...allVariables };
  for (const [id, { component, parameters }] of entries) {
    const existing = allVariables[id];
    overlaid[id] = {
      ...(isRecord(existing) ? existing : {}),
      ...(component !== undefined ? { component } : {}),
      ...(parameters !== undefined ? { parameters } : {}),
    };
  }
  return overlaid;
};

const withoutUnknownRenderings = (
  variables: UnknownRecord,
  allRenderedVariableIds: ReadonlySet<string>,
  renderedVariableIds: ReadonlySet<string>,
): UnknownRecord => {
  const unknown = [...allRenderedVariableIds].filter(
    (id) => !renderedVariableIds.has(id) && Object.hasOwn(variables, id),
  );
  if (unknown.length === 0) return variables;
  const visible = { ...variables };
  for (const id of unknown) {
    delete visible[id];
  }
  return visible;
};

const findResolvedViewDraftContradictions = (
  draft: ProspectiveDraft,
  view: ResolvedFormValidationView,
  allRenderedVariableIds: ReadonlySet<string>,
  baselineKeys: ReadonlySet<string>,
  draftRenderingOwnership: 'codebook' | 'current-form',
): ValidationContradiction[] => {
  const id = draft.currentVariableId || draftVariableId(draft.allVariables);
  const resolvedDraft =
    draftRenderingOwnership === 'current-form'
      ? { ...draft, component: undefined, parameters: undefined }
      : draft;
  const withDraft = withOverlay(
    withoutUnknownRenderings(
      buildProspectiveVariables(resolvedDraft),
      allRenderedVariableIds,
      view.renderedVariableIds,
    ),
    view.overlay,
  );
  return findValidationContradictions(withDraft, {
    stageEffectiveComponents: true,
  }).filter(
    (contradiction) =>
      contradiction.variableIds.includes(id) ||
      !baselineKeys.has(contradictionKey(contradiction)),
  );
};

/** A variable's codebook display name, falling back to its id when absent. */
export const variableDisplayName = (
  variables: UnknownRecord,
  variableId: string,
): string => {
  const variable = variables[variableId];
  return isRecord(variable) && typeof variable.name === 'string'
    ? variable.name
    : variableId;
};

/**
 * Bound at save-time when an UNVALIDATED writer (bin/highlight/census/etc.)
 * picks a variable a form elsewhere already collects — the mirror of
 * `unvalidatedElsewhereMessage` below.
 */
export const validatedElsewhereMessage = (variableName: string): string =>
  `"${variableName}" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)`;

/**
 * Bound at save-time when a form field picks a variable a bin/highlight/
 * census/etc. elsewhere already writes without validation.
 */
export const unvalidatedElsewhereMessage = (variableName: string): string =>
  `"${variableName}" is written without validation by another stage, so it cannot be used as a form field`;

/**
 * The refusal a picker earns when the OPPOSITE writer class already claims
 * its pick, keyed by the picker's OWN class. Pairing the two messages with
 * `hasConflictingUse`'s direction here means a gate cannot show the mirror
 * message by picking the wrong one by hand.
 */
export const crossClassConflictMessage: Record<
  WriterClass,
  (variableName: string) => string
> = {
  unvalidated: validatedElsewhereMessage,
  validated: unvalidatedElsewhereMessage,
};

export const draftValidatedElsewhereMessage = (variableName: string): string =>
  `"${variableName}" is collected by this stage's form, so it cannot be assigned by this prompt (values assigned here would bypass its validation)`;

export const draftUnvalidatedElsewhereMessage = (
  variableName: string,
): string =>
  `"${variableName}" is assigned without validation by a prompt in this stage, so it cannot be used as a form field`;

/**
 * The save-time exclusivity gate shared by every writer surface (the form
 * dialog's `variable` field, and each unvalidated writer's `onBeforeSave`/
 * `handleChangePrompt`). `hasConflictingUse` reports whether the OPPOSITE
 * writer class (form validation vs. bin/highlight/etc.) already claims
 * `variableId` for this subject — callers pass the role-map-backed check that
 * matches their own class. Escapes when `variableId` equals
 * `originalVariableId`, the field's PRE-EDIT committed value: re-saving an
 * unchanged pick must never be blocked by a conflict this edit did not
 * introduce (e.g. one arising from a stale draft, or a pre-existing conflict
 * in an imported protocol).
 */
export const crossClassPickIssue = ({
  variableId,
  originalVariableId,
  hasConflictingUse,
  allVariables,
  message,
}: {
  variableId: string;
  originalVariableId: string;
  hasConflictingUse: (variableId: string) => boolean;
  allVariables: UnknownRecord;
  message: (variableName: string) => string;
}): string | undefined => {
  if (!variableId || variableId === originalVariableId) return undefined;
  if (!hasConflictingUse(variableId)) return undefined;
  return message(variableDisplayName(allVariables, variableId));
};

/**
 * Form-level validate for the field-editor dialog. Errors are keyed at
 * `validation` so they surface through the Validations field's FieldErrors on
 * a failed save and anchor to getFieldId('validation') for scroll-to-error.
 *
 * `overlay` is optional so this factory stays generic: callers that have no
 * stage-scoped sibling data (or that check codebook-level variables, not
 * NetworkComposer stage fields) simply omit it and get the previous,
 * codebook-only behaviour. The overlay must already EXCLUDE the field being
 * edited — its pre-draft committed value would otherwise shadow the live
 * draft — which composer callers achieve at construction time by the field's
 * array index (eleventh-wave Finding 4; see `buildComposerFieldOverlay`).
 *
 * `crossFormRendered` (thirty-fifth-wave finding) names the subject's
 * variables some OTHER NetworkComposer form renders with its own control
 * (see composerHelpers.ts's `crossFormRenderedVariables`). This validator's
 * view is per-form, so — mirroring schema.ts's `unknownRenderingFor` — a
 * variable in that set whose rendering the CURRENT form does not determine
 * (no sibling overlay entry, and not the variable being edited) is dropped
 * from the checked set entirely rather than being read through its unused
 * codebook default: two codebook-full datetimes joined by `sameAs`, each
 * rendered as a year picker by a different composer stage, otherwise
 * falsely report a mixed-resolution contradiction from BOTH stages'
 * editors even though both runtime controls store years. Dropping the
 * variable makes references to it unusable and leaves the pair unjudged —
 * the same deliberate missed-detection-over-false-block trade the schema
 * documents. Only stage-scoped (`overlay`-passing) callers supply it; a
 * plain codebook dialog makes no rendering claim and omits it.
 *
 * `hasUnvalidatedUse`, when supplied, backs the save-time cross-class gate:
 * a draft picking a variable some bin/highlight/census/etc. elsewhere already
 * writes is rejected at the `variable` field, mirroring the exclusion the
 * picker already applies (this is the second-layer backstop for a stale
 * draft that bypassed it). Redux-form passes the decorated component's props
 * as this validate's second argument (see InlineEditScreen/Form's
 * WrappedFormProps); `props.initialValues` is the row's PRE-EDIT committed
 * values, read here to implement `crossClassPickIssue`'s unchanged-pick
 * escape. A string result is already a draft-specific conflict message but
 * keeps that same unchanged-pick escape.
 *
 * `resolvedViews` contains the current shared form and every NetworkComposer
 * form that renders this subject. Each view is analysed independently after
 * the draft's codebook properties are installed and before that view's
 * component/parameters are layered last. That precedence matches the runtime:
 * draft validation/options remain codebook-owned, while a stage field's
 * rendering overrides a draft codebook component. Each view is compared with
 * an identically scoped committed baseline, preserving the existing
 * new-contradiction gate.
 *
 * `resolvedViewDraftRendering` distinguishes the two editor ownership models.
 * Ordinary form dialogs edit the codebook rendering itself, so their draft
 * component/parameters remain effective in shared views. NetworkComposer
 * dialogs edit only the current field's rendering: resolved views begin from
 * the committed codebook rendering, then each other composer overlay wins in
 * its own view.
 */
export const makeFieldEditorValidate = (
  allVariables: UnknownRecord,
  overlay?: VariableOverlay,
  crossFormRendered?: ReadonlySet<string>,
  hasUnvalidatedUse?: (variableId: string) => boolean | string,
  resolvedViews: readonly ResolvedFormValidationView[] = [],
  resolvedViewDraftRendering: 'codebook' | 'current-form' = 'codebook',
) => {
  // Computed once per dialog session, not on every keystroke: `allVariables`
  // and `overlay` are fixed for the returned validator's whole lifetime, so
  // recomputing `withOverlay` on every call (as before) only ever produced
  // an equal-but-freshly-spread object. Hoisting it here gives
  // `overlaidVariables` a STABLE identity across repeated validate calls,
  // which is what lets `findDraftContradictions`'s baseline cache (keyed by
  // that same reference — see `getBaselineContradictions`) actually hit
  // instead of missing on every keystroke.
  const overlaidVariables = withOverlay(allVariables, overlay);
  // Cross-form-rendered variables the current form's committed siblings do
  // NOT write. Only the per-call check against the edited variable itself
  // remains: the draft may reassign the row to (or away from) one of these
  // ids mid-session, so that last exclusion cannot be settled here.
  const unknownRenderingCandidates = [...(crossFormRendered ?? [])].filter(
    (id) =>
      !(overlay !== undefined && Object.hasOwn(overlay, id)) &&
      Object.hasOwn(overlaidVariables, id),
  );
  const resolvedViewIncludesEditedVariable = resolvedViews.some(
    (view) => view.includesEditedVariable === true,
  );
  const resolvedRenderedVariableIds = new Set<string>();
  for (const view of resolvedViews) {
    for (const id of Object.keys(view.overlay)) {
      resolvedRenderedVariableIds.add(id);
    }
  }
  for (const id of Object.keys(overlay ?? {})) {
    resolvedRenderedVariableIds.add(id);
  }
  const resolvedBaselineKeys = resolvedViews.map(
    () => new Map<string, Set<string>>(),
  );
  return (
    values: Record<string, unknown>,
    props?: { initialValues?: unknown },
  ): Record<string, unknown> => {
    // A variable that is only a TARGET of another's sameAs/comparator (never
    // configuring rules of its own) can have `values.validation` absent or
    // non-record here — that must not skip the check, since editing this
    // variable's own options/parameters can still break an incoming
    // relationship. `findDraftContradictions` reports contradictions the
    // draft causes regardless of whether the edited variable is directly
    // named in one, so an empty validation map is safe to proceed with.
    const validation = isRecord(values.validation) ? values.validation : {};
    // Nineteenth-wave Finding 2: creating a variable writes the typed
    // DISPLAY NAME into `variable` as well as `_createNewVariable` (see
    // withFieldsHandlers' `handleNewVariable`), so a non-empty
    // `values.variable` is not necessarily a committed codebook id. Reading
    // it as one bypassed `buildProspectiveVariables`'s collision-free
    // sentinel: a typed name matching a real codebook id injected the draft
    // OVER that variable, so the draft's rules against it read as
    // self-references (a `sameAs` to oneself is vacuously satisfiable and
    // reports nothing) — then creation assigned a fresh uuid and left a
    // genuinely contradictory pair for protocol validation to reject.
    // Truthiness, not mere presence: `handleChangeVariable` resets the flag
    // to `null` when an existing variable is picked, and both commit
    // handlers (`withFormHandlers`/`withComposerFormHandlers`) branch on
    // `if (!_createNewVariable)`, so a blank flag commits as an EXISTING
    // variable and must be read as one here too.
    const isCreatingVariable =
      typeof values._createNewVariable === 'string' &&
      values._createNewVariable !== '';
    const currentVariableId =
      !isCreatingVariable && typeof values.variable === 'string'
        ? values.variable
        : '';
    const existing = currentVariableId
      ? overlaidVariables[currentVariableId]
      : undefined;
    const existingType = isRecord(existing) ? existing.type : undefined;
    const component =
      typeof values.component === 'string' ? values.component : '';
    const variableType =
      typeof existingType === 'string'
        ? existingType
        : (getTypeForComponent(component) ?? '');
    if (!variableType) return {};
    // A rule switched on but never answered carries `null` (see
    // `Validations.tsx`'s `handleToggle`). It has to be reported — dropping it
    // silently is the bug this gate exists to prevent — and it has to be kept
    // away from the analyser, which would read the `null` as a bound. The
    // `validation` field's own validator (`ruleMapIssue`) runs the same steps,
    // by calling this same function — it is one implementation, not two that
    // agree.
    const { issue: precheckIssue, complete: completeValidation } =
      ruleMapPrecheck(validation);
    if (precheckIssue) return { validation: precheckIssue };
    // The edited variable's rendering IS determined by this form (the draft's
    // own component/parameters, layered on by `buildProspectiveVariables`),
    // so it always stays visible; every other cross-form-rendered variable is
    // dropped — post-save, this form makes no claim about how it renders.
    const unknownRendering = unknownRenderingCandidates.filter(
      (id) => id !== currentVariableId,
    );
    let visibleVariables = overlaidVariables;
    if (unknownRendering.length > 0) {
      const filtered = { ...overlaidVariables };
      for (const id of unknownRendering) {
        delete filtered[id];
      }
      visibleVariables = filtered;
    }
    const first = findDraftContradictions({
      allVariables: visibleVariables,
      currentVariableId,
      variableType,
      validation: completeValidation,
      component: values.component,
      options: values.options,
      parameters: values.parameters,
      draftVariableName: values._createNewVariable,
      // An `overlay` is only ever built from a stage's OWN composer fields
      // (`buildComposerFieldOverlay`), so its presence IS the
      // stage-effective signal: every variable it names carries that
      // field's own RESOLVED component, and this dialog's own draft
      // component (above) is the edited field's resolved component too.
      // An overlay-less caller's first pass stays at the record level; its
      // shared-form and composer stage-effective views run independently
      // below through `resolvedViews`.
      stageEffectiveComponents: overlay !== undefined,
    })[0];
    if (first) return { validation: first.message };
    if (resolvedViews.length > 0) {
      const allResolvedRenderedVariableIds = new Set(
        resolvedRenderedVariableIds,
      );
      if (overlay !== undefined || resolvedViewIncludesEditedVariable) {
        allResolvedRenderedVariableIds.add(
          currentVariableId || draftVariableId(allVariables),
        );
      }
      const draft = {
        allVariables,
        currentVariableId,
        variableType,
        validation: completeValidation,
        component: values.component,
        options: values.options,
        parameters: values.parameters,
        draftVariableName: values._createNewVariable,
      };
      const resolvedBaselineKey =
        overlay !== undefined || resolvedViewIncludesEditedVariable
          ? currentVariableId || draftVariableId(allVariables)
          : '';
      for (const [viewIndex, view] of resolvedViews.entries()) {
        const renderedVariableIds = view.includesEditedVariable
          ? new Set([
              ...view.renderedVariableIds,
              currentVariableId || draftVariableId(allVariables),
            ])
          : view.renderedVariableIds;
        const resolvedView = { ...view, renderedVariableIds };
        const byEditedVariable = resolvedBaselineKeys[viewIndex];
        if (!byEditedVariable) continue;
        let baselineKeys = byEditedVariable.get(resolvedBaselineKey);
        if (!baselineKeys) {
          const baseline = withOverlay(
            withoutUnknownRenderings(
              allVariables,
              allResolvedRenderedVariableIds,
              resolvedView.renderedVariableIds,
            ),
            resolvedView.overlay,
          );
          baselineKeys = new Set(
            findValidationContradictions(baseline, {
              stageEffectiveComponents: true,
            }).map(contradictionKey),
          );
          byEditedVariable.set(resolvedBaselineKey, baselineKeys);
        }
        const contradiction = findResolvedViewDraftContradictions(
          draft,
          resolvedView,
          allResolvedRenderedVariableIds,
          baselineKeys,
          resolvedViewDraftRendering,
        )[0];
        if (contradiction) {
          return { validation: contradiction.message };
        }
      }
    }
    if (hasUnvalidatedUse) {
      const initialValues = isRecord(props?.initialValues)
        ? props.initialValues
        : undefined;
      const originalVariableId =
        typeof initialValues?.variable === 'string'
          ? initialValues.variable
          : '';
      const conflictingUse = hasUnvalidatedUse(currentVariableId);
      if (
        typeof conflictingUse === 'string' &&
        currentVariableId !== originalVariableId
      ) {
        return { variable: conflictingUse };
      }
      const issue = crossClassPickIssue({
        variableId: currentVariableId,
        originalVariableId,
        hasConflictingUse: () =>
          typeof conflictingUse === 'boolean' && conflictingUse,
        allVariables: overlaidVariables,
        message: unvalidatedElsewhereMessage,
      });
      if (issue) return { variable: issue };
    }
    return {};
  };
};
