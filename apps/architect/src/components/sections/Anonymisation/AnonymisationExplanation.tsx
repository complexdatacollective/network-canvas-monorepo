import type { ComponentType } from 'react';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import { RichText } from '~/components/Form/Fields';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import { FrescoReduxField, ValidatedField } from '../../Form';
import IssueAnchor from '../../IssueAnchor';

const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;

const AnonymisationExplanation = (_props: StageEditorSectionProps) => (
  <Section
    title="Task Explanation"
    summary={
      <Paragraph>
        Use this section to explain the anonymisation process to your
        participants.
      </Paragraph>
    }
  >
    <Row>
      <IssueAnchor
        fieldName="explanationText.title"
        description="Title (Anonymisation explanation panel)"
      />
      <ValidatedField
        label="Title"
        name="explanationText.title"
        component={FrescoReduxField}
        placeholder="This interview uses enhanced privacy protection"
        validation={{ required: true }}
        maxLength={50}
        componentProps={{ fieldComponent: FrescoInputField }}
      />
    </Row>
    <Row>
      <IssueAnchor
        fieldName="explanationText.body"
        description="Body (Anonymisation explanation panel)"
      />
      <ValidatedField
        label="Body"
        name="explanationText.body"
        component={RichText}
        placeholder="Enter your passphrase below, and click the 'continue' button."
        validation={{ required: true }}
      />
    </Row>
  </Section>
);
export default AnonymisationExplanation;
