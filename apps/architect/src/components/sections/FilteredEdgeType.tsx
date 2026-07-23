import { get } from 'es-toolkit/compat';

import { Row, Section } from '~/components/EditorLayout';
// Screen message listeners removed as part of screen system refactor
import ValidatedField from '~/components/Form/ValidatedField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import IssueAnchor from '../IssueAnchor';
import EntitySelectField from './fields/EntitySelectField/EntitySelectField';
import Filter from './Filter';
import useResetStageOnSubjectChange from './useResetStageOnSubjectChange';

type FilteredEdgeTypeProps = StageEditorSectionProps;

const FilteredEdgeType = (props: FilteredEdgeTypeProps) => {
  const { form, interfaceType } = props;

  const handleResetStage = useResetStageOnSubjectChange(form, interfaceType);

  // TODO: Restore auto-selection of newly created types when type creation dialogs
  // are properly integrated with form state management

  return (
    <Section title="Edge Type">
      <Row>
        <IssueAnchor fieldName="subject" description="Edge Type" />
        <ValidatedField
          name="subject"
          entityType="edge"
          promptBeforeChange="You attempted to change the edge type of a stage that you have already configured. Before you can proceed the stage must be reset, which will remove any existing configuration. Do you want to reset the stage now?"
          component={EntitySelectField}
          onChange={handleResetStage}
          parse={(value) =>
            value == null ? value : { type: value, entity: 'edge' }
          }
          format={(value) => get(value, 'type')}
          validation={{ required: true }}
          label="Edge type"
          labelHidden
        />
      </Row>
      <Filter />
    </Section>
  );
};

export default FilteredEdgeType;
