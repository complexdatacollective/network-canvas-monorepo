import { useMemo, type ComponentType } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import type { VariableType } from '@codaco/protocol-validation';

import { geospatialMessages } from '../../../fields/geospatial/geospatialMessages.ts';
import RichTextField from '../../../fields/RichTextField.tsx';
import VariablePickerField from '../../../fields/VariablePickerField.tsx';
import type {
  RowEditorProps,
  RowPreviewProps,
} from '../../../form/rowDialog.tsx';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import { useVariableChoices } from '../../../sections/canvas/codebookChoices.ts';
import { asText } from '../../../sections/canvas/rowValues.ts';
import CreateVariableButton from '../../../sections/create-variable/CreateVariableButton.tsx';
import { useStageSubject } from '../../../sections/useStageSubject.ts';

const TEXT_FIELD = 'text';
export const VARIABLE_FIELD = 'variable';

/** Where the shared prompt list keeps this stage's questions. */
export const PROMPTS_FIELD = 'prompts';

/**
 * The location attribute one prompt records, read as tolerantly as the rest of
 * a row is: a prompt reaches here from whatever authored the protocol.
 */
export const promptVariableOf = (prompt: unknown): string | undefined =>
  typeof prompt === 'object' && prompt !== null
    ? asText(Reflect.get(prompt, VARIABLE_FIELD))
    : undefined;

/** Every prompt the stage holds, whatever the form has in that field. */
export const promptsOf = (prompts: unknown): readonly unknown[] =>
  Array.isArray(prompts) ? prompts : [];

/**
 * The only attribute type that can hold a place on a map. Module-level because
 * a picker memoises its options on the type list it was asked for, and a
 * literal at the call site is a new array every render.
 */
const LOCATION_TYPES: readonly VariableType[] = Object.freeze(['location']);

/** The picker takes an open prop bag from the field wrapper. */
const VariablePicker = VariablePickerField as ComponentType<
  Record<string, unknown>
>;

/**
 * One geospatial prompt: what it asks, and where the answer goes.
 *
 * A LOCATION attribute of the stage's own type, because that is the only thing
 * a map selection can be stored in, created here through the codebook's own
 * write when the researcher has none yet.
 *
 * The interview writes what the participant taps straight into that attribute,
 * around whatever validation the codebook holds for it, so the picker is an
 * UNVALIDATED writer: an attribute a form field collects is not offered here,
 * or an export would mix checked and unchecked answers under one name.
 *
 * An attribute another prompt on THIS stage already records is not offered
 * either. The interview stores each answer under the prompt's own attribute,
 * so two prompts sharing one would have the second answer overwrite the first
 * and the stage would keep only the last place the participant chose. The
 * stage's own uses are invisible to `useVariableChoices` — it takes this stage
 * out of the role map so a stage can re-save itself — which is why the
 * exclusion is applied here, as a network composer's form fields apply it to
 * their own siblings.
 */
export function GeospatialPromptFields({ item }: RowEditorProps) {
  const intl = useAppIntl();
  const subject = useStageSubject('node');
  // Writes reach THIS dialog's form, not the stage's: the prompt is the
  // researcher's unsaved row until they save it.
  const setRowValue = useFormStore((store) => store.setFieldValue);
  const prompts = useStageValue(PROMPTS_FIELD);

  const committedVariable = asText(item[VARIABLE_FIELD]);
  const offered = useVariableChoices({
    subject,
    types: LOCATION_TYPES,
    writerClass: 'unvalidated',
    ...(committedVariable === undefined
      ? {}
      : { currentValue: committedVariable }),
  });

  const recordedByAnotherPrompt = useMemo(
    () =>
      new Set(
        promptsOf(prompts).flatMap((prompt) => {
          const variable = promptVariableOf(prompt);
          return variable === undefined || variable === committedVariable
            ? []
            : [variable];
        }),
      ),
    [committedVariable, prompts],
  );

  const options = useMemo(
    () =>
      offered.filter(
        // This row's own pick is always offered back, whatever the filter
        // says: a picker that dropped its value would blank the control and
        // write the blank over the reference the researcher has to resolve.
        (option) =>
          option.value === committedVariable ||
          !recordedByAnotherPrompt.has(option.value),
      ),
    [committedVariable, offered, recordedByAnotherPrompt],
  );

  return (
    <>
      <Field<typeof RichTextField>
        name={TEXT_FIELD}
        label={intl.formatMessage(geospatialMessages.promptTextLabel)}
        hint={intl.formatMessage(geospatialMessages.promptTextHint)}
        component={RichTextField}
        singleLine
        initialValue={asText(item[TEXT_FIELD]) ?? ''}
        required={intl.formatMessage(geospatialMessages.promptTextRequired)}
      />
      <Field<typeof VariablePicker>
        name={VARIABLE_FIELD}
        label={intl.formatMessage(geospatialMessages.promptVariableLabel)}
        hint={intl.formatMessage(geospatialMessages.promptVariableHint)}
        component={VariablePicker}
        options={options}
        emptyMessage={intl.formatMessage(
          geospatialMessages.promptVariableEmptyState,
        )}
        initialValue={committedVariable}
        required={intl.formatMessage(geospatialMessages.promptVariableRequired)}
      />
      <CreateVariableButton
        subject={subject ?? null}
        variableType="location"
        label={intl.formatMessage(geospatialMessages.createAttributeLabel)}
        onCreated={(variableId) => setRowValue(VARIABLE_FIELD, variableId)}
      />
    </>
  );
}

/**
 * How one prompt reads in the list when its dialog is closed.
 *
 * Through the markdown renderer, because the text was WRITTEN through the
 * markdown editor: a researcher who emphasised a word in the dialog would
 * otherwise meet their own asterisks in the list, and the prompt lists of
 * every other interface render the same text the same way.
 */
export function GeospatialPromptPreview({ item }: RowPreviewProps) {
  const intl = useAppIntl();
  const text = asText(item[TEXT_FIELD]);
  return (
    <RenderMarkdown render={<div />}>
      {text ?? intl.formatMessage(geospatialMessages.promptPreviewEmpty)}
    </RenderMarkdown>
  );
}
