import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import ArchitectField from '~/components/Form/ArchitectField';
import RichText from '~/components/Form/Fields/RichText/Field';
import IssueAnchor from '~/components/IssueAnchor';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

const CensusPrompt = (_props: StageEditorSectionProps) => {
  const initialValue = useStageInitialValue<string>('censusPrompt');

  return (
    <Section title="Family-building prompt">
      <IssueAnchor fieldName="censusPrompt" description="Census prompt" />
      <ArchitectField
        name="censusPrompt"
        component={RichText}
        label="Census prompt"
        hint={
          <Paragraph>
            Configure the prompt shown to participants during the family
            building phase.
          </Paragraph>
        }
        initialValue={initialValue}
        validation={{ required: true }}
      />
    </Section>
  );
};
export default CensusPrompt;
