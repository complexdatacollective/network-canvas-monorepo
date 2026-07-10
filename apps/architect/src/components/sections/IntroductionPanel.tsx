import type { ComponentType } from 'react';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import { Field as RichText } from '~/components/Form/Fields/RichText';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import { FrescoReduxField, ValidatedField } from '../Form';
import IssueAnchor from '../IssueAnchor';

const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;

const IntroductionPanel = (_props: StageEditorSectionProps) => {
  const summaryText =
    'This panel is shown prior to completion of the forms, and should serve as an introduction to the task.';
  return (
    <Section
      title="Introduction Panel"
      summary={<Paragraph>{summaryText}</Paragraph>}
    >
      <Row>
        <IssueAnchor
          fieldName="introductionPanel.title"
          description="Title (Introduction panel)"
        />
        <ValidatedField
          name="introductionPanel.title"
          label="Title"
          component={FrescoReduxField}
          componentProps={{ fieldComponent: FrescoInputField, maxLength: 50 }}
          validation={{ required: true }}
        />
      </Row>
      <Row>
        <IssueAnchor
          fieldName="introductionPanel.text"
          description="Text (Introduction panel)"
        />
        <ValidatedField
          name="introductionPanel.text"
          component={RichText}
          componentProps={{ label: 'Introduction text' }}
          validation={{ required: true }}
        />
      </Row>
    </Section>
  );
};
export default IntroductionPanel;
