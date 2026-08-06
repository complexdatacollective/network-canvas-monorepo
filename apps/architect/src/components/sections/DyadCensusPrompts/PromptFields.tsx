import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import RichText from '~/components/Form/Fields/RichText/Field';
import { getFieldId } from '~/utils/issues';

import { EntitySelectControl as EntitySelectField } from '../fields/EntitySelectField/EntitySelectField';

type PromptFieldsProps = {
  text?: string;
  createEdge?: string;
};

const PromptFields = ({ text, createEdge }: PromptFieldsProps) => (
  <Section
    title="Dyad Census Prompts"
    id={getFieldId('text')}
    layout="vertical"
  >
    <Row>
      <Paragraph>
        Dyad Census prompts explain to your participant which relationship they
        should evaluate (for example, &apos;friendship&apos;, &apos;material
        support&apos; or &apos;conflict&apos;). Enter prompt text below, and
        select an edge type that will be created when the participant answers
        &apos;yes&apos;.
      </Paragraph>
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
            either a &apos;yes&apos; or a &apos;no&apos; by the participant,
            since these are the user-interface options that are shown.
          </div>
        </AlertDescription>
      </Alert>
      <ArchitectField
        name="text"
        label="Prompt Text"
        component={RichText}
        validation={{ required: true }}
        initialValue={text}
        singleLine
        placeholder="Enter text for the prompt here..."
      />
    </Row>
    <Row>
      <ArchitectField
        name="createEdge"
        label="Create edges of the following type"
        component={EntitySelectField}
        validation={{ required: true }}
        initialValue={createEdge}
        entityType="edge"
      />
    </Row>
  </Section>
);

export default PromptFields;
