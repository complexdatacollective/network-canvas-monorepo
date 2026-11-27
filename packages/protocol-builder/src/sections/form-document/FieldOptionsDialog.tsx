import { useMemo } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { Variable } from '@codaco/protocol-validation';

import DialogForm from '../../form/DialogForm.tsx';
import AttributeParameterFields, {
  ATTRIBUTE_PARAMETERS_FIELD,
} from '../AttributeParameterFields.tsx';
import AttributeValueFields, {
  ATTRIBUTE_OPTIONS_FIELD,
} from '../AttributeValueFields.tsx';
import { useFormStageEnvironment } from './formDocumentEnvironment.ts';
import { formDocumentMessages as messages } from './formDocumentMessages.ts';

type FieldOptionsDialogProps = Readonly<{
  variableId: string;
  variable: Readonly<Variable>;
  /** The control the attribute is collected with now. */
  component: string;
  onClose: () => void;
}>;

/**
 * The options that a field's attribute offers, and the settings of its input
 * control (a scale's end labels, a date's precision), in a dialog of their
 * own: the controls that the form field dialog had for them, written to the
 * attribute when the dialog is saved. Like every codebook change made in a
 * stage editor, the change is kept with the stage until the stage is saved.
 */
export function FieldOptionsDialog({
  variableId,
  variable,
  component,
  onClose,
}: FieldOptionsDialogProps) {
  const intl = useAppIntl();
  const { subject, writes } = useFormStageEnvironment();
  const optionsAsOpened: unknown = Reflect.get(variable, 'options');
  const parametersAsOpened: unknown = Reflect.get(variable, 'parameters');
  const document = useMemo(
    () => ({
      ...(optionsAsOpened === undefined
        ? {}
        : { [ATTRIBUTE_OPTIONS_FIELD]: optionsAsOpened }),
      ...(parametersAsOpened === undefined
        ? {}
        : { [ATTRIBUTE_PARAMETERS_FIELD]: parametersAsOpened }),
    }),
    [optionsAsOpened, parametersAsOpened],
  );

  return (
    <DialogForm
      open
      onClose={onClose}
      title={intl.formatMessage(messages.optionsDialogTitle, {
        attribute: variable.name,
      })}
      formId="field-options"
      submitLabel={intl.formatMessage(commonMessages.save)}
      document={document}
      onSubmit={async (values) => {
        const outcome = await writes.setOptionsAndSettings(variableId, {
          component,
          options: values[ATTRIBUTE_OPTIONS_FIELD],
          optionsAsOpened,
          parameters: values[ATTRIBUTE_PARAMETERS_FIELD],
        });
        if (outcome.status === 'refused') {
          return { formErrors: [outcome.message] };
        }
        return undefined;
      }}
    >
      <AttributeValueFields
        subject={subject}
        variableId={variableId}
        rowComponent={component}
      />
      <AttributeParameterFields
        subject={subject}
        variableId={variableId}
        rowComponent={component}
      />
    </DialogForm>
  );
}
