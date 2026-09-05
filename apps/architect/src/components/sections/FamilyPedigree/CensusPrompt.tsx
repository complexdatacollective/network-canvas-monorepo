import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import RichText from '@codaco/protocol-builder/fields/RichTextField';
import ArchitectField from '~/components/Form/ArchitectField';
import IssueAnchor from '~/components/IssueAnchor';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';
const messages = defineMessages({
  familyBuildingPrompt: {
    id: 'architect.sections.familyPedigree.censusPrompt.familyBuildingPrompt',
    defaultMessage: 'Family-building prompt',
    description:
      'The title text in components / sections / FamilyPedigree / CensusPrompt.',
  },
  censusPrompt: {
    id: 'architect.sections.familyPedigree.censusPrompt.censusPrompt',
    defaultMessage: 'Census prompt',
    description:
      'The description text in components / sections / FamilyPedigree / CensusPrompt.',
  },
  configureThePromptShownToParticipants: {
    id: 'architect.sections.familyPedigree.censusPrompt.configureThePromptShownToParticipants',
    defaultMessage:
      'Configure the prompt shown to participants during the family building phase.',
    description:
      'Visible text in components / sections / FamilyPedigree / CensusPrompt.',
  },
});

const CensusPrompt = (_props: StageEditorSectionProps) => {
  const intl = useAppIntl();
  const initialValue = useStageInitialValue<string>('censusPrompt');

  return (
    <Section title={intl.formatMessage(messages.familyBuildingPrompt)}>
      <IssueAnchor
        fieldName="censusPrompt"
        description={intl.formatMessage(messages.censusPrompt)}
      />
      <ArchitectField
        name="censusPrompt"
        component={RichText}
        label={intl.formatMessage(messages.censusPrompt)}
        hint={
          <Paragraph>
            {intl.formatMessage(messages.configureThePromptShownToParticipants)}
          </Paragraph>
        }
        initialValue={initialValue}
        validation={{ required: true }}
      />
    </Section>
  );
};
export default CensusPrompt;
