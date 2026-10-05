'use client';

import { useMemo } from 'react';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import { useFieldNamespacePath } from '@codaco/fresco-ui/form/FieldNamespace';

import useProtocolForm from '../../../forms/useProtocolForm';
import { useStageSelector } from '../../../hooks/useStageSelector';
import {
  getNodeForm,
  getNodeLabelVariable,
  getNodeType,
} from '../utils/nodeUtils';
import { PERSON_ATTRIBUTES_KEY } from './wizards/transforms/personAttributes';

type PedigreeNodeFormFieldsProps = {
  currentEntityId?: string;
  initialValues?: Record<string, FieldValue>;
};

/**
 * Render the protocol-authored fields collected for one pedigree member. Must
 * be placed inside that member's FieldNamespace, beside its interface-owned
 * controls.
 *
 * The fields register under PERSON_ATTRIBUTES_KEY, so no codebook variable ID
 * can alias one of the member's controls. The interface-owned label control
 * registers as the member's `name`, outside that namespace, so comparison
 * rules that reference the configured label variable are aliased to its form
 * path to stay current with the participant's answer.
 */
export default function PedigreeNodeFormFields({
  currentEntityId,
  initialValues,
}: PedigreeNodeFormFieldsProps) {
  const nodeType = useStageSelector(getNodeType);
  const nodeForm = useStageSelector(getNodeForm);
  const nodeLabelVariable = useStageSelector(getNodeLabelVariable);
  const personPath = useFieldNamespacePath();
  const formValueAliases = useMemo(
    () => ({ [nodeLabelVariable]: [...personPath, 'name'] }),
    [nodeLabelVariable, personPath],
  );

  const { fieldComponents } = useProtocolForm({
    subject: {
      entity: 'node',
      type: nodeType,
    },
    fields: nodeForm ?? [],
    initialValues,
    currentEntityId,
    namespace: PERSON_ATTRIBUTES_KEY,
    formValueAliases,
  });

  return fieldComponents;
}
