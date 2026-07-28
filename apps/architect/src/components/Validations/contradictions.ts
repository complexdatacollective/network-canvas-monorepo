import {
  findValidationContradictions,
  VARIABLE_REFERENCE_VALIDATIONS,
  type ValidationContradiction,
} from '@codaco/protocol-validation';
import { getTypeForComponent } from '~/config/variables';

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
};

export const buildProspectiveVariables = ({
  allVariables,
  currentVariableId,
  variableType,
  validation,
  component,
  options,
  parameters,
}: ProspectiveDraft): UnknownRecord => {
  const id = currentVariableId || draftVariableId(allVariables);
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
      ...(component !== undefined ? { component } : {}),
      ...(options !== undefined ? { options } : {}),
      ...(parameters !== undefined ? { parameters } : {}),
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
  // Same `allVariables` as `buildProspectiveVariables` receives below, so both
  // derive an identical id for this draft.
  const id = draft.currentVariableId || draftVariableId(draft.allVariables);
  return findValidationContradictions(buildProspectiveVariables(draft)).filter(
    (contradiction) => contradiction.variableIds.includes(id),
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
  /** The row's PRE-draft key, when its type is mid-change. */
  replacingKey?: string;
  /** Candidate target ids to evaluate — typically every id in `existingVariables`. */
  candidateIds: string[];
  component?: unknown;
  options?: unknown;
  parameters?: unknown;
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
 */
export const findLegalReferenceTargets = ({
  allVariables,
  currentVariableId,
  variableType,
  validation,
  ruleKey,
  replacingKey,
  candidateIds,
  component,
  options,
  parameters,
}: ReferenceTargetLegalityInput): Set<string> => {
  const id = currentVariableId || draftVariableId(allVariables);

  const baseline: UnknownRecord = { ...validation };
  if (replacingKey && replacingKey !== ruleKey) {
    delete baseline[replacingKey];
  }
  delete baseline[ruleKey];

  const draftEntry = (draftValidation: UnknownRecord): UnknownRecord => {
    const existing = allVariables[id];
    const base = isRecord(existing)
      ? existing
      : { name: 'this variable', type: variableType };
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

  const idRoot = unionFind.find(id);
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
    if (root === idRoot || usedRoots.has(root)) {
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
    const clones: { candidateId: string; cloneId: string }[] = [];
    for (const candidateId of batched) {
      let cloneId = `${id}::${candidateId}`;
      while (Object.hasOwn(batchRecord, cloneId)) {
        cloneId = `${cloneId}:`;
      }
      clones.push({ candidateId, cloneId });
      batchRecord[cloneId] = draftEntry({
        ...baseline,
        [ruleKey]: candidateId,
      });
    }
    const contradictions = findValidationContradictions(batchRecord);
    for (const { candidateId, cloneId } of clones) {
      const hasContradiction = contradictions.some((contradiction) =>
        contradiction.variableIds.includes(cloneId),
      );
      if (!hasContradiction) {
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
    const contradictions = findValidationContradictions(pruned);
    const hasContradiction = contradictions.some((contradiction) =>
      contradiction.variableIds.includes(id),
    );
    if (!hasContradiction) {
      legal.add(candidateId);
    }
  }

  return legal;
};

// R1 (schema shape) rejects a rule value below these floors with a generic
// Zod message. Gating them here — ahead of the schema — lets the row editor
// disable the save and explain why, instead of surfacing that generic message
// only after a failed protocol save.
const RULE_FLOORS: Record<string, number> = {
  minLength: 0,
  maxLength: 1,
  minSelected: 0,
  maxSelected: 1,
};

export const floorIssue = (
  ruleKey: string,
  value: unknown,
): string | undefined => {
  const floor = RULE_FLOORS[ruleKey];
  if (floor === undefined || typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }
  return value < floor ? `${ruleKey} must be at least ${floor}` : undefined;
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

/**
 * redux-form sync validate for the field-editor dialog. Errors are keyed at
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
 */
export const makeFieldEditorValidate =
  (allVariables: UnknownRecord, overlay?: VariableOverlay) =>
  (values: Record<string, unknown>): Record<string, unknown> => {
    // A variable that is only a TARGET of another's sameAs/comparator (never
    // configuring rules of its own) can have `values.validation` absent or
    // non-record here — that must not skip the check, since editing this
    // variable's own options/parameters can still break an incoming
    // relationship. `findDraftContradictions`'s involvement filter still
    // restricts results to contradictions the edited variable participates
    // in, so an empty validation map is safe to proceed with.
    const validation = isRecord(values.validation) ? values.validation : {};
    // Nineteenth-wave Finding 2: creating a variable writes the typed DISPLAY
    // NAME into `variable` as well as `_createNewVariable` (see
    // withFieldsHandlers' `handleNewVariable`), so a non-empty
    // `values.variable` is not necessarily a committed codebook id. Reading it
    // as one bypassed `buildProspectiveVariables`'s collision-free sentinel:
    // a typed name matching a real codebook id injected the draft OVER that
    // variable, so the draft's rules against it read as self-references
    // (a `sameAs` to oneself is vacuously satisfiable and reports nothing) —
    // then creation assigned a fresh uuid and left a genuinely contradictory
    // pair for protocol validation to reject.
    // Truthiness, not mere presence: `handleChangeVariable` resets the flag to
    // `null` when an existing variable is picked, and both commit handlers
    // (`withFormHandlers`/`withComposerFormHandlers`) branch on
    // `if (!_createNewVariable)`, so a blank flag commits as an EXISTING
    // variable and must be read as one here too.
    const isCreatingVariable =
      typeof values._createNewVariable === 'string' &&
      values._createNewVariable !== '';
    const currentVariableId =
      !isCreatingVariable && typeof values.variable === 'string'
        ? values.variable
        : '';
    const overlaidVariables = withOverlay(allVariables, overlay);
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
    const floor = Object.entries(validation)
      .map(([ruleKey, ruleValue]) => floorIssue(ruleKey, ruleValue))
      .find((message): message is string => message !== undefined);
    if (floor) return { validation: floor };
    const first = findDraftContradictions({
      allVariables: overlaidVariables,
      currentVariableId,
      variableType,
      validation,
      component: values.component,
      options: values.options,
      parameters: values.parameters,
    })[0];
    return first ? { validation: first.message } : {};
  };
