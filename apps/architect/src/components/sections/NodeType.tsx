import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
// Screen message listeners removed as part of screen system refactor
import Section from '@codaco/fresco-ui/Section';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

import IssueAnchor from '../IssueAnchor';
import SubjectSelectField, {
  type EntitySubject,
} from './fields/SubjectSelectField';
import Filter from './Filter';
import useResetStageOnSubjectChange from './useResetStageOnSubjectChange';
const remainingMessages = defineMessages({
  youAttemptedToChangeTheNode: {
    id: 'architect.remaining.sections.nodeType.youAttemptedToChangeTheNode',
    defaultMessage:
      'You attempted to change the node type of a stage that you have already configured. Before you can proceed the stage must be reset, which will remove any existing configuration. Do you want to reset the stage now?',
    description:
      'The promptBeforeChange text in components / sections / NodeType.',
  },
});
const messages = defineMessages({
  nodeSetup: {
    id: 'architect.sections.nodeType.nodeSetup',
    defaultMessage: 'Node setup',
    description: 'The title text in components / sections / NodeType.',
  },
  chooseTheNodeTypeThisStage: {
    id: 'architect.sections.nodeType.chooseTheNodeTypeThisStage',
    defaultMessage:
      'Choose the node type this stage creates and optionally limit which nodes are available.',
    description: 'The description text in components / sections / NodeType.',
  },
  nodeType: {
    id: 'architect.sections.nodeType.nodeType',
    defaultMessage: 'Node Type',
    description: 'The description text in components / sections / NodeType.',
  },
  nodeType78192: {
    id: 'architect.sections.nodeType.nodeType78192',
    defaultMessage: 'Node type',
    description: 'The label text in components / sections / NodeType.',
  },
  selectTheTypeOfNodeThat: {
    id: 'architect.sections.nodeType.selectTheTypeOfNodeThat',
    defaultMessage: 'Select the type of node that this stage will create.',
    description: 'The hint text in components / sections / NodeType.',
  },
});

type NodeTypeProps = StageEditorSectionProps & {
  withFilter?: boolean;
};
const NodeType = (props: NodeTypeProps) => {
  const intl = useAppIntl();
  const { interfaceType, withFilter = false } = props;
  const initialSubject = useStageInitialValue<EntitySubject>('subject');
  // Observes the subject and resets dependent stage config when it changes.
  useResetStageOnSubjectChange(interfaceType);
  // TODO: Restore auto-selection of newly created types when type creation dialogs
  // are properly integrated with form state management
  return (
    <Section
      title={intl.formatMessage(messages.nodeSetup)}
      description={intl.formatMessage(messages.chooseTheNodeTypeThisStage)}
    >
      <IssueAnchor
        fieldName="subject"
        description={intl.formatMessage(messages.nodeType)}
      />
      <ArchitectField
        name="subject"
        entityType="node"
        label={intl.formatMessage(messages.nodeType78192)}
        hint={intl.formatMessage(messages.selectTheTypeOfNodeThat)}
        promptBeforeChange={intl.formatMessage(
          remainingMessages.youAttemptedToChangeTheNode,
        )}
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
