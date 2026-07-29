import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import AssignAttributes from '~/components/AssignAttributes';
import { Row, Section } from '~/components/EditorLayout';
import PromptText from '~/components/sections/PromptText';
type PromptFieldsProps = {
  form: string;
  stageForm?: string;
  entity: string | null;
  type: string | null;
  currentStageIndex?: number;
};
const PromptFields = ({
  form,
  stageForm,
  entity = null,
  type = null,
  currentStageIndex,
}: PromptFieldsProps) => {
  return (
    <>
      <PromptText />
      <Section
        title="Assign Additional Variables"
        summary={
          <Paragraph>
            This feature allows you to assign a variable and associated value to
            any nodes created on this prompt. You could then use this variable
            in your skip logic or stage filtering rules.
          </Paragraph>
        }
        layout="vertical"
      >
        <Row>
          {entity && type && (
            <AssignAttributes
              form={form}
              stageForm={stageForm}
              name="additionalAttributes"
              type={type}
              entity={entity as 'node' | 'edge' | 'ego'}
              currentStageIndex={currentStageIndex}
            />
          )}
        </Row>
      </Section>
    </>
  );
};
export default PromptFields;
