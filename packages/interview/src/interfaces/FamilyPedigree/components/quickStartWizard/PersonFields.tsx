'use client';

import Field from '@codaco/fresco-ui/form/Field/Field';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import { type BIOLOGICAL_SEX_VALUES } from '@codaco/shared-consts';
import useProtocolForm from '~/forms/useProtocolForm';
import { useStageSelector } from '~/hooks/useStageSelector';
import {
  getNodeForm,
  getNodeType,
} from '~/interfaces/FamilyPedigree/utils/nodeUtils';

const BIOLOGICAL_SEX_OPTIONS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'intersex', label: 'Intersex' },
  { value: 'unknown', label: 'Unknown' },
] as const satisfies {
  value: (typeof BIOLOGICAL_SEX_VALUES)[number];
  label: string;
}[];

type PersonFieldsProps = {
  namespace?: string;
  initial?: {
    name?: string;
    /** Initial values for custom protocol form fields, keyed by variable ID. */
    attributes?: Record<string, unknown>;
  };
  namePlaceholder?: string;
  /**
   * When true (default), a "Biological sex" radio group is rendered. Pass
   * false for egg/sperm gamete-parent creations — their sex is derived from
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
      {askBiologicalSex && (
        <Field
          name="biologicalSex"
          label="Biological sex"
          component={RadioGroupField}
          options={BIOLOGICAL_SEX_OPTIONS}
          hint="Leave unanswered if not known"
        />
      )}
      {fieldComponents}
    </>
  );

  if (namespace) {
    return <FieldNamespace prefix={namespace}>{content}</FieldNamespace>;
  }

  return content;
}
