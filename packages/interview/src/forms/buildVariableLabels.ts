import { useMemo } from 'react';

/**
 * The shape every authored field has in common: the variable it collects, and
 * whichever of `label`/`prompt` its schema happens to call the caption.
 * `FormField` carries `prompt`, `ComposerFormField` carries an optional
 * `label`; widened to plain `string` so both branded and unbranded variable
 * references fit.
 */
export type AuthoredField = {
  variable: string;
  label?: string;
  prompt?: string;
};

/**
 * The participant-facing text for each variable a screen asks about, for the
 * variable-comparison validators to name their target with.
 *
 * Built from the AUTHORED prompt or label only. A codebook variable's `name` is
 * the researcher's identifier for a column of data and must never reach a
 * participant, so a field with nothing authored is simply left out and the
 * validator falls back to a complete label-free sentence — which is also what a
 * comparison against a variable answered on an earlier stage gets, since it has
 * no caption on this screen. Whitespace-only text counts as nothing authored,
 * so a stray space cannot produce `your answer to ''`.
 */
export const buildVariableLabels = (
  fields: readonly AuthoredField[],
): Readonly<Record<string, string>> => {
  const labels: Record<string, string> = {};
  for (const field of fields) {
    const authored = (field.label ?? field.prompt ?? '').trim();
    if (authored.length > 0) labels[field.variable] = authored;
  }
  return labels;
};

/**
 * The same map, with a referentially stable identity.
 *
 * Memoised on the map's CONTENT rather than on `fields`: callers routinely pass
 * `form.fields ?? []`, a fresh array on every render whenever the form has no
 * fields, and handing `validationContext` a new identity every render
 * re-registers every field — which loops wherever an ancestor subscribes to the
 * form store.
 */
export const useVariableLabels = (
  fields: readonly AuthoredField[],
): Readonly<Record<string, string>> => {
  const contentKey = JSON.stringify(
    fields.map((field) => ({
      variable: field.variable,
      label: (field.label ?? field.prompt ?? '').trim(),
    })),
  );

  return useMemo<Readonly<Record<string, string>>>(
    () => buildVariableLabels(JSON.parse(contentKey) as AuthoredField[]),
    // Deliberately keyed on the serialised content alone: including `fields`
    // would restore the unstable identity this exists to avoid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contentKey],
  );
};
