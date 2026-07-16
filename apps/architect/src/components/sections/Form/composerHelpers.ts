import { get, omit } from 'es-toolkit/compat';
import { formValueSelector } from 'redux-form';

import type { VariablePropertyKey } from '@codaco/protocol-validation';
import type { RootState } from '~/ducks/modules/root';
import { getVariablesForSubject } from '~/selectors/codebook';

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
