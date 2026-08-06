'use client';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import type { BiologicalSex } from '@codaco/shared-consts';

import useProtocolForm from '../../../../forms/useProtocolForm';
import { useStageSelector } from '../../../../hooks/useStageSelector';
import { getNodeForm, getNodeType } from '../../utils/nodeUtils';
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
  namePlaceholder = 'Enter name',
  currentEntityId,
}: PersonFieldsProps) {
  const nodeType = useStageSelector(getNodeType);
  const nodeForm = useStageSelector(getNodeForm);

  const { fieldComponents } = useProtocolForm({
    subject: {
      entity: 'node',
      type: nodeType,
    },
    fields: nodeForm ?? [],
    initialValues: initial?.attributes as
      | Record<string, FieldValue>
      | undefined,
  });

  const content = (
    <>
      <PersonNameField
        label="Name"
        placeholder={namePlaceholder}
        hint="Leave blank if the name is not known"
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
