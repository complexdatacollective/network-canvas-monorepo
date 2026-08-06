import { useContext, useMemo, type ReactNode } from 'react';
import { useSelector } from 'react-redux';
import { z } from 'zod/mini';

import { WizardContext } from '@codaco/fresco-ui/dialogs/useWizard';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import type {
  CustomFieldValidation,
  ValidationContext,
} from '@codaco/fresco-ui/form/store/types';

import { useStageSelector } from '../../../hooks/useStageSelector';
import {
  getValidationContext,
  selectValidationMetadataForVariable,
  validationPropsFor,
} from '../../../selectors/forms';
import { getCodebook } from '../../../store/modules/protocol';
import { useFamilyPedigreeStore } from '../FamilyPedigreeContext';
import { getNodeLabelVariable, getNodeType } from '../utils/nodeUtils';

type PersonNameFieldProps = {
  autoFocus?: boolean;
  currentEntityId?: string;
  hint?: ReactNode;
  initialValue?: string;
  label: string;
  placeholder?: string;
};

function countPendingNames(value: unknown, target: string): number {
  if (Array.isArray(value)) {
    return value.reduce<number>(
      (count, item) => count + countPendingNames(item, target),
      0,
    );
  }
  if (typeof value !== 'object' || value === null) return 0;

  return Object.entries(value).reduce((count, [key, item]) => {
    const ownMatch = key === 'name' && item === target ? 1 : 0;
    return count + ownMatch + countPendingNames(item, target);
  }, 0);
}

/**
 * The pedigree's label control is a real codebook-backed field even though its
 * submitted form key remains the wizard's internal `name` key. Resolve and
 * apply the selected variable's validation rules exactly as the shared form
 * renderer does.
 */
export default function PersonNameField({
  autoFocus,
  currentEntityId,
  hint,
  initialValue,
  label,
  placeholder,
}: PersonNameFieldProps) {
  const nodeType = useStageSelector(getNodeType);
  const nodeLabelVariable = useStageSelector(getNodeLabelVariable);
  const codebook = useSelector(getCodebook);
  const pedigreeNodes = useFamilyPedigreeStore((state) => state.network.nodes);
  const baseValidationContext = useStageSelector(getValidationContext);
  const getActiveFormValues = useFormStore(
    (state) => state.getActiveFormValues,
  );
  const wizardContext = useContext(WizardContext);

  const nodeVariables = codebook.node?.[nodeType]?.variables ?? {};
  const validationMetadata = selectValidationMetadataForVariable(
    nodeVariables,
    nodeLabelVariable,
  );
  const validationProps = validationMetadata
    ? validationPropsFor(validationMetadata)
    : {};
  const pendingUniqueValidation: CustomFieldValidation | undefined =
    validationProps.unique !== undefined
      ? {
          hint: 'Must also be unique within this family setup.',
          schema: () =>
            z.unknown().check(
              z.superRefine((value, ctx) => {
                if (
                  typeof value === 'string' &&
                  value.trim().length > 0 &&
                  countPendingNames(
                    [
                      ...Object.values(
                        wizardContext?.completedStepValues ?? {},
                      ),
                      getActiveFormValues(),
                    ],
                    value,
                  ) > 1
                ) {
                  ctx.addIssue({
                    code: 'custom',
                    message: 'This value is used elsewhere. It must be unique.',
                  });
                }
              }),
            ),
        }
      : undefined;

  // Newly added pedigree members live in the interface's local store until
  // the stage is finalized. Include them in the validation network so rules
  // such as `unique` see the in-progress family as well as nodes already in
  // the interview network. currentEntityId prevents an edit from conflicting
  // with the node's own existing value.
  const validationContext = useMemo<ValidationContext>(() => {
    const localIds = new Set(pedigreeNodes.keys());
    return {
      ...baseValidationContext,
      stageSubject: { entity: 'node', type: nodeType },
      ...(currentEntityId !== undefined ? { currentEntityId } : {}),
      network: {
        ...baseValidationContext.network,
        nodes: [
          ...baseValidationContext.network.nodes.filter(
            (node) => !localIds.has(node._uid),
          ),
          ...pedigreeNodes.values(),
        ],
      },
    };
  }, [baseValidationContext, currentEntityId, nodeType, pedigreeNodes]);

  return (
    <Field
      name="name"
      label={label}
      component={InputField}
      placeholder={placeholder}
      hint={validationProps.required === true ? undefined : hint}
      initialValue={initialValue}
      autoFocus={autoFocus}
      showValidationHints
      {...validationProps}
      custom={pendingUniqueValidation}
      validationContext={validationContext}
    />
  );
}
