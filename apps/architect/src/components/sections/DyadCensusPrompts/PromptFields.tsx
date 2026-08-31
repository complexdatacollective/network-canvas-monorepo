import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Section from '@codaco/fresco-ui/Section';
import RichText from '@codaco/protocol-builder/fields/RichTextField';
import ArchitectField from '~/components/Form/ArchitectField';

import { EntitySelectControl as EntitySelectField } from '../fields/EntitySelectField/EntitySelectField';

type PromptFieldsProps = {
  text?: string;
  createEdge?: string;
};

const PromptFields = ({ text, createEdge }: PromptFieldsProps) => (
  <Section
    title="Prompt configuration"
    description="Write the participant prompt and select the edge type created by an affirmative response."
  >
    <Alert variant="info" className="my-7">
      <AlertDescription className="space-y-4">
        <div>
          Remember to write your prompt text to take into account that the
          participant will be looking at pairs of prompts in sequence. Use
          phrases such as &apos;
          <strong>these people</strong>
          &apos;, or &apos;
          <strong>the two people shown</strong>
          &apos; to indicate that the participant should focus on the visible
          pair.
        </div>
        <div>
          You should also phrase your prompt so that it can be answered with
          either a &apos;yes&apos; or a &apos;no&apos; by the participant, since
          these are the user-interface options that are shown.
        </div>
      </AlertDescription>
    </Alert>
    <ArchitectField
      name="text"
      label="Prompt text"
      component={RichText}
      validation={{ required: true }}
      initialValue={text}
      singleLine
      placeholder="Enter text for the prompt here..."
    />
    <ArchitectField
      name="createEdge"
      label="Created edge type"
      component={EntitySelectField}
      validation={{ required: true }}
      initialValue={createEdge}
      entityType="edge"
    />
  </Section>
);

export default PromptFields;
