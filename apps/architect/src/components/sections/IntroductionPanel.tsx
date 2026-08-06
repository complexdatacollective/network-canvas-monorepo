import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import RichText from '~/components/Form/Fields/RichText/Field';
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
      title="Introduction Panel"
      summary={
        <Paragraph>
          This panel is shown prior to completion of the forms, and should serve
          as an introduction to the task.
        </Paragraph>
      }
    >
      <Row>
        <ArchitectField
          name="introductionPanel.title"
          label="Title"
          component={InputField}
          validation={{ required: true, maxLength: 50 }}
          initialValue={titleInitialValue}
        />
      </Row>
      <Row>
        <ArchitectField
          name="introductionPanel.text"
          component={RichText}
          label="Introduction text"
          validation={{ required: true }}
          initialValue={textInitialValue}
        />
      </Row>
    </Section>
  );
};
export default IntroductionPanel;
