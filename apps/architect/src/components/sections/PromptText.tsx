import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import RichText from '~/components/Form/Fields/RichText/Field';
import ValidatedField from '~/components/Form/ValidatedField';
import { getFieldId } from '~/utils/issues';
type PromptTextProps = {
  name?: string;
};
const PromptText = ({ name = 'text' }: PromptTextProps) => {
  return (
    <Section
      id={getFieldId(name)}
      title="Prompt Text"
      summary={
        <Paragraph>
          The prompt text instructs your participant about the task on this
          stage. Enter the text to use for your prompt below.
        </Paragraph>
      }
      layout="vertical"
    >
      <Row>
        <ValidatedField
          name={name}
          component={RichText}
          inline
          label="Prompt text"
          labelHidden
          placeholder="Enter text for the prompt here..."
          validation={{ required: true }}
        />
      </Row>
    </Section>
  );
};
export default PromptText;
