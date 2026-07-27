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
 * redux-form sync validate for the field-editor dialog. Errors are keyed at
 * `validation` so they surface through the Validations field's FieldErrors on
 * a failed save and anchor to getFieldId('validation') for scroll-to-error.
 */
export const makeFieldEditorValidate =
  (allVariables: UnknownRecord) =>
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
    const floor = Object.entries(validation)
      .map(([ruleKey, ruleValue]) => floorIssue(ruleKey, ruleValue))
      .find((message): message is string => message !== undefined);
    if (floor) return { validation: floor };
    const first = findDraftContradictions({
      allVariables,
      currentVariableId,
      variableType,
      validation,
      options: values.options,
      parameters: values.parameters,
    })[0];
    return first ? { validation: first.message } : {};
  };
