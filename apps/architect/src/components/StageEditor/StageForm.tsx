import { LayoutGroup } from 'motion/react';
import { type ReactNode, useCallback, useId } from 'react';

import FormErrorsList from '@codaco/fresco-ui/form/FormErrors';
import { useForm } from '@codaco/fresco-ui/form/hooks/useForm';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmitHandler } from '@codaco/fresco-ui/form/store/types';
import { focusFirstError } from '@codaco/fresco-ui/form/utils/focusFirstError';
import type { Stage, StageType } from '@codaco/protocol-validation';
import { cx } from '~/utils/cva';

import StageFormBridge from './StageFormBridge';
import { useStageFormContext } from './stageFormContext';

/**
 * DOM id of the stage editor's form element. Kept as the historical name
 * because e2e selectors and the dialog form ids derived from it
 * (`${STAGE_FORM_ID}-${arrayName}-item-editor`) depend on the exact string.
 */
export const STAGE_FORM_ID = 'edit-stage';

type StageFormElementProps = {
  onSubmit: FormSubmitHandler;
  children: ReactNode;
  className?: string;
};

/**
 * Composes fresco-ui's `useForm` directly rather than using
 * `FormWithoutProvider`, which hardcodes its invalid-submit handler: the stage
 * editor also has to record that a submit was attempted, because the Issues
 * panel only surfaces validation errors after a failed submit.
 */
const StageFormElement = ({
  onSubmit,
  children,
  className,
}: StageFormElementProps) => {
  const { formId, markSubmitFailed, clearSubmitFailed } = useStageFormContext();

  const handleSubmit = useCallback<FormSubmitHandler>(
    async (values) => {
      const result = await onSubmit(values);
      if (result.success) {
        clearSubmitFailed();
      }
      return result;
    },
    [clearSubmitFailed, onSubmit],
  );

  const { formProps, formErrors } = useForm({
    onSubmit: handleSubmit,
    onSubmitInvalid: (errors) => {
      markSubmitFailed();
      focusFirstError(errors);
    },
  });

  const layoutGroupId = useId();

  return (
    <form
      id={formId}
      noValidate // Don't show native HTML validation UI
      className={cx('h-full w-full flex-1', className)}
      onSubmit={formProps.onSubmit}
    >
      <LayoutGroup id={layoutGroupId}>
        {formErrors && <FormErrorsList key="form-errors" errors={formErrors} />}
        {children}
      </LayoutGroup>
    </form>
  );
};

type StageFormProps = {
  /** Id of the stage being edited; null while creating a new stage. */
  stageId: string | null;
  interfaceType: StageType;
  /**
   * Committed values for this stage (the persisted stage, or the interface
   * template for a new one). Must be referentially stable: it seeds the draft
   * baseline and every field's `initialValue`.
   */
  committedStage: Stage | null;
  onSubmit: FormSubmitHandler;
  children: ReactNode;
  className?: string;
};

/**
 * The stage editor's form. fresco-ui has no `enableReinitialize`, so switching
 * stages remounts the store provider via its `key` instead.
 */
const StageForm = ({
  stageId,
  interfaceType,
  committedStage,
  onSubmit,
  children,
  className,
}: StageFormProps) => (
  <FormStoreProvider key={stageId ?? `new-${interfaceType}`}>
    <StageFormBridge
      committedStage={committedStage}
      stageId={stageId}
      formId={STAGE_FORM_ID}
    >
      <StageFormElement onSubmit={onSubmit} className={className}>
        {children}
      </StageFormElement>
    </StageFormBridge>
  </FormStoreProvider>
);

export default StageForm;
