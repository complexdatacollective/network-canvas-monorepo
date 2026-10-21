'use client';

import { useMemo } from 'react';

import type { LocalizedString } from '@codaco/protocol-validation';

import { useResolveLocalizedString } from '../localization/ProtocolLocalizationProvider';

/**
 * The shape every authored field has in common: the variable it collects, and
 * whichever of `label`/`prompt` its schema happens to call the caption.
 * `FormField` carries `prompt`, `ComposerFormField` carries `label`; widened
 * to plain `string` so both branded and unbranded variable references fit.
 */
type AuthoredField = {
  variable: string;
  label?: LocalizedString;
  prompt?: LocalizedString;
};

/** A variable and the text a screen captions it with, already resolved. */
type VariableCaption = {
  variable: string;
  label?: string;
};

/**
 * What a field is called, as the researcher wrote it, given the resolved text
 * of its caption.
 *
 * A form field's caption is never blank, because the schema requires its
 * `prompt` or `label` to say something. The screens that name a variable
 * without a form field of their own (a categorical "other" input, a quick-add
 * popover, the pedigree's name field) take their caption from text the schema
 * still lets be spaces, so whitespace-only text counts as nothing authored: a
 * stray space must not produce `your answer to ''`.
 */
const authoredFieldLabel = (text: string | undefined): string | undefined => {
  const authored = (text ?? '').trim();
  return authored.length > 0 ? authored : undefined;
};

/**
 * The participant-facing text for each variable a screen asks about, for the
 * variable-comparison validators to name their target with.
 *
 * Built from `authoredFieldLabel` only, over captions already resolved to the
 * interview language. A field with nothing authored is simply left out and the
 * validator falls back to a complete label-free sentence — which is also what a
 * comparison against a variable answered on an earlier stage gets, since it has
 * no caption on this screen.
 *
 * ACCUMULATED THROUGH A MAP. `CodebookIdSchema` is `/^[a-zA-Z0-9._:-]+$/`,
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
  fields: readonly VariableCaption[],
): Readonly<Record<string, string>> => {
  const labels = new Map<string, string>();
  for (const field of fields) {
    const authored = authoredFieldLabel(field.label);
    if (authored !== undefined) labels.set(field.variable, authored);
  }
  return Object.fromEntries(labels);
};

/**
 * The same map for protocol-authored fields, resolved to the interview
 * language, with a referentially stable identity.
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
  const resolve = useResolveLocalizedString();
  const contentKey = JSON.stringify(
    fields.map((field): VariableCaption => {
      const caption = field.label ?? field.prompt;
      return {
        variable: field.variable,
        label: caption === undefined ? '' : resolve(caption).text,
      };
    }),
  );

  return useMemo<Readonly<Record<string, string>>>(
    () => buildVariableLabels(JSON.parse(contentKey) as VariableCaption[]),
    // Deliberately keyed on the serialised content alone: including `fields`
    // would restore the unstable identity this exists to avoid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contentKey],
  );
};
