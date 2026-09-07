import type { ComponentType } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Surface from '@codaco/fresco-ui/layout/Surface';

import type {
  BooleanAnswer,
  BooleanAnswerIssues,
  BooleanAnswers,
} from '../variableOptions.ts';

const InputControl = InputField as ComponentType<Record<string, unknown>>;
const ToggleControl = ToggleField as ComponentType<Record<string, unknown>>;

const messages = defineMessages({
  answerLabel: {
    id: 'protocolBuilder.codebookVariable.booleanAnswerLabel',
    defaultMessage:
      '{records, select, true {Label for “true”} other {Label for “false”}}',
    description:
      'Label of the field holding the words on one of the two answers a yes/no attribute offers. records says which of the two stored values this answer records; “true” and “false” are the literal values the protocol stores and an export records, so they stay as they are.',
  },
  answerPlaceholder: {
    id: 'protocolBuilder.codebookVariable.booleanAnswerPlaceholder',
    defaultMessage: '{records, select, true {Yes} other {No}}',
    description:
      'Placeholder in the field holding the words on one of the two answers a yes/no attribute offers, shown while the researcher has written none. It has to read exactly as the interview’s own yes/no control does for an attribute that names no answers — frescoUi.booleanField.yes and frescoUi.booleanField.no — because that is literally what the participant will see. records says which of the two stored values this answer records.',
  },
  negativeLabel: {
    id: 'protocolBuilder.codebookVariable.booleanNegativeLabel',
    defaultMessage:
      '{records, select, true {Style “true” as negative} other {Style “false” as negative}}',
    description:
      'Label of the switch that draws one of the two answers of a yes/no attribute in red when a participant selects it. records says which of the two stored values this answer records; “true” and “false” are the literal values the protocol stores and stay as they are.',
  },
});

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
  const intl = useAppIntl();
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
              label={intl.formatMessage(messages.answerLabel, { records })}
              component={InputControl}
              // What the interview will actually show for an answer nobody has
              // named: the participant reads fresco-ui's own boolean control,
              // which supplies its translated Yes/No when the protocol carries
              // no `options` at all — and this editor writes no `options` key
              // while both labels are blank. `booleanPlaceholdersMatchFresco`
              // holds the two wordings together.
              placeholder={intl.formatMessage(messages.answerPlaceholder, {
                records,
              })}
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
              label={intl.formatMessage(messages.negativeLabel, { records })}
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
