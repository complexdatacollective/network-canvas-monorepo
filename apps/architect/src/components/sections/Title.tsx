import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

const Title = (_props: StageEditorSectionProps) => {
  const initialValue = useStageInitialValue<string>('title');

  return (
    <Section layout="vertical">
      <ArchitectField
        label="Page heading"
        hint="Use the page heading to show a large title element on your information stage."
        name="title"
        component={InputField}
        placeholder="Enter your title here..."
        validation={{ required: true }}
        initialValue={initialValue}
      />
    </Section>
  );
};
export default Title;
