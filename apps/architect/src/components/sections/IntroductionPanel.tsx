import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Section from '@codaco/fresco-ui/Section';
import RichText from '@codaco/protocol-builder/fields/RichTextField';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';
const messages = defineMessages({
  taskIntroduction: {
    id: 'architect.sections.introductionPanel.taskIntroduction',
    defaultMessage: 'Task introduction',
    description: 'The title text in components / sections / IntroductionPanel.',
  },
  introduceTheTaskBeforeParticipantsComplete: {
    id: 'architect.sections.introductionPanel.introduceTheTaskBeforeParticipantsComplete',
    defaultMessage:
      'Introduce the task before participants complete its forms.',
    description:
      'The description text in components / sections / IntroductionPanel.',
  },
  title: {
    id: 'architect.sections.introductionPanel.title',
    defaultMessage: 'Title',
    description: 'The label text in components / sections / IntroductionPanel.',
  },
  introductionText: {
    id: 'architect.sections.introductionPanel.introductionText',
    defaultMessage: 'Introduction text',
    description: 'The label text in components / sections / IntroductionPanel.',
  },
});

const IntroductionPanel = (_props: StageEditorSectionProps) => {
  const intl = useAppIntl();
  const titleInitialValue = useStageInitialValue<string>(
    'introductionPanel.title',
  );
  const textInitialValue = useStageInitialValue<string>(
    'introductionPanel.text',
  );

  return (
    <Section
      title={intl.formatMessage(messages.taskIntroduction)}
      description={intl.formatMessage(
        messages.introduceTheTaskBeforeParticipantsComplete,
      )}
    >
      <ArchitectField
        name="introductionPanel.title"
        label={intl.formatMessage(messages.title)}
        component={InputField}
        validation={{ required: true, maxLength: 50 }}
        initialValue={titleInitialValue}
      />
      <ArchitectField
        name="introductionPanel.text"
        component={RichText}
        label={intl.formatMessage(messages.introductionText)}
        validation={{ required: true }}
        initialValue={textInitialValue}
      />
    </Section>
  );
};
export default IntroductionPanel;
