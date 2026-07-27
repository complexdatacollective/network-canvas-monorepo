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
