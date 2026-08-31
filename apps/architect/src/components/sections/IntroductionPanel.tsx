import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Section from '@codaco/fresco-ui/Section';
import RichText from '@codaco/protocol-builder/fields/RichTextField';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

const IntroductionPanel = (_props: StageEditorSectionProps) => {
  const titleInitialValue = useStageInitialValue<string>(
    'introductionPanel.title',
  );
  const textInitialValue = useStageInitialValue<string>(
    'introductionPanel.text',
  );

  return (
    <Section
      title="Task introduction"
      description="Introduce the task before participants complete its forms."
    >
      <ArchitectField
        name="introductionPanel.title"
        label="Title"
        component={InputField}
        validation={{ required: true, maxLength: 50 }}
        initialValue={titleInitialValue}
      />
      <ArchitectField
        name="introductionPanel.text"
        component={RichText}
        label="Introduction text"
        validation={{ required: true }}
        initialValue={textInitialValue}
      />
    </Section>
  );
};
export default IntroductionPanel;
