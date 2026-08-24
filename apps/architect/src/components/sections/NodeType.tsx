// Screen message listeners removed as part of screen system refactor
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

import Section from '../EditorLayout/Section';
import IssueAnchor from '../IssueAnchor';
import SubjectSelectField, {
  type EntitySubject,
} from './fields/SubjectSelectField';
import Filter from './Filter';
import useResetStageOnSubjectChange from './useResetStageOnSubjectChange';

type NodeTypeProps = StageEditorSectionProps & {
  withFilter?: boolean;
};
const NodeType = (props: NodeTypeProps) => {
  const { interfaceType, withFilter = false } = props;
  const initialSubject = useStageInitialValue<EntitySubject>('subject');
  // Observes the subject and resets dependent stage config when it changes.
  useResetStageOnSubjectChange(interfaceType);
  // TODO: Restore auto-selection of newly created types when type creation dialogs
  // are properly integrated with form state management
  return (
    <Section layout="vertical">
      <IssueAnchor fieldName="subject" description="Node Type" />
      <ArchitectField
        name="subject"
        entityType="node"
        label="Node type"
        hint="Select the type of node that this stage will create."
        promptBeforeChange="You attempted to change the node type of a stage that you have already configured. Before you can proceed the stage must be reset, which will remove any existing configuration. Do you want to reset the stage now?"
        component={SubjectSelectField}
        initialValue={initialSubject}
        validation={{ required: true }}
      />
      {withFilter && <Filter />}
    </Section>
  );
};
export const FilteredNodeType = (props: NodeTypeProps) => (
  <NodeType withFilter {...props} />
);
export default NodeType;
