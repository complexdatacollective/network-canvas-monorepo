import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import RichText from '~/components/Form/Fields/RichText/Field';
import IssueAnchor from '~/components/IssueAnchor';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

const CensusPrompt = (_props: StageEditorSectionProps) => {
  const initialValue = useStageInitialValue<string>('censusPrompt');

  return (
    <Section
      title="Census Prompt"
      summary={
        <Paragraph>
          Configure the prompt shown to participants during the family building
          phase.
        </Paragraph>
      }
    >
      <>
        <IssueAnchor fieldName="censusPrompt" description="Census Prompt" />
        <ArchitectField
          name="censusPrompt"
          component={RichText}
          label="Prompt for building the family pedigree"
          labelHidden
          initialValue={initialValue}
          validation={{ required: true }}
        />
      </>
    </Section>
  );
};
export default CensusPrompt;
