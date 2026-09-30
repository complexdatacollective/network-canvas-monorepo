import { type FocusEvent, useState } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { MessageRule } from '@codaco/fresco-ui/form/validation/helpers';

const messages = defineMessages({
  notAWholeNumber: {
    id: 'protocolBuilder.integerField.notAWholeNumber',
    defaultMessage: 'This has to be a whole number of people.',
    description:
      'Refusal shown against a box that counts people when the researcher has typed something that is not a whole number — a decimal on its way to being one, or a stray character. Every control this rule guards counts people, which is why the sentence names them rather than saying "a whole number".',
  },
});

/**
 * `size` is dropped: the native `<input>`'s `size` attribute (a character
 * width) collides with `InputField`'s own `size` prop (a CVA variant) once the
 * rest is spread onto it, and nothing here ever sets either.
 *
 * The value is a number OR the text the control could not read as one. See the
 * component's own note: text that is not yet a count is held in the field
 * rather than dropped, so that `wholeNumberRule` can refuse the save.
 */
export type IntegerFieldProps = Omit<
  CreateFormFieldProps<number | string, 'input'>,
  'size'
>;

/**
 * The whole number the text stands for, or the text itself when it stands for
 * no whole number at all.
 *
 * An empty box is an absent count rather than empty text: absence is how the
 * schema spells "no limit", and `""` is not a value it accepts anywhere.
 */
const readCount = (text: string | undefined): number | string | undefined => {
  if (text === undefined || text.trim() === '') return undefined;
  const parsed = Number(text);
  return Number.isInteger(parsed) ? parsed : text;
};

/**
 * The rule that can actually refuse a save.
 *
 * Every section rendering `IntegerFieldControl` owes its fields this rule,
 * FIRST, or the control renders a refusal the form knows nothing about — and
 * the stage saves the text as it stands. It is stated as a rule rather than
 * done by the control because only the field's own validation reaches the
 * form's validity: a control can mark itself invalid and say why, and neither
 * of those stops a submit.
 *
 * Encoded rather than formatted: a `MessageRule` hands the form a plain
 * string, and `FieldErrors` decodes it in the reader's own language where the
 * refusal is shown. A formatter reached for here would be a module-level
 * English one, which would make this the one refusal in the section that
 * stayed English.
 */
export const wholeNumberRule: MessageRule = (value) =>
  typeof value === 'string'
    ? createMessageError(messages.notAWholeNumber)
    : undefined;

/** The text the researcher has entered, and what it was read as. */
type IntegerDraft = Readonly<{
  text: string;
  value: number | string | undefined;
}>;

/**
 * A whole number, held in the document as a number.
 *
 * `InputField` is string-valued — it emits `e.target.value` verbatim even for
 * `type="number"` — so a stage counting people would otherwise store `"3"` and
 * be refused by the schema in its own words. Reading the text into a number
 * here means every section that counts something spells it the same way, and
 * an emptied control clears the key rather than parking `""` on it.
 *
 * Text that is NOT a whole number — `2.5` on its way to `25`, a lone `-` — is
 * held in the field as the text it is, and the section's `wholeNumberRule`
 * refuses the save while it is there. Reporting it as "no answer" instead lost
 * it twice over: the control renders from the value it reported, so the box
 * emptied under the researcher's cursor mid-keystroke; and a count the stage
 * had already saved was deleted by a save the researcher was being told, in
 * red, had been refused.
 *
 * What is TYPED and what is READ are still two different things, so a draft
 * covers the gap between them: `2.` reads as `2`, and rendering `2` back would
 * take the researcher's decimal point away as they typed it. The draft stands
 * only while it still stands for what the field holds — a count set or cleared
 * anywhere else replaces it — and leaving the field drops it, so the control
 * settles on what it stored. The pattern is `RuleValueField`'s
 * `useNumericDraft`, narrowed to integers.
 *
 * Nothing here says the control is wrong. Marking itself invalid and printing
 * its own sentence beneath the box put the reason in a paragraph nothing
 * named — `aria-describedby` reached the hint and stopped — so the control
 * announced as invalid with no reason attached. The field's own error region
 * is named by `aria-describedby`, is a live region, and is where every other
 * refusal in the builder appears; the section's `wholeNumberRule` puts this
 * one there with them, so the invalid state and its reason arrive together.
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

  return (
    <InputField
      {...rest}
      type="number"
      value={text}
      onChange={(next: string | undefined) => {
        const count = readCount(next);
        setDraft({ text: next ?? '', value: count });
        onChange?.(count);
      }}
      onBlur={(event: FocusEvent) => {
        setDraft(undefined);
        onBlur?.(event);
      }}
    />
  );
}
