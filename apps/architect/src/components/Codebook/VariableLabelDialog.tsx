import { useCallback, useMemo } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import DialogForm from '~/components/DialogForm/DialogForm';
import type { LenientSubmitHandler } from '~/components/DialogForm/formLevelValidate';
import ArchitectField from '~/components/Form/ArchitectField';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { updateVariableByUUID } from '~/ducks/modules/protocol/codebook';
import { makeGetVariable } from '~/selectors/codebook';
import { reportError } from '~/utils/reportError';

const messages = defineMessages({
  title: {
    id: 'architect.codebook.variableLabelDialog.title',
    defaultMessage: 'Edit attribute label',
    description:
      'Title of the dialog that edits the readable label of an attribute (a codebook variable).',
  },
  label: {
    id: 'architect.codebook.variableLabelDialog.label',
    defaultMessage: 'Attribute label',
    description:
      'Label of the field holding the readable label of an attribute, as opposed to the attribute name the exported data uses.',
  },
  hint: {
    id: 'architect.codebook.variableLabelDialog.labelHint',
    defaultMessage:
      'A readable label for the attribute “{name}”. It is not translated.',
    description:
      'Hint under the attribute label field. name is the attribute’s name, which the exported data uses.',
  },
});

type VariableLabelDialogProps = {
  /** The attribute whose label is edited. The dialog is closed while unset. */
  variable: string | undefined;
  onClose: () => void;
};

const VariableLabelDialog = ({
  variable,
  onClose,
}: VariableLabelDialogProps) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const getVariable = useMemo(
    () => makeGetVariable(variable ?? ''),
    [variable],
  );
  const definition = useAppSelector(getVariable);

  const handleSubmit = useCallback<LenientSubmitHandler>(
    async (values) => {
      const { label } = values;
      if (variable === undefined || typeof label !== 'string') return;
      try {
        await dispatch(
          updateVariableByUUID(variable, { label: label.trim() }),
        ).unwrap();
        onClose();
      } catch (error) {
        return { success: false, formErrors: [reportError(error).message] };
      }
    },
    [dispatch, onClose, variable],
  );

  if (variable === undefined || !definition) return null;

  return (
    <DialogForm
      key={variable}
      open
      onClose={onClose}
      title={intl.formatMessage(messages.title)}
      formId="variable-label-dialog"
      submitLabel={intl.formatMessage(commonMessages.save)}
      onSubmit={handleSubmit}
    >
      <ArchitectField
        component={InputField}
        name="label"
        label={intl.formatMessage(messages.label)}
        hint={intl.formatMessage(messages.hint, { name: definition.name })}
        initialValue={definition.label}
        validation={{ required: true }}
      />
    </DialogForm>
  );
};

export default VariableLabelDialog;
