import { useCallback, useMemo } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { LocalizedString } from '@codaco/protocol-validation';
import DialogForm, {
  type DialogFormProps,
} from '~/components/DialogForm/DialogForm';
import type { LenientSubmitHandler } from '~/components/DialogForm/formLevelValidate';
import LabelField from '~/components/Localization/LabelField';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { updateVariableByUUID } from '~/ducks/modules/protocol/codebook';
import { makeGetVariable } from '~/selectors/codebook';
import { reportError } from '~/utils/reportError';

const messages = defineMessages({
  title: {
    id: 'architect.codebook.variableLabelDialog.title',
    defaultMessage: 'Edit attribute label',
    description:
      'Title of the dialog that edits the words participants are shown for an attribute (a codebook variable), in each of the protocol’s languages.',
  },
  label: {
    id: 'architect.codebook.variableLabelDialog.label',
    defaultMessage: 'Attribute label',
    description:
      'Label of the field holding the words participants are shown for an attribute, as opposed to the attribute name the researcher and the exported data use.',
  },
  hint: {
    id: 'architect.codebook.variableLabelDialog.hint',
    defaultMessage:
      'The words participants are shown for the attribute “{name}”.',
    description:
      'Hint under the attribute label field. name is the attribute’s name, which the researcher and the exported data use and which stays the same in every language.',
  },
});

const isLabel = (value: unknown): value is LocalizedString =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((text) => typeof text === 'string');

type VariableLabelDialogProps = {
  /** The attribute whose label is edited. The dialog is closed while unset. */
  variable: string | undefined;
  onClose: () => void;
  finalFocus?: DialogFormProps['finalFocus'];
};

const VariableLabelDialog = ({
  variable,
  onClose,
  finalFocus,
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
      if (variable === undefined || !isLabel(label)) return;
      try {
        await dispatch(updateVariableByUUID(variable, { label })).unwrap();
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
      finalFocus={finalFocus}
    >
      <LabelField
        name="label"
        label={intl.formatMessage(messages.label)}
        hint={intl.formatMessage(messages.hint, { name: definition.name })}
        initialValue={definition.label}
      />
    </DialogForm>
  );
};

export default VariableLabelDialog;
