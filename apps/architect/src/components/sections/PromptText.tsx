import Section from '@codaco/fresco-ui/Section';
import RichText from '@codaco/protocol-builder/fields/RichTextField';
import ArchitectField from '~/components/Form/ArchitectField';

type PromptTextProps = {
  name?: string;
  /**
   * The prompt's committed text. This section is reused inside per-prompt
   * dialog editors (a different `FormStoreProvider` per row, not the stage
   * form), so it cannot resolve its own initial value from stage context —
   * the caller threads through whatever it already has (the stage's
   * `useStageInitialValue`, or the dialog's own edited item).
   */
  initialValue?: string;
};

const PromptText = ({ name = 'text', initialValue }: PromptTextProps) => {
  return (
    <Section
      title="Participant prompt"
      description="Write the instruction or question participants see for this task."
    >
      <ArchitectField
        name={name}
        component={RichText}
        singleLine
        label="Prompt text"
        placeholder="Enter your prompt..."
        validation={{ required: true }}
        initialValue={initialValue}
      />
    </Section>
  );
};
export default PromptText;
