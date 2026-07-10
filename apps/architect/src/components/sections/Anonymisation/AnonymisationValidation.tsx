import { createSelector } from '@reduxjs/toolkit';
import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import Validations from '~/components/Validations';
import { useAppDispatch } from '~/ducks/hooks';
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
          Add one or more validation rules for the passphrase.
        </Paragraph>
      }
      startExpanded={!!hasValidation}
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
