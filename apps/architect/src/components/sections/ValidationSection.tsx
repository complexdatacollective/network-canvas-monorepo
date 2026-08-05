import type { UnknownAction } from '@reduxjs/toolkit';
import { createSelector } from '@reduxjs/toolkit';
import { get, pickBy } from 'es-toolkit/compat';
import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { change, formValueSelector, getFormSyncErrors } from 'redux-form';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { Variable } from '@codaco/protocol-validation';
import { Section } from '~/components/EditorLayout';
import Validations from '~/components/Validations';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/modules/root';
import useLatchedExpansion from '~/hooks/useLatchedExpansion';

import { getFieldId } from '../../utils/issues';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

type ValidationSectionProps = {
  disabled?: boolean;
  form: string;
  entity: string;
  id?: string;
  summary?: string;
  variableType?: string;
  existingVariables: Record<string, Pick<Variable, 'name' | 'type'>>;
  allVariables: Record<string, Variable>;
  currentVariableId: string;
};
const ValidationSection = ({
  disabled = false,
  form,
  entity,
  id = getFieldId('validation'),
  summary = 'Choose which validation rules apply to this form field.',
  variableType = '',
  existingVariables,
  allVariables,
  currentVariableId,
}: ValidationSectionProps) => {
  const dispatch = useAppDispatch();
  // Create memoized selector for hasValidation
  const hasValidationSelector = useMemo(() => {
    const formSelector = formValueSelector(form);
    return createSelector(
      [(state: RootState) => formSelector(state, 'validation')],
      (validation) => validation && Object.keys(validation).length > 0,
    );
  }, [form]);
  const hasValidation = useSelector(hasValidationSelector);
  const startExpanded = useLatchedExpansion(!!hasValidation);
  // Eleventh-wave Finding 3: the dialog's form-level validate
  // (makeFieldEditorValidate) keys contradiction messages at `validation`
  // even when the edited variable has no rules of its own (the target-only
  // case — editing options/parameters can break an INCOMING sameAs or
  // comparator). With no rules the section starts collapsed, so the
  // Validations field (and its FieldErrors) is unmounted — and redux-form
  // only fails a submit over errors on REGISTERED fields, so the collapsed
  // section wouldn't just hide the message, it would let the contradictory
  // save through entirely. Forcing the section open while the sync error
  // stands both registers the field (so the save is actually blocked) and
  // renders the message when that save fails.
  const hasValidationSyncError = useSelector((state: RootState) => {
    const syncErrors: unknown = getFormSyncErrors(form)(state);
    return isRecord(syncErrors) && typeof syncErrors.validation === 'string';
  });
  const handleToggleChange = (nextState: boolean) => {
    if (!nextState) {
      dispatch(change(form, 'validation', null) as UnknownAction);
    }
    return true;
  };
  const existingVariablesForType = useMemo(
    () =>
      pickBy(
        existingVariables,
        (variable) => get(variable, 'type') === variableType,
      ),
    [existingVariables, variableType],
  );
  return (
    <Section
      layout="vertical"
      id={id}
      title="Validation"
      summary={<Paragraph>{summary}</Paragraph>}
      disabled={disabled}
      toggleable
      startExpanded={startExpanded}
      forceExpanded={hasValidationSyncError}
      handleToggleChange={handleToggleChange}
    >
      <Validations
        form={form}
        name="validation"
        variableType={variableType}
        entity={entity}
        existingVariables={existingVariablesForType}
        allVariables={allVariables}
        currentVariableId={currentVariableId}
      />
    </Section>
  );
};
export default ValidationSection;
