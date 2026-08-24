import { Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import RichText from '~/components/Form/Fields/RichText/Field';
import { getFieldId } from '~/utils/issues';

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
    <Section id={getFieldId(name)} layout="vertical">
      <ArchitectField
        name={name}
        component={RichText}
        singleLine
        label="Prompt text"
        hint="Provide instructions or context to the participant about the task you want them to complete."
        placeholder="Enter your prompt..."
        validation={{ required: true }}
        initialValue={initialValue}
      />
    </Section>
  );
};
export default PromptText;
