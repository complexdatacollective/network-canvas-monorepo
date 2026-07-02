'use client';

import Field from '@codaco/fresco-ui/form/Field/Field';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import useProtocolForm from '~/forms/useProtocolForm';
import { useStageSelector } from '~/hooks/useStageSelector';
import {
  getNodeForm,
  getNodeType,
} from '~/interfaces/FamilyPedigree/utils/nodeUtils';

import BiologicalSexField from '../BiologicalSexField';

type PersonFieldsProps = {
  namespace?: string;
  initial?: {
    name?: string;
    /** Initial values for custom protocol form fields, keyed by variable ID. */
    attributes?: Record<string, unknown>;
  };
  namePlaceholder?: string;
  /**
   * When true (default), the biological-sex question is rendered. Pass false
   * for egg/sperm gamete-parent creations — their sex is derived from
   * gameteRole and should not be asked separately.
   */
  askBiologicalSex?: boolean;
};

export default function PersonFields({
  namespace,
  initial,
  namePlaceholder = 'Enter name',
  askBiologicalSex = true,
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
      <Field
        name="name"
        label="Name"
        component={InputField}
        placeholder={namePlaceholder}
        hint="Leave blank if the name is not known"
        initialValue={initial?.name ?? ''}
      />
      {askBiologicalSex && <BiologicalSexField subject="other" />}
      {fieldComponents}
    </>
  );

  if (namespace) {
    return <FieldNamespace prefix={namespace}>{content}</FieldNamespace>;
  }

  return content;
}
