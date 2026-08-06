import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';

import useProtocolForm from '../../../forms/useProtocolForm';
import { useStageSelector } from '../../../hooks/useStageSelector';
import {
  getNodeForm,
  getNodeLabelVariable,
  getNodeType,
} from '../utils/nodeUtils';

type PedigreeNodeFormOptions = {
  currentEntityId?: string;
  initialValues?: Record<string, FieldValue>;
};

/**
 * Render the protocol-authored fields collected for one pedigree member.
 *
 * The interface-owned label control registers as `name` because the wizards'
 * transforms consume that stable internal shape. Other codebook fields still
 * reference the configured label variable ID, so alias those references back
 * to the live control. This keeps comparison validation prompt-current without
 * adding the label variable to the submitted wizard values a second time.
 */
export default function usePedigreeNodeForm({
  currentEntityId,
  initialValues,
}: PedigreeNodeFormOptions = {}) {
  const nodeType = useStageSelector(getNodeType);
  const nodeForm = useStageSelector(getNodeForm);
  const nodeLabelVariable = useStageSelector(getNodeLabelVariable);

  return useProtocolForm({
    subject: {
      entity: 'node',
      type: nodeType,
    },
    fields: nodeForm ?? [],
    initialValues,
    currentEntityId,
    variableReferenceAliases: { [nodeLabelVariable]: 'name' },
  });
}
