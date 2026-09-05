import { type FocusEvent, useState } from 'react';

import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

/**
 * `size` is dropped: the native `<input>`'s `size` attribute (a character
 * width) collides with `InputField`'s own `size` prop (a CVA variant) once the
 * rest is spread onto it, and nothing here ever sets either.
 */
export type IntegerFieldProps = Omit<
  CreateFormFieldProps<number, 'input'>,
  'size'
>;

const NOT_A_WHOLE_NUMBER = 'This has to be a whole number of people.';

const parseInteger = (text: string | undefined): number | undefined => {
  if (text === undefined || text.trim() === '') return undefined;
  const parsed = Number(text);
  return Number.isInteger(parsed) ? parsed : undefined;
};

/** The text the researcher has entered, and the number it was read as. */
type IntegerDraft = Readonly<{ text: string; value: number | undefined }>;

/**
 * A whole number, held in the document as a number.
 *
 * `InputField` is string-valued — it emits `e.target.value` verbatim even for
 * `type="number"` — so a stage counting people would otherwise store `"3"` and
 * be refused by the schema in its own words. Presenting the number/undefined
 * pair here means every section that counts something spells it the same way,
 * and an emptied control clears the key rather than parking `""` on it.
 *
 * What is TYPED and what is STORED are two different things, so they are kept
 * separately. A part-typed number — `2.5` on its way to `25`, a lone `-` — is
 * not yet an answer, and storing it would put `NaN` or a fraction of a person
 * into the document, which no schema accepts and no message can explain. But
 * reporting it as "no answer" while the control renders from the reported
 * value emptied the box under the researcher's cursor mid-keystroke, which
 * made a limit impossible to type at all.
 *
 * So the text stays on screen and the document gets nothing, and the control
 * says why it is holding text it did not store. The draft is kept only while
 * it still stands for what the form holds — a count cleared or set anywhere
 * else replaces it — and leaving the field drops it, so the control settles on
 * the number it stored rather than going on showing text nothing is holding.
 * The pattern is `RuleValueField`'s `useNumericDraft`, narrowed to integers.
 */
export function IntegerFieldControl({
  value,
  onChange,
  onBlur,
  ...rest
}: IntegerFieldProps) {
  const [draft, setDraft] = useState<IntegerDraft | undefined>(undefined);
  const text =
    draft !== undefined && draft.value === value
      ? draft.text
      : value === undefined
        ? ''
        : String(value);
  const unstored = value === undefined && text.trim() !== '';

  return (
    <>
      <InputField
        {...rest}
        type="number"
        value={text}
        // The field wrapper marks the control invalid for its own rules; this
        // adds the one case those rules cannot see, because the value they are
        // handed is the absence this is explaining.
        {...(unstored ? { 'aria-invalid': true } : {})}
        onChange={(next: string | undefined) => {
          const parsed = parseInteger(next);
          setDraft({ text: next ?? '', value: parsed });
          onChange?.(parsed);
        }}
        onBlur={(event: FocusEvent) => {
          setDraft(undefined);
          onBlur?.(event);
        }}
      />
      {unstored && (
        <p className="text-destructive text-sm">{NOT_A_WHOLE_NUMBER}</p>
      )}
    </>
  );
}
