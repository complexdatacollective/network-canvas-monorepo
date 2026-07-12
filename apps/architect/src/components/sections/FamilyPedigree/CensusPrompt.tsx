import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import RichText from '~/components/Form/Fields/RichText/Field';
import ValidatedField from '~/components/Form/ValidatedField';
import IssueAnchor from '~/components/IssueAnchor';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
const CensusPrompt = (_props: StageEditorSectionProps) => (
  <Section
    title="Census Prompt"
    summary={
      <Paragraph>
        Configure the prompt shown to participants during the family building
        phase.
      </Paragraph>
    }
  >
    <Row>
      <IssueAnchor fieldName="censusPrompt" description="Census Prompt" />
      <ValidatedField
        name="censusPrompt"
        component={RichText}
        componentProps={{ label: 'Prompt for building the family pedigree' }}
        validation={{ required: true }}
      />
    </Row>
  </Section>
);
export default CensusPrompt;
