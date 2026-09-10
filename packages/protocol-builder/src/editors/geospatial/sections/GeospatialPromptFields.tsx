import type { ComponentType } from 'react';

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
import { useVariableChoices } from '../../../sections/canvas/codebookChoices.ts';
import { asText } from '../../../sections/canvas/rowValues.ts';
import CreateVariableButton from '../../../sections/create-variable/CreateVariableButton.tsx';
import { useStageSubject } from '../../../sections/useStageSubject.ts';

const TEXT_FIELD = 'text';
const VARIABLE_FIELD = 'variable';

/**
 * The only attribute type that can hold a place on a map, so the only one this
 * prompt offers and the only one its create button makes.
 *
 * Module-level and frozen because a picker's option list is memoised on the
 * type list it was asked for, and an array literal written at a call site is a
 * new one on every render.
 */
const LOCATION_TYPES: readonly VariableType[] = Object.freeze(['location']);

/** The picker takes an open prop bag from the field wrapper. */
const VariablePicker = VariablePickerField as ComponentType<
  Record<string, unknown>
>;

/**
 * One geospatial prompt: what it asks, and where the answer goes.
 *
 * The attribute is a LOCATION attribute of the stage's own type, because that
 * is the only thing a map selection can be stored in. A researcher who has not
 * created one yet creates it here, through the codebook's own write — the same
 * edit the codebook screen would make, so the new attribute is a real part of
 * the protocol rather than something this prompt invented for itself.
 *
 * The interview writes what the participant taps on the map straight into that
 * attribute, around whatever validation the codebook holds for it, so the
 * picker is an UNVALIDATED writer: an attribute a form field collects is not
 * offered here, and an export would otherwise mix checked and unchecked
 * answers under one name.
 *
 * Rendered inside the prompt dialog, whose form store is its own — which is
 * what `useFormStore` addresses below — while the stage editor context around
 * it is not re-provided, so the subject and the codebook are still read live.
 */
export function GeospatialPromptFields({ item }: RowEditorProps) {
  const intl = useAppIntl();
  const subject = useStageSubject('node');
  // Writes reach THIS dialog's form, not the stage's: the prompt is the
  // researcher's unsaved row until they save it.
  const setRowValue = useFormStore((store) => store.setFieldValue);

  const committedVariable = asText(item[VARIABLE_FIELD]);
  const options = useVariableChoices({
    subject,
    types: LOCATION_TYPES,
    writerClass: 'unvalidated',
    ...(committedVariable === undefined
      ? {}
      : { currentValue: committedVariable }),
  });

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
