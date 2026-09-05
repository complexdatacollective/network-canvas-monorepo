'use client';

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
 * What a field is called, as the researcher wrote it.
 *
 * The one rule. `createFieldMetadata` resolves the caption the participant
 * reads from this, and `buildVariableLabels` decides what a validator may name
 * the variable by from this, so the two cannot disagree about which text is
 * the researcher's and which is a fallback the participant never authored.
 *
 * Whitespace-only text counts as nothing authored: a stray space must not
 * produce `your answer to ''`, nor a field captioned with a blank.
 */
export const authoredFieldLabel = (field: {
  label?: string;
  prompt?: string;
}): string | undefined => {
  const authored = (field.label ?? field.prompt ?? '').trim();
  return authored.length > 0 ? authored : undefined;
};

/**
 * The participant-facing text for each variable a screen asks about, for the
 * variable-comparison validators to name their target with.
 *
 * Built from `authoredFieldLabel` only. A codebook variable's `name` is the
 * researcher's identifier for a column of data and must never reach a
 * participant, so a field with nothing authored is simply left out and the
 * validator falls back to a complete label-free sentence — which is also what a
 * comparison against a variable answered on an earlier stage gets, since it has
 * no caption on this screen.
 *
 * ACCUMULATED THROUGH A MAP. `VariableNameSchema` is `/^[a-zA-Z0-9._:-]+$/`,
 * which admits `__proto__` as a codebook variable id, and
 * `labels.__proto__ = 'How old are you?'` on an ordinary object hits
 * `Object.prototype`'s setter rather than defining anything: the caption is
 * dropped, and the later `variableLabels?.[attribute]` lookup answers
 * `Object.prototype`, so the participant's validation hint names their question
 * as `[object Object]` instead of the words the researcher wrote.
 * `Object.fromEntries` defines own properties, so the returned map is still an
 * ordinary object every caller can index.
 */
export const buildVariableLabels = (
  fields: readonly AuthoredField[],
): Readonly<Record<string, string>> => {
  const labels = new Map<string, string>();
  for (const field of fields) {
    const authored = authoredFieldLabel(field);
    if (authored !== undefined) labels.set(field.variable, authored);
  }
  return Object.fromEntries(labels);
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
      label: authoredFieldLabel(field) ?? '',
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
