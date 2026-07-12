import type { UnknownAction } from '@reduxjs/toolkit';
import type { ComponentType } from 'react';
import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { change, Field } from 'redux-form';

import StyledSelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import FrescoReduxField from '~/components/Form/FrescoReduxField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/store';
import { getStageList } from '~/selectors/protocol';

const FrescoStyledSelectField = StyledSelectField as ComponentType<
  Record<string, unknown>
>;

const SourceStage = ({ form }: StageEditorSectionProps) => {
  const dispatch = useAppDispatch();
  const familyPedigreeStages = useSelector((state: RootState) =>
    getStageList(state).filter((stage) => stage.type === 'FamilyPedigree'),
  );
  const options = familyPedigreeStages.map((stage) => ({
    value: stage.id,
    label: stage.label,
  }));
  // Diseases map to boolean variables of the source stage's node type, so a
  // different source stage invalidates the existing selections. Clear them so
  // the researcher reconfigures against the new source rather than saving an
  // invalid stage that references the old node type's variables.
  const handleSourceStageChange = useCallback(
    (
      _event: unknown,
      newValue: string | undefined,
      previousValue: string | undefined,
    ) => {
      if (!previousValue || newValue === previousValue) return;
      dispatch(change(form, 'diseases', []) as UnknownAction);
    },
    [dispatch, form],
  );
  return (
    <Section
      title="Source Stage"
      summary={
        <Paragraph>
          Select the Family Pedigree stage whose network data this Narrative
          Pedigree will visualize. Only Family Pedigree stages are listed here.
        </Paragraph>
      }
    >
      <Row>
        <Field
          name="sourceStageId"
          component={FrescoReduxField}
          onChange={handleSourceStageChange}
          label="Family Pedigree stage"
          placeholder="Select a Family Pedigree stage..."
          options={options}
          disabled={options.length === 0}
          fieldComponent={FrescoStyledSelectField}
        />
      </Row>
    </Section>
  );
};
export default SourceStage;
