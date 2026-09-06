import type { ComponentType } from 'react';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Surface from '@codaco/fresco-ui/layout/Surface';

import {
  type BooleanAnswer,
  type BooleanAnswerIssues,
  type BooleanAnswers,
  DEFAULT_BOOLEAN_LABELS,
} from '../variableOptions.ts';

const InputControl = InputField as ComponentType<Record<string, unknown>>;
const ToggleControl = ToggleField as ComponentType<Record<string, unknown>>;

export type VariableBooleanAnswerFieldsProps = Readonly<{
  answers: BooleanAnswers;
  /** Replaces one of the two answers, whole. */
  onChange(index: number, answer: BooleanAnswer): void;
  issues: BooleanAnswerIssues;
  readOnly: boolean;
}>;

/**
 * The words on the two answers a boolean choice puts in front of a
 * participant, and which of them is the negative one.
 *
 * Each answer says which value it records, because that is the part the
 * researcher cannot change and the part that decides what every stored answer
 * means: the protocol holds the pair in its own order, and this labels what is
 * there rather than assuming true comes first. The counterpart of Architect's
 * `BooleanChoice`, which states the same thing on each of its two cards.
 *
 * Neither label is required. An attribute that names no answers is a Yes/No
 * question — the interview's own boolean control supplies exactly those words
 * when the protocol names none — so the placeholders show what will happen and
 * the pair is written only once the researcher writes something else.
 */
export default function VariableBooleanAnswerFields({
  answers,
  onChange,
  issues,
  readOnly,
}: VariableBooleanAnswerFieldsProps) {
  return (
    <div className="flex flex-col gap-4">
      {answers.map((answer, index) => {
        const records = answer.value ? 'true' : 'false';
        const errors = [...(issues[index] ?? [])];
        return (
          <Surface
            key={records}
            noContainer
            spacing="sm"
            shadow="xs"
            series="accent"
            className="w-full overflow-visible!"
          >
            <UnconnectedField
              name={`boolean-answer-${records}-label`}
              label={`Label for “${records}”`}
              component={InputControl}
              placeholder={DEFAULT_BOOLEAN_LABELS[records]}
              value={answer.label}
              onChange={(value: unknown) =>
                onChange(index, {
                  ...answer,
                  label: typeof value === 'string' ? value : '',
                })
              }
              readOnly={readOnly}
              errors={errors}
              showErrors={errors.length > 0}
            />
            <UnconnectedField
              name={`boolean-answer-${records}-negative`}
              label={`Style “${records}” as negative`}
              component={ToggleControl}
              inline
              value={answer.negative === true}
              onChange={(value: unknown) =>
                onChange(index, { ...answer, negative: value === true })
              }
              readOnly={readOnly}
            />
          </Surface>
        );
      })}
    </div>
  );
}
