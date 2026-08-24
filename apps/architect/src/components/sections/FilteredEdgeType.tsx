import { Section } from '~/components/EditorLayout';
// Screen message listeners removed as part of screen system refactor
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

import IssueAnchor from '../IssueAnchor';
import SubjectSelectField, {
  type EntitySubject,
} from './fields/SubjectSelectField';
import Filter from './Filter';
import useResetStageOnSubjectChange from './useResetStageOnSubjectChange';

type FilteredEdgeTypeProps = StageEditorSectionProps;

const FilteredEdgeType = (props: FilteredEdgeTypeProps) => {
  const { interfaceType } = props;
  const initialSubject = useStageInitialValue<EntitySubject>('subject');

  // Observes the subject and resets dependent stage config when it changes.
  useResetStageOnSubjectChange(interfaceType);

  // TODO: Restore auto-selection of newly created types when type creation dialogs
  // are properly integrated with form state management

  return (
    <Section layout="vertical">
      <IssueAnchor fieldName="subject" description="Edge Type" />
      <ArchitectField
        name="subject"
        entityType="edge"
        promptBeforeChange="You attempted to change the edge type of a stage that you have already configured. Before you can proceed the stage must be reset, which will remove any existing configuration. Do you want to reset the stage now?"
        component={SubjectSelectField}
        initialValue={initialSubject}
        validation={{ required: true }}
        label="Edge type"
      />
      <Filter />
    </Section>
  );
};

export default FilteredEdgeType;
