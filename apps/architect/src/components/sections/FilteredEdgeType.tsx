import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Section from '@codaco/fresco-ui/Section';
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
const remainingMessages = defineMessages({
  youAttemptedToChangeTheEdge: {
    id: 'architect.remaining.sections.filteredEdgeType.youAttemptedToChangeTheEdge',
    defaultMessage:
      'You attempted to change the edge type of a stage that you have already configured. Before you can proceed the stage must be reset, which will remove any existing configuration. Do you want to reset the stage now?',
    description:
      'The promptBeforeChange text in components / sections / FilteredEdgeType.',
  },
});
const messages = defineMessages({
  edgeSetup: {
    id: 'architect.sections.filteredEdgeType.edgeSetup',
    defaultMessage: 'Edge setup',
    description: 'The title text in components / sections / FilteredEdgeType.',
  },
  chooseTheEdgeTypeThisStage: {
    id: 'architect.sections.filteredEdgeType.chooseTheEdgeTypeThisStage',
    defaultMessage:
      'Choose the edge type this stage uses and optionally limit which edges are available.',
    description:
      'The description text in components / sections / FilteredEdgeType.',
  },
  edgeType: {
    id: 'architect.sections.filteredEdgeType.edgeType',
    defaultMessage: 'Edge Type',
    description:
      'The description text in components / sections / FilteredEdgeType.',
  },
  edgeTypef7c60: {
    id: 'architect.sections.filteredEdgeType.edgeTypef7c60',
    defaultMessage: 'Edge type',
    description: 'The label text in components / sections / FilteredEdgeType.',
  },
});

type FilteredEdgeTypeProps = StageEditorSectionProps;

const FilteredEdgeType = (props: FilteredEdgeTypeProps) => {
  const intl = useAppIntl();
  const { interfaceType } = props;
  const initialSubject = useStageInitialValue<EntitySubject>('subject');

  // Observes the subject and resets dependent stage config when it changes.
  useResetStageOnSubjectChange(interfaceType);

  // TODO: Restore auto-selection of newly created types when type creation dialogs
  // are properly integrated with form state management

  return (
    <Section
      title={intl.formatMessage(messages.edgeSetup)}
      description={intl.formatMessage(messages.chooseTheEdgeTypeThisStage)}
    >
      <IssueAnchor
        fieldName="subject"
        description={intl.formatMessage(messages.edgeType)}
      />
      <ArchitectField
        name="subject"
        entityType="edge"
        promptBeforeChange={intl.formatMessage(
          remainingMessages.youAttemptedToChangeTheEdge,
        )}
        component={SubjectSelectField}
        initialValue={initialSubject}
        validation={{ required: true }}
        label={intl.formatMessage(messages.edgeTypef7c60)}
      />
      <Filter />
    </Section>
  );
};

export default FilteredEdgeType;
