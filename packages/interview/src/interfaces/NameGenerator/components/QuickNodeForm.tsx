import { motion, type Variants } from 'motion/react';
import { useCallback } from 'react';

import Form from '@codaco/fresco-ui/form/Form';
import type {
  FormSubmitHandler,
  ValidationContext,
} from '@codaco/fresco-ui/form/store/types';
import { asEntityAttributeReference } from '@codaco/protocol-validation';
import type { EntityAttributesProperty, NcNode } from '@codaco/shared-consts';

import { useStageSelector } from '../../../hooks/useStageSelector';
import {
  getValidationContext,
  selectFieldMetadataFromVariables,
  validationPropsFor,
} from '../../../selectors/forms';
import { getCodebookVariablesForSubjectType } from '../../../selectors/protocol';
import { getPromptAdditionalAttributes } from '../../../selectors/session';
import QuickAddField from './QuickAddField';

const containerVariants: Variants = {
  animate: {
    y: 0,
    opacity: 1,
    transition: {
      when: 'beforeChildren',
    },
  },
  initial: {
    y: '100%',
    opacity: 0,
    transition: {
      when: 'afterChildren',
    },
  },
};

type QuickNodeFormProps = {
  disabled: boolean;
  targetVariable: string;
  onShowForm?: () => void;
  addNode: (attributes: NcNode[EntityAttributesProperty]) => Promise<void>;
};

const QuickNodeForm = ({
  disabled,
  targetVariable,
  onShowForm,
  addNode,
}: QuickNodeFormProps) => {
  const newNodeAttributes = useStageSelector(getPromptAdditionalAttributes);

  // Derive the target variable's validation props from its codebook
  // definition, exactly as useProtocolForm does for form fields — quick-add
  // is a validated writer, not a special case. A variable with no validation
  // rules renders a genuinely optional field, and an empty submission creates
  // the node (no runtime fallback to required).
  const stageVariables = useStageSelector(getCodebookVariablesForSubjectType);
  const targetVariableDefinition = stageVariables[targetVariable];
  const [targetFieldMetadata] = targetVariableDefinition
    ? selectFieldMetadataFromVariables(stageVariables, [
        {
          variable: asEntityAttributeReference(targetVariable),
          prompt: '',
        },
      ])
    : [];
  const validationProps = targetFieldMetadata
    ? validationPropsFor(targetFieldMetadata)
    : {};

  // Context-dependent rules (unique, sameAs, differentFrom,
  // greaterThanVariable, etc.) resolve against the live network and this
  // stage's subject — mirror useProtocolForm's ValidationContext. Quick-add
  // only ever creates a new node, so — exactly like NodeForm's new-node case,
  // where `currentEntityId` is `selectedNode?.[entityPrimaryKeyProperty]` and
  // therefore undefined — currentEntityId is omitted: there is no entity yet
  // to scope `unique` exclusions or sibling comparisons to.
  // stageSubject is only ever null for stage types that carry no subject at
  // all (Information/Anonymisation/FamilyPedigree/NarrativePedigree);
  // NameGenerator always has a node subject, so the undefined fallback here
  // is defensive only, matching the "Missing codebook entry" guard above.
  const baseValidationContext = useStageSelector(getValidationContext);
  const validationContext: ValidationContext | undefined =
    baseValidationContext.stageSubject
      ? {
          codebook: baseValidationContext.codebook,
          network: baseValidationContext.network,
          stageSubject: baseValidationContext.stageSubject,
        }
      : undefined;

  const handleSubmit: FormSubmitHandler = useCallback(
    async (values) => {
      const value = values as Record<string, unknown>;
      if (disabled) {
        return {
          success: false,
          errors: {
            form: ['Form is disabled'],
          },
        };
      }

      await addNode({
        ...newNodeAttributes,
        [targetVariable]: value[targetVariable] as string,
      });

      return {
        success: true,
      };
    },
    [disabled, addNode, newNodeAttributes, targetVariable],
  );

  return (
    <>
      <div className="pointer-events-none absolute right-0 bottom-0 z-10 h-48 w-xl bg-[radial-gradient(ellipse_at_bottom_right,oklch(from_var(--background)_calc(l-0.1)_c_h),transparent_70%)]" />
      <motion.div
        className="absolute right-12 bottom-4 z-20"
        variants={containerVariants}
        initial="initial"
        animate="animate"
        layout
        data-testid="quick-add-form"
      >
        <Form onSubmit={handleSubmit}>
          <QuickAddField
            name={targetVariable}
            disabled={disabled}
            placeholder="Type a label and press enter..."
            onShowInput={onShowForm ?? undefined}
            {...validationProps}
            validationContext={validationContext}
          />
        </Form>
      </motion.div>
    </>
  );
};

export default QuickNodeForm;
