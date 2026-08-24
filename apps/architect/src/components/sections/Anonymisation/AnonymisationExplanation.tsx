import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import RichText from '~/components/Form/Fields/RichText/Field';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

const AnonymisationExplanation = (_props: StageEditorSectionProps) => {
  const titleInitialValue = useStageInitialValue<string>(
    'explanationText.title',
  );
  const bodyInitialValue = useStageInitialValue<string>('explanationText.body');

  return (
    <Section
      title="Task Explanation"
      summary={
        <Paragraph>
          Use this section to explain the anonymisation process to your
          participants.
        </Paragraph>
      }
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
