import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Section from '@codaco/fresco-ui/Section';
import RichText from '@codaco/protocol-builder/fields/RichTextField';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

const AnonymisationExplanation = (_props: StageEditorSectionProps) => {
  const titleInitialValue = useStageInitialValue<string>(
    'explanationText.title',
  );
  const bodyInitialValue = useStageInitialValue<string>('explanationText.body');

  return (
    <Section
      title="Task explanation"
      description="Explain the anonymisation process to participants before they enter their passphrase."
    >
      <ArchitectField
        name="explanationText.title"
        label="Title"
        component={InputField}
        validation={{ required: true, maxLength: 50 }}
        initialValue={titleInitialValue}
        placeholder="This interview uses enhanced privacy protection"
      />
      <ArchitectField
        name="explanationText.body"
        label="Body"
        component={RichText}
        validation={{ required: true }}
        initialValue={bodyInitialValue}
        placeholder="Enter your passphrase below, and click the 'continue' button."
      />
    </Section>
  );
};
export default AnonymisationExplanation;
