import {
  findValidationContradictions,
  type ValidationContradiction,
} from '@codaco/protocol-validation';
import { getTypeForComponent } from '~/config/variables';

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
  const id = draft.currentVariableId || DRAFT_VARIABLE_ID;
  return findValidationContradictions(buildProspectiveVariables(draft)).filter(
    (contradiction) => contradiction.variableIds.includes(id),
  );
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
 * `fieldId` (ninth-wave Finding 4) is the composer FIELD's own stable id —
 * distinct from the variable id this entry is keyed by — so `withOverlay` can
 * exclude an entry by which FIELD contributed it, not by which variable it
 * currently points at. A field being reassigned from one variable to another
 * keeps the SAME id throughout the edit, so this identity survives the
 * reassignment even though the entry's own key (the variable) does not.
 */
export type VariableOverlay = Record<
  string,
  { fieldId?: string; component?: unknown; parameters?: unknown }
>;

/**
 * `allVariables` with `overlay` layered on top, EXCLUDING the entry
 * contributed by `excludeFieldId` (always the field currently being edited,
 * by its own stable id — ninth-wave Finding 4): that field's own overlay
 * entry is its pre-draft committed value, which must never shadow the live
 * draft values `buildProspectiveVariables` layers on afterwards. Excluding by
 * FIELD id rather than by the draft's variable id matters when the edit
 * reassigns the field to a different variable — the overlay entry to exclude
 * is keyed by the field's OLD (pre-draft) variable, not the draft's new one,
 * so excluding by the draft's `values.variable` would miss it and leave a
 * stale entry for a variable the save is about to stop overriding. When
 * `excludeFieldId` is unknown (no `.id` on the draft), nothing is excluded by
 * field id — every entry stays, including this field's own, matching the
 * pre-fix behaviour for that case. Only `component`/`parameters` are
 * overridden — everything else (`options`, `validation`, `type`, ...) still
 * comes from the codebook. An overlay entry naming a variable absent from
 * `allVariables` is ignored defensively.
 */
const withOverlay = (
  allVariables: UnknownRecord,
  overlay: VariableOverlay | undefined,
  excludeFieldId: string | undefined,
): UnknownRecord => {
  if (!overlay) return allVariables;
  const entries = Object.entries(overlay).filter(([id, entry]) => {
    if (excludeFieldId !== undefined && entry.fieldId === excludeFieldId) {
      return false;
    }
    return isRecord(allVariables[id]);
  });
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
 * codebook-only behaviour.
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
    const currentVariableId =
      typeof values.variable === 'string' ? values.variable : '';
    // The FIELD's own stable id (ninth-wave Finding 4) — not the variable it
    // currently targets — identifies which overlay entry is this field's own
    // pre-draft contribution, so a reassignment (currentVariableId pointing
    // at a NEW variable) still excludes the right entry.
    const editingFieldId =
      typeof values.id === 'string' ? values.id : undefined;
    const overlaidVariables = withOverlay(
      allVariables,
      overlay,
      editingFieldId,
    );
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
