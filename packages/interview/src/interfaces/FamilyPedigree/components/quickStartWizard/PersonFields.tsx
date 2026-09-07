'use client';

import { useAppIntl } from '@codaco/app-i18n/react';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import type { BiologicalSex } from '@codaco/protocol-validation';

import usePedigreeNodeForm from '../../hooks/usePedigreeNodeForm';
import { messages } from '../../messages';
import BiologicalSexField from '../BiologicalSexField';
import PersonNameField from '../PersonNameField';

type PersonFieldsProps = {
  namespace?: string;
  initial?: {
    name?: string;
    biologicalSex?: BiologicalSex;
    /** Initial values for custom protocol form fields, keyed by variable ID. */
    attributes?: Record<string, unknown>;
  };
  namePlaceholder?: string;
  currentEntityId?: string;
};

export default function PersonFields({
  namespace,
  initial,
  namePlaceholder,
  currentEntityId,
}: PersonFieldsProps) {
  const intl = useAppIntl();
  const { fieldComponents } = usePedigreeNodeForm({
    initialValues: initial?.attributes as
      | Record<string, FieldValue>
      | undefined,
    currentEntityId,
  });

  const content = (
    <>
      <PersonNameField
        label={intl.formatMessage(messages.name)}
        placeholder={namePlaceholder ?? intl.formatMessage(messages.enterName)}
        hint={intl.formatMessage(messages.unknownNameHint)}
        initialValue={initial?.name ?? ''}
        currentEntityId={currentEntityId}
      />
      <BiologicalSexField
        subject="other"
        initialValue={
          initial === undefined
            ? undefined
            : (initial.biologicalSex ?? 'unknown')
        }
      />
      {fieldComponents}
    </>
  );

  if (namespace) {
    return <FieldNamespace prefix={namespace}>{content}</FieldNamespace>;
  }

  return content;
}
