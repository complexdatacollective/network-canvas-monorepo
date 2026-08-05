import { createSelector } from '@reduxjs/toolkit';
import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { change, formValueSelector, getFormSyncErrors } from 'redux-form';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import Validations from '~/components/Validations';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/modules/root';
import useLatchedExpansion from '~/hooks/useLatchedExpansion';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const AnonymisationValidation = ({ form }: StageEditorSectionProps) => {
  const dispatch = useAppDispatch();
  // Create memoized selector for hasValidation
  const hasValidationSelector = useMemo(() => {
    const formSelector = formValueSelector(form);
    return createSelector(
      [(state) => formSelector(state, 'validation')],
      (validation) => validation && Object.keys(validation).length > 0,
    );
  }, [form]);
  const hasValidation = useSelector(hasValidationSelector);
  const startExpanded = useLatchedExpansion(!!hasValidation);
  // Audit sweep: the shape ValidationSection was already fixed for. A
  // collapsed toggleable Section unmounts its children, and redux-form only
  // fails a submit over errors on REGISTERED fields — so a sync error keyed
  // at `validation` while this section is shut would neither block the save
  // nor be visible. This form ships no such validate today, which makes the
  // section accidentally safe rather than correct; forcing it open while the
  // error stands closes the class.
  const hasValidationSyncError = useSelector((state: RootState) => {
    const syncErrors: unknown = getFormSyncErrors(form)(state);
    return isRecord(syncErrors) && typeof syncErrors.validation === 'string';
  });
  const handleToggleValidation = (nextState: boolean) => {
    if (!nextState) {
      dispatch(change(form, 'validation', null));
    }
    return true;
  };
  return (
    <Section
      toggleable
      title="Passphrase Validation"
      summary={
        <Paragraph>
          Choose which validation rules apply to the passphrase.
        </Paragraph>
      }
      startExpanded={startExpanded}
      forceExpanded={hasValidationSyncError}
      handleToggleChange={handleToggleValidation}
    >
      <Row>
        <Validations
          form={form}
          name="validation"
          variableType="passphrase"
          entity="ego"
        />
      </Row>
    </Section>
  );
};
export default AnonymisationValidation;
