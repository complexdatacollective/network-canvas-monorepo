import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';

import VariableBooleanAnswerFields from '../codebook/components/VariableBooleanAnswerFields.tsx';
import {
  readBooleanAnswers,
  validateBooleanAnswers,
  type BooleanAnswer,
} from '../codebook/variableOptions.ts';

/**
 * The attribute's `options` list, as the protocol's boolean pair: two records
 * of a label and the value each records. Typed as the form store's own record
 * array rather than as `BooleanAnswers`, because that is what a field value
 * may be and because a row can arrive holding whatever the protocol held.
 */
type OptionList = Record<string, unknown>[];

export type BooleanAnswersFieldProps = CreateFormFieldProps<OptionList, 'div'>;

/**
 * The words on the two answers a yes-or-no question puts in front of a
 * participant.
 *
 * The control Architect put inline under the attribute picker of a form field
 * that collects a boolean (`Form/VariableDefinitionFields.tsx`'s "Boolean
 * values" section, `BooleanChoice`). The value is the attribute's whole
 * `options` list — the same key the categorical list writes — so the row
 * carries one draft key whichever kind of answer it binds, and the row's own
 * save is what puts it on the codebook attribute.
 *
 * Each answer's own complaint is stated on that answer rather than on the
 * pair, which is what `VariableBooleanAnswerFields` is for; the field's own
 * error region carries whatever the row's save says about the pair as a whole.
 */
export default function BooleanAnswersField({
  value,
  onChange,
  disabled = false,
  readOnly = false,
  className,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: BooleanAnswersFieldProps) {
  const answers = readBooleanAnswers(value);

  return (
    <div
      className={className}
      aria-invalid={ariaInvalid}
      {...(ariaDescribedBy === undefined
        ? {}
        : { 'aria-describedby': ariaDescribedBy })}
    >
      <VariableBooleanAnswerFields
        answers={answers}
        issues={validateBooleanAnswers(value)}
        readOnly={disabled || readOnly}
        onChange={(index: number, answer: BooleanAnswer) => {
          if (disabled || readOnly) return;
          const next: OptionList = answers.map((held, heldIndex) => {
            const chosen = heldIndex === index ? answer : held;
            return { label: chosen.label, value: chosen.value };
          });
          onChange?.(next);
        }}
      />
    </div>
  );
}
