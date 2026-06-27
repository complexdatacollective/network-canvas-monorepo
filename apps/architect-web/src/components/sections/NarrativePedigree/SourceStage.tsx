import { useSelector } from 'react-redux';
import { Field } from 'redux-form';

import { Row, Section } from '~/components/EditorLayout';
import Select from '~/components/Form/Fields/Select';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import type { RootState } from '~/ducks/store';
import { getStageList } from '~/selectors/protocol';

const SourceStage = (_props: StageEditorSectionProps) => {
  const familyPedigreeStages = useSelector((state: RootState) =>
    getStageList(state).filter((stage) => stage.type === 'FamilyPedigree'),
  );

  const options = familyPedigreeStages.map((stage) => ({
    value: stage.id,
    label: stage.label,
  }));

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
