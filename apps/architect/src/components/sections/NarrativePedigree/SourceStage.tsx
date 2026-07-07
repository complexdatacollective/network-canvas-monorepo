import type { UnknownAction } from '@reduxjs/toolkit';
import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { change, Field } from 'redux-form';

import { Row, Section } from '~/components/EditorLayout';
import Select from '~/components/Form/Fields/Select';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/store';
import { getStageList } from '~/selectors/protocol';

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
        <p>
          Select the Family Pedigree stage whose network data this Narrative
          Pedigree will visualize. Only Family Pedigree stages are listed here.
        </p>
      }
    >
      <Row>
        <Field
          name="sourceStageId"
          component={Select}
          onChange={handleSourceStageChange}
          label="Family Pedigree stage"
          placeholder="Select a Family Pedigree stage..."
          options={options}
          isDisabled={options.length === 0}
        />
      </Row>
    </Section>
  );
};

export default SourceStage;
