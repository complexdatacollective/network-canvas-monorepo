import { get, omit } from 'es-toolkit/compat';
import { formValueSelector } from 'redux-form';

import type { VariablePropertyKey } from '@codaco/protocol-validation';
import type { RootState } from '~/ducks/modules/root';
import { getVariablesForSubject } from '~/selectors/codebook';

import type { VariableOverlay } from '../../Validations/contradictions';

// Codebook props that, for NetworkComposer, stay on the codebook variable.
// `component`/`parameters` are intentionally NOT here — they live on the field.
export const COMPOSER_CODEBOOK_PROPERTIES = [
  'options',
  'validation',
] as const satisfies readonly VariablePropertyKey[];

export const composerNormalizeField = (field: Record<string, unknown>) => {
  // Keep `id` so the list item retains a stable, unique React key.
  const normalized = omit(field, [
    '_createNewVariable',
    ...COMPOSER_CODEBOOK_PROPERTIES,
  ]);
  // An empty label saves as '' and defeats the variable-name caption fallback,
  // so treat a blank label as absent.
  if (typeof normalized.label === 'string' && normalized.label.trim() === '') {
    return omit(normalized, ['label']);
  }
  return normalized;
};

export const composerItemSelector =
  (entity: string | null, type: string | null) =>
  (
    state: RootState,
    { form, editField }: { form: string; editField: string },
  ) => {
    const item = formValueSelector(form)(state, editField) as
      | Record<string, unknown>
      | undefined;
    if (!item || !entity) return null;

    const variable = item.variable as string | undefined;
    const codebookVariables = getVariablesForSubject(state, {
      entity: entity as 'node' | 'edge' | 'ego',
      type: type ?? undefined,
    });
    const codebookVariable = get(
      codebookVariables,
      variable ?? '',
      {},
    ) as Record<string, unknown>;
    // Merge ONLY options + validation so the dialog can edit them; component +
    // parameters stay as the field already has them (do not let codebook clobber).
    const merged: Record<string, unknown> = { ...item };
    for (const key of COMPOSER_CODEBOOK_PROPERTIES) {
      if (key in codebookVariable) merged[key] = codebookVariable[key];
    }
    return merged;
  };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A stage's committed composer fields (redux-form's `nodeForm.fields` or one
 * edge type's `edges[i].form.fields`), reshaped into the
 * `makeFieldEditorValidate` overlay: each field's OWN `component`/
 * `parameters` — which for NetworkComposer live on the field, not the
 * codebook variable — keyed by the variable it renders. Fields with no
 * `variable` yet (a still-blank new row) are skipped; they render nothing
 * for any variable and so have no override to contribute.
 *
 * `excludeIndex` is the array position of the field currently being edited,
 * whose entry is its pre-draft committed value and must never shadow the
 * live draft values the editor validate layers on afterwards. Eleventh-wave
 * Finding 4: excluding here, by index, replaces the previous exclusion
 * inside `makeFieldEditorValidate` by the field's `id` — imported protocols
 * can carry id-less fields (ComposerFormFieldSchema.id is optional), which
 * escaped an id-keyed exclusion and left a stale override in the checked
 * set; the index identifies the row regardless, and survives the edit
 * reassigning the field to a different variable.
 */
export const buildComposerFieldOverlay = (
  fields: unknown,
  excludeIndex?: number,
): VariableOverlay => {
  if (!Array.isArray(fields)) return {};
  const overlay: VariableOverlay = {};
  for (const [index, field] of fields.entries()) {
    if (index === excludeIndex) continue;
    if (!isRecord(field)) continue;
    const { variable, component, parameters } = field;
    if (typeof variable !== 'string' || variable === '') continue;
    overlay[variable] = { component, parameters };
  }
  return overlay;
};
